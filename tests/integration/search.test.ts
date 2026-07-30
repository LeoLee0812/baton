// SPEC-003 场景 3.1：中文混合检索与出处。真连 Supabase 跑 bt_hybrid_search。
//
// 关键设计：查询向量刻意用一个**与目标 chunk 完全不相关**的 fixture 向量，
// 这样如果 pg_trgm 那一路没真的生效，中文客户名就搜不出来 —— AC-3.1.1 会真的失败，
// 而不是被向量召回蒙混过关。
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { scopedQuery } from "@/lib/db";
import {
  cleanupTestData,
  createTestChunk,
  createTestEmployee,
  createTestFile,
  createTestMemory,
  fixtureVector,
} from "../helpers/db";

let E: { id: string; code: string };
let fileName: string;

// 与所有入库向量都不相关的查询向量：靠它逼出「模糊那一路必须真生效」
const UNRELATED = fixtureVector(9999);

beforeAll(async () => {
  E = await createTestEmployee("检索");
  const f = await createTestFile(E.id, "华东客户档案.txt", { sourceType: "pdf" });
  fileName = f.filename;

  await createTestChunk(f.id, E.id, 0, "第一页：本档案收录华东区全部在跟客户的基础信息。", {
    pageNo: 1,
    pageLabel: "第 1 页",
    embedding: fixtureVector(11),
  });
  await createTestChunk(
    f.id,
    E.id,
    1,
    "第二页：客户「云涛新材料」由本人对接，年采购额约 860 万元，账期月结 45 天。",
    { pageNo: 2, pageLabel: "第 2 页", embedding: fixtureVector(12) },
  );
  await createTestChunk(f.id, E.id, 2, "第三页：附录与联系人清单，无实质条款。", {
    pageNo: 3,
    pageLabel: "第 3 页",
    embedding: fixtureVector(13),
  });
  await createTestMemory(E.id, "云涛的账期", "云涛新材料账期月结 45 天，续签时不要主动松口。", {
    embedding: fixtureVector(14),
  });
}, 60000);

afterAll(async () => {
  await cleanupTestData();
}, 60000);

describe("SPEC-003 混合检索", () => {
  it("AC-3.1.1: 搜一个中文客户名能命中，且是靠模糊那一路（查询向量与目标无关）", async () => {
    const hits = await scopedQuery(E.id).search("云涛新材料", UNRELATED);

    expect(hits.length).toBeGreaterThan(0);
    const hit = hits.find((h) => h.snippet.includes("云涛新材料"));
    expect(hit, "中文客户名没有被召回——说明 pg_trgm 那一路没生效").toBeDefined();
    // 命中它的必须是模糊分而不是向量分
    expect(hit!.trgmScore).not.toBeNull();
    expect(hit!.trgmScore!).toBeGreaterThan(0);
  });

  it("AC-3.1.4: 每条结果都带得住的出处（文件名 + page_label），第 2 页的内容标的就是第 2 页", async () => {
    const hits = await scopedQuery(E.id).search("云涛新材料", UNRELATED);
    const chunkHit = hits.find((h) => h.itemType === "chunk" && h.snippet.includes("云涛新材料"));

    expect(chunkHit).toBeDefined();
    expect(chunkHit!.fileName).toBe(fileName);
    expect(chunkHit!.pageLabel).toBe("第 2 页");
    expect(chunkHit!.pageNo).toBe(2);
    expect(chunkHit!.fileId).toBeTruthy();

    // 所有 chunk 类结果都必须有出处，一个都不能漏
    for (const h of hits.filter((x) => x.itemType === "chunk")) {
      expect(h.pageLabel, `chunk ${h.itemId} 没有出处`).toBeTruthy();
    }
  });

  it("AC-3.1.2: 结果按 RRF 融合分严格降序返回", async () => {
    const hits = await scopedQuery(E.id).search("云涛新材料 账期", UNRELATED);
    expect(hits.length).toBeGreaterThan(1);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].rrfScore).toBeGreaterThanOrEqual(hits[i].rrfScore);
    }
    // 融合分必须是正数，说明确实按 1/(60+rank) 累加过
    expect(hits[0].rrfScore).toBeGreaterThan(0);
  });

  it("AC-3.1.3: 2 个字的短查询不返回空（子串兜底必须生效）", async () => {
    // 「云涛」只有两个字，凑不出足够 trigram，默认 0.3 阈值会把它筛没
    const hits = await scopedQuery(E.id).search("云涛", UNRELATED);
    expect(hits.length, "短查询返回了空——子串兜底没生效").toBeGreaterThan(0);
    expect(hits.some((h) => h.snippet.includes("云涛"))).toBe(true);
  });

  it("AC-3.1.1: 记忆条目和文档切片都会被召回，两类结果能同时出现", async () => {
    const hits = await scopedQuery(E.id).search("账期", UNRELATED, 20);
    const types = new Set(hits.map((h) => h.itemType));
    expect(types.has("chunk")).toBe(true);
    expect(types.has("memory")).toBe(true);
  });

  it("AC-3.3.2: 搜一个库里根本没有的词，返回空数组而不是硬凑结果", async () => {
    const hits = await scopedQuery(E.id).search("量子纠缠火锅底料", UNRELATED);
    expect(hits).toEqual([]);
  });
});
