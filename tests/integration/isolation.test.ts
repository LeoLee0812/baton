// SPEC-001 场景 1.3 + SPEC-003 场景 3.2：**跨人数据隔离的负向测试。**
//
// 这是整个项目最重要的一组测试。Leo-hub 的 RLS 是 using(true) 全开的，
// 数据库层没有任何隔离能力——如果 lib/db.ts 的 scopedQuery 漏了一处，
// 「每个人只看得见自己的资料」这个核心卖点当场破产。
// ⛔ 这里真连 Supabase，不 mock。
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ForbiddenError, scopedQuery } from "@/lib/db";
import {
  cleanupTestData,
  createTestChunk,
  createTestEmployee,
  createTestFile,
  createTestMemory,
  fixtureVector,
} from "../helpers/db";

let A: { id: string; code: string };
let B: { id: string; code: string };
let bFileId: string;
let bMemoryId: string;

beforeAll(async () => {
  A = await createTestEmployee("甲");
  B = await createTestEmployee("乙");

  const aFile = await createTestFile(A.id, "甲的报价单.txt");
  await createTestChunk(A.id === A.id ? aFile.id : aFile.id, A.id, 0, "甲方独有的客户是天穹幕墙。", {
    embedding: fixtureVector(1),
  });
  await createTestMemory(A.id, "甲的约定", "天穹幕墙账期月结 30 天。", {
    embedding: fixtureVector(2),
  });

  const bFile = await createTestFile(B.id, "乙的合同.txt");
  bFileId = bFile.id;
  await createTestChunk(bFile.id, B.id, 0, "乙方独有的客户是砺石重工，报价 999 元。", {
    embedding: fixtureVector(3),
  });
  const bMem = await createTestMemory(B.id, "乙的约定", "砺石重工只接受预付款。", {
    visibleToColleagues: true, // 刻意开着：验证「同事可问到」不等于「同事能在知识库里看到」
    embedding: fixtureVector(4),
  });
  bMemoryId = bMem.id;
}, 60000);

afterAll(async () => {
  await cleanupTestData();
}, 60000);

describe("SPEC-001/003 跨人数据隔离", () => {
  it("AC-1.3.1: 员工 A 的文件列表里不含任何员工 B 的文件", async () => {
    const files = await scopedQuery(A.id).files();
    expect(files.length).toBeGreaterThan(0);
    expect(files.every((f) => f.ownerEmployeeId === A.id)).toBe(true);
    expect(files.map((f) => f.id)).not.toContain(bFileId);
  });

  it("AC-1.3.1: 员工 A 的记忆条目列表里不含任何员工 B 的条目，即使那条开了 visible_to_colleagues", async () => {
    const mems = await scopedQuery(A.id).memories();
    expect(mems.length).toBeGreaterThan(0);
    expect(mems.every((m) => m.ownerEmployeeId === A.id)).toBe(true);
    // 这一条是最容易写错的地方：visible_to_colleagues 只在跨人提问路径生效，
    // ⛔ 不能让同事直接在自己的知识库页面里看到别人的条目。
    expect(mems.map((m) => m.id)).not.toContain(bMemoryId);
  });

  it("AC-1.3.2: A 显式拿 B 的 fileId 去查，返回 403 而不是数据", async () => {
    await expect(scopedQuery(A.id).file(bFileId)).rejects.toThrow(ForbiddenError);
    await expect(scopedQuery(A.id).file(bFileId)).rejects.toThrow(/不属于你/);
  });

  it("AC-1.3.2: A 显式拿 B 的 memoryId 去查，返回 403 而不是数据", async () => {
    await expect(scopedQuery(A.id).memory(bMemoryId)).rejects.toThrow(ForbiddenError);
  });

  it("AC-1.3.2: A 拿 B 的 fileId 去要切片，同样被拒", async () => {
    await expect(scopedQuery(A.id).chunks(bFileId)).rejects.toThrow(ForbiddenError);
  });

  it("AC-3.2.1: A 检索 B 独有的关键词，一条都搜不到", async () => {
    const hits = await scopedQuery(A.id).search("砺石重工", fixtureVector(3));
    expect(hits.every((h) => h.ownerEmployeeId === A.id)).toBe(true);
    expect(hits.some((h) => h.snippet.includes("砺石重工"))).toBe(false);
  });

  it("AC-3.2.1: 反过来 B 也搜不到 A 独有的关键词（隔离是双向的）", async () => {
    const hits = await scopedQuery(B.id).search("天穹幕墙", fixtureVector(1));
    expect(hits.every((h) => h.ownerEmployeeId === B.id)).toBe(true);
    expect(hits.some((h) => h.snippet.includes("天穹幕墙"))).toBe(false);
  });

  it("AC-1.3.1: A 只能改自己的记忆条目，改 B 的直接 403", async () => {
    await expect(
      scopedQuery(A.id).updateMemory(bMemoryId, { content: "越权改写" }),
    ).rejects.toThrow(ForbiddenError);
  });
});
