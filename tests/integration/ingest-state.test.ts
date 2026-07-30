// SPEC-002 场景 2.3：摄取状态机、断点续传、去重。真写 Supabase。
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  countChunks,
  createFile,
  getFileForProcessing,
  markChunkEmbeddingFailed,
  pendingChunks,
  scopedQuery,
  setChunkEmbedding,
  updateFileState,
} from "@/lib/db";
import { stepIngest } from "@/lib/ingest";
import { cleanupTestData, createTestEmployee, fixtureVector, PREFIX } from "../helpers/db";

let E: { id: string; code: string };

// 集成测试里不打真实 embedding API（02-TDD规程 §3 允许 mock 的少数几项之一），
// 但解析、切片、入库全部真跑。
const fakeEmbed = async (texts: string[]) => texts.map((_, i) => fixtureVector(i + 1));
const failingEmbed = async () => {
  throw new Error("模拟 embedding 接口 500");
};

beforeAll(async () => {
  E = await createTestEmployee("摄取");
}, 60000);

afterAll(async () => {
  await cleanupTestData();
}, 60000);

async function newInlineFile(name: string, sourceType: string, content: string) {
  return createFile({
    ownerEmployeeId: E.id,
    originalFilename: `${PREFIX}${name}`,
    storageProvider: "inline",
    storageUrl: null,
    inlineContent: content,
    mimeType: "text/plain",
    fileSizeBytes: content.length,
    sourceType,
  });
}

describe("SPEC-002 摄取状态机", () => {
  it("AC-2.1.1: 建档后 parse_status 是 pending，总片数为 0", async () => {
    const f = await newInlineFile("新建.txt", "txt", "# 标题\n\n一些内容。");
    expect(f.parseStatus).toBe("pending");
    expect(f.totalChunks).toBe(0);
  });

  it("AC-2.3.1: 状态严格按 pending → parsing → chunking → embedding → done 单向流转", async () => {
    const body = Array.from({ length: 12 }, (_, i) => `## 第${i + 1}节\n\n这是第${i + 1}节的正文内容，用于生成足够多的切片。`).join("\n\n");
    const f = await newInlineFile("状态机.md", "md", body);

    const seen: string[] = [f.parseStatus];
    let cur = f;
    for (let i = 0; i < 30 && !["done", "failed"].includes(cur.parseStatus); i++) {
      cur = await stepIngest(cur.id, { embed: fakeEmbed });
      if (seen.at(-1) !== cur.parseStatus) seen.push(cur.parseStatus);
    }

    expect(cur.parseStatus).toBe("done");
    // 出现过的状态必须是这条链的子序列，⛔ 不许回退
    const ORDER = ["pending", "parsing", "chunking", "embedding", "done"];
    const idx = seen.map((s) => ORDER.indexOf(s));
    expect(idx.every((v) => v >= 0)).toBe(true);
    for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThan(idx[i - 1]);
    expect(seen).toContain("done");

    const counts = await countChunks(cur.id);
    expect(counts.total).toBeGreaterThan(0);
    expect(counts.embedded).toBe(counts.total);
    expect(cur.totalChunks).toBe(counts.total);
  });

  it("AC-2.3.3: 同一份文件重复处理不产生重复 chunk", async () => {
    const body = "## 甲\n\n第一节内容。\n\n## 乙\n\n第二节内容。";
    const f = await newInlineFile("去重.md", "md", body);

    let cur = f;
    for (let i = 0; i < 10 && !["done", "failed"].includes(cur.parseStatus); i++) {
      cur = await stepIngest(cur.id, { embed: fakeEmbed });
    }
    const first = await countChunks(f.id);
    expect(first.total).toBeGreaterThan(0);

    // 把状态倒回 pending 再跑一遍，模拟「用户点了继续处理 / 重复触发」
    await updateFileState(f.id, { parseStatus: "pending" });
    let again = (await getFileForProcessing(f.id)).file;
    for (let i = 0; i < 10 && !["done", "failed"].includes(again.parseStatus); i++) {
      again = await stepIngest(f.id, { embed: fakeEmbed });
    }
    const second = await countChunks(f.id);
    expect(second.total).toBe(first.total);
  });

  it("AC-2.3.2: embedding 失败时 chunk 仍然留在库里、embedding 为 NULL，且可以补跑", async () => {
    const body = "## 甲\n\n失败路径的第一节内容。\n\n## 乙\n\n失败路径的第二节内容。";
    const f = await newInlineFile("补跑.md", "md", body);

    // 先跑到切片落库
    let cur = f;
    for (let i = 0; i < 5 && cur.parseStatus !== "embedding"; i++) {
      cur = await stepIngest(cur.id, { embed: failingEmbed });
    }
    const total = (await countChunks(f.id)).total;
    expect(total).toBeGreaterThan(0);

    // embedding 阶段整批失败
    cur = await stepIngest(f.id, { embed: failingEmbed });
    const after = await countChunks(f.id);
    expect(after.total, "⛔ chunk 不许被丢弃").toBe(total);
    expect(after.embedded).toBe(0);
    expect(cur.parseStatus).not.toBe("done");

    // 换成能用的 embed 补跑，应该能补齐
    for (let i = 0; i < 10 && !["done", "failed"].includes(cur.parseStatus); i++) {
      cur = await stepIngest(f.id, { embed: fakeEmbed });
    }
    const fixed = await countChunks(f.id);
    expect(fixed.embedded).toBe(fixed.total);
    expect(cur.parseStatus).toBe("done");
  });

  it("AC-2.2.5: 疑似扫描件的 PDF 转 failed 并写明原因，⛔ 不许静默成功", async () => {
    const b64 = readFileSync(join(process.cwd(), "tests/fixtures/scanned.pdf")).toString("base64");
    const f = await newInlineFile("扫描件.pdf", "pdf", b64);

    const after = await stepIngest(f.id, { embed: fakeEmbed });
    expect(after.parseStatus).toBe("failed");
    expect(after.parseError).toContain("扫描件");
    expect(after.parseError).toContain("OCR");
    expect((await countChunks(f.id)).total).toBe(0);
  });

  it("AC-2.2.1: 走完整流程的真 PDF，切片带真页码，能被自己检索到", async () => {
    const b64 = readFileSync(join(process.cwd(), "tests/fixtures/sample.pdf")).toString("base64");
    const f = await newInlineFile("真PDF.pdf", "pdf", b64);

    let cur = f;
    for (let i = 0; i < 15 && !["done", "failed"].includes(cur.parseStatus); i++) {
      cur = await stepIngest(cur.id, { embed: fakeEmbed });
    }
    expect(cur.parseStatus).toBe("done");
    expect(cur.pageCount).toBe(3);

    const chunks = await scopedQuery(E.id).chunks(f.id);
    const marker = chunks.find((c) => c.content.includes("HONGYUAN-JIANCAI-2026"));
    expect(marker, "只出现在第 2 页的标记词没有入库").toBeDefined();
    expect(marker!.pageNo).toBe(2);
    expect(marker!.pageLabel).toBe("第 2 页");

    const hits = await scopedQuery(E.id).search("HONGYUAN-JIANCAI-2026", fixtureVector(777));
    const hit = hits.find((h) => h.itemId === marker!.id);
    expect(hit).toBeDefined();
    expect(hit!.pageLabel).toBe("第 2 页");
  });

  it("AC-2.3.2: 单条 chunk 连续失败 5 次后标 failed，⛔ 不卡死整份文件", async () => {
    const f = await newInlineFile("重试.md", "md", "## 甲\n\n重试计数验证用内容。");
    let cur = f;
    for (let i = 0; i < 5 && cur.parseStatus !== "embedding"; i++) {
      cur = await stepIngest(cur.id, { embed: fakeEmbed });
    }
    const pend = await pendingChunks(f.id, 10);
    expect(pend.length).toBeGreaterThan(0);

    const target = pend[0];
    for (let i = 0; i < 5; i++) await markChunkEmbeddingFailed(target.id, i);
    const stillPending = await pendingChunks(f.id, 10);
    expect(stillPending.map((c) => c.id)).not.toContain(target.id);

    // 其余 chunk 照常能写向量，整份文件不被这一条拖死
    for (const c of stillPending) await setChunkEmbedding(c.id, fixtureVector(5));
    cur = await stepIngest(f.id, { embed: fakeEmbed });
    expect(["embedding", "done"]).toContain(cur.parseStatus);
  });
});
