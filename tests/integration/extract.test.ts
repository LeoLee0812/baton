// SPEC-004 场景 4.1：抽取。
// LLM 调用用固定 fixture 响应（02-TDD规程 §3 允许 mock 的少数几项之一），
// 但**写库是真的**——去重、出处回填、分类落库全部真跑。
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { scopedQuery } from "@/lib/db";
import { extractMemoriesFromFile } from "@/lib/extract";
import { stepIngest } from "@/lib/ingest";
import { createFile } from "@/lib/db";
import {
  cleanupTestData,
  createTestEmployee,
  fixtureVector,
  PREFIX,
} from "../helpers/db";
import { MEMORY_CATEGORIES } from "@/lib/types";

let E: { id: string; code: string };
let fileId: string;

const fakeEmbed = async (t: string[]) => t.map((_, i) => fixtureVector(i + 100));

// 固定的 LLM 响应：假装模型从文档里抽出了三条
const FIXTURE_LLM = JSON.stringify({
  memories: [
    {
      category: "客户约定",
      title: "云涛账期月结 45 天",
      content: "云涛新材料的账期是月结 45 天，续签时不要主动松口。",
      sourceChunkIndex: 0,
    },
    {
      category: "报价底线",
      title: "复合地板底价 186",
      content: "复合地板年框价 186 元每平米，满 800 平可再让 3 个点。",
      sourceChunkIndex: 1,
    },
    {
      category: "人际雷区",
      title: "别在客户面前提竞品",
      content: "这两家在同一片区抢过项目，聊天时避开竞品名字。",
      sourceChunkIndex: 1,
    },
  ],
});

const BAD_LLM = JSON.stringify({
  memories: [{ category: "我瞎编的分类", title: "x", content: "y", sourceChunkIndex: 0 }],
});

beforeAll(async () => {
  E = await createTestEmployee("抽取");
  const body =
    "## 第一节 客户\n\n云涛新材料的账期是月结 45 天，年采购额约 860 万元。\n\n" +
    "## 第二节 报价\n\n复合地板年框价 186 元每平米，满 800 平可再让 3 个点。竞品那边给到 182。";
  const f = await createFile({
    ownerEmployeeId: E.id,
    originalFilename: `${PREFIX}抽取源.md`,
    storageProvider: "inline",
    storageUrl: null,
    inlineContent: body,
    mimeType: "text/markdown",
    fileSizeBytes: body.length,
    sourceType: "md",
  });
  fileId = f.id;
  let cur = f;
  for (let i = 0; i < 10 && !["done", "failed"].includes(cur.parseStatus); i++) {
    cur = await stepIngest(fileId, { embed: fakeEmbed });
  }
  expect(cur.parseStatus).toBe("done");
}, 90000);

afterAll(async () => {
  await cleanupTestData();
}, 60000);

describe("SPEC-004 记忆条目抽取", () => {
  it("AC-4.1.1: 抽取产出的每条记忆都带 source_file_id 与 source_chunk_id", async () => {
    const r = await extractMemoriesFromFile(E.id, fileId, {
      complete: async () => FIXTURE_LLM,
      embed: fakeEmbed,
    });
    expect(r.created).toBe(3);

    const mems = await scopedQuery(E.id).memories();
    expect(mems).toHaveLength(3);
    for (const m of mems) {
      expect(m.sourceFileId).toBe(fileId);
      expect(m.sourceChunkId, `「${m.title}」没有回填 source_chunk_id`).toBeTruthy();
      expect(m.sourceLabel).toBeTruthy();
      // 出处标签必须能指回原文位置
      expect(m.sourceLabel).toContain("第");
    }
  });

  it("AC-4.1.2: 每条记忆的分类都落在五类之内", async () => {
    const mems = await scopedQuery(E.id).memories();
    for (const m of mems) expect(MEMORY_CATEGORIES).toContain(m.category);
    expect(new Set(mems.map((m) => m.category))).toEqual(
      new Set(["客户约定", "报价底线", "人际雷区"]),
    );
  });

  it("AC-4.1.4: 重复抽取同一文件不产生重复条目", async () => {
    const before = (await scopedQuery(E.id).memories()).length;
    const r = await extractMemoriesFromFile(E.id, fileId, {
      complete: async () => FIXTURE_LLM,
      embed: fakeEmbed,
    });
    const after = (await scopedQuery(E.id).memories()).length;

    expect(after).toBe(before);
    expect(r.created).toBe(0);
    expect(r.skipped).toBe(3);
  });

  it("AC-4.1.3: LLM 返回不合 schema 时抛错且**一条都不写库**", async () => {
    const before = (await scopedQuery(E.id).memories()).length;
    await expect(
      extractMemoriesFromFile(E.id, fileId, {
        complete: async () => BAD_LLM,
        embed: fakeEmbed,
      }),
    ).rejects.toThrow(/分类/);
    const after = (await scopedQuery(E.id).memories()).length;
    expect(after, "schema 不合规却写进了库").toBe(before);
  });

  it("AC-1.3.2: 拿别人的 fileId 去抽取被拒（不能借抽取绕开隔离）", async () => {
    const other = await createTestEmployee("旁人");
    await expect(
      extractMemoriesFromFile(other.id, fileId, {
        complete: async () => FIXTURE_LLM,
        embed: fakeEmbed,
      }),
    ).rejects.toThrow(/不属于你/);
  });
});
