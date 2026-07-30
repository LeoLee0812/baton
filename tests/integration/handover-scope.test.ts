// SPEC-005 场景 5.2：**交接的可见权边界。这是整个项目最关键的一组测试。**
//
// 三条要同时成立才算真做到了「一键把该给的交出去」：
//   1. 没确认之前，接手人什么都看不到（AC-5.2.1 / AC-3.2.3）
//   2. 确认之后，勾了的能看到（AC-5.2.2 / AC-3.2.2）
//   3. 确认之后，**没勾的仍然看不到**（AC-5.2.4）—— 第 3 条是负向测试，最容易被漏掉
// 外加：交接是授予不是搬移，owner_employee_id 前后必须完全不变（AC-5.2.3）。
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ForbiddenError, getHandover, listHandoverItems, scopedQuery } from "@/lib/db";
import { confirm, detail, editItems, startHandover, submit } from "@/lib/handover";
import {
  cleanupTestData,
  createTestChunk,
  createTestEmployee,
  createTestFile,
  createTestMemory,
  fixtureVector,
} from "../helpers/db";

let A: { id: string; code: string; displayName: string };
let B: { id: string; code: string; displayName: string };
let picked: string[] = []; // 勾进交接单的两条
let unpicked: string[] = []; // 刻意不勾的两条
let pickedFileId: string;
let unpickedFileId: string;
let handoverId: string;
const V = fixtureVector(4242);

beforeAll(async () => {
  A = await createTestEmployee("前任");
  B = await createTestEmployee("接手");

  // A 名下四条记忆，只交出去两条
  const m1 = await createTestMemory(A.id, "勾选一", "交出去的内容：华岳幕墙账期月结 30 天。", {
    embedding: fixtureVector(1),
  });
  const m2 = await createTestMemory(A.id, "勾选二", "交出去的内容：华岳幕墙只收 E0 级。", {
    category: "报价底线",
    embedding: fixtureVector(2),
  });
  const m3 = await createTestMemory(A.id, "不勾一", "留着不交的内容：磐石重工的私下返点。", {
    category: "人际雷区",
    includeInHandoverDefault: false,
    embedding: fixtureVector(3),
  });
  const m4 = await createTestMemory(A.id, "不勾二", "留着不交的内容：我和采购老周的私交。", {
    category: "人际雷区",
    includeInHandoverDefault: false,
    embedding: fixtureVector(4),
  });
  picked = [m1.id, m2.id];
  unpicked = [m3.id, m4.id];

  // A 名下两份文件，只交出去一份
  const f1 = await createTestFile(A.id, "要交的报价单.txt");
  pickedFileId = f1.id;
  await createTestChunk(f1.id, A.id, 0, "要交的文件正文：华岳幕墙年框价 208 元每平米。", {
    embedding: fixtureVector(5),
  });
  const f2 = await createTestFile(A.id, "不交的私人笔记.txt");
  unpickedFileId = f2.id;
  await createTestChunk(f2.id, A.id, 0, "不交的文件正文：磐石重工的敏感谈判底牌。", {
    embedding: fixtureVector(6),
  });
}, 90000);

afterAll(async () => {
  await cleanupTestData();
}, 60000);

describe("SPEC-005 交接的可见权边界", () => {
  it("AC-5.1.1 / AC-5.1.3: 发起后是 draft，且默认勾选了 include_in_handover_default=true 的条目", async () => {
    const d = await startHandover({
      fromEmployeeId: A.id,
      toEmployeeId: B.id,
      reason: "offboard",
      note: "离职交接",
    });
    handoverId = d.handover.id;

    expect(d.handover.status).toBe("draft");
    const memIds = d.items.filter((i) => i.itemType === "memory").map((i) => i.memoryId);
    // 两条 default=true 的进来了，两条 default=false 的没进来
    expect(memIds).toEqual(expect.arrayContaining(picked));
    expect(memIds).not.toContain(unpicked[0]);
    expect(memIds).not.toContain(unpicked[1]);
    expect(d.items.every((i) => i.grantedAt === null)).toBe(true);
  });

  it("AC-5.1.4 / AC-5.1.5: 能勾原始文件，预览按类型分组给出接手人会看到什么", async () => {
    const d = await editItems(
      handoverId,
      A.id,
      [{ itemType: "file", id: pickedFileId }],
      [],
    );
    expect(d.items.filter((i) => i.itemType === "file")).toHaveLength(1);
    expect(d.preview.memoryCount).toBe(2);
    expect(d.preview.fileCount).toBe(1);
    expect(d.preview.byCategory.reduce((s, c) => s + c.count, 0)).toBe(2);
    expect(d.preview.summary).toContain(B.displayName);
    expect(d.preview.summary).toContain("可见权");
  });

  it("AC-5.2.1 / AC-3.2.3: 提交后仍是 submitted，接手人**一条都看不到**", async () => {
    const d = await submit(handoverId, A.id);
    expect(d.handover.status).toBe("submitted");
    expect(d.handover.submittedAt).toBeTruthy();

    // 接手人视角：列表里没有，直查是 403，检索也搜不到
    const bMems = await scopedQuery(B.id).memories();
    expect(bMems.map((m) => m.id)).not.toContain(picked[0]);
    await expect(scopedQuery(B.id).memory(picked[0])).rejects.toThrow(ForbiddenError);
    await expect(scopedQuery(B.id).file(pickedFileId)).rejects.toThrow(ForbiddenError);

    const hits = await scopedQuery(B.id).search("华岳幕墙", V);
    expect(hits, "交接还没确认，接手人就已经搜到了内容").toEqual([]);
  });

  it("AC-5.2.2 / AC-3.2.2: 接手人确认后，勾了的能看到，且标注了「来源：<前任> 交接」", async () => {
    const d = await confirm(handoverId, B.id);
    expect(d.handover.status).toBe("completed");
    expect(d.handover.completedAt).toBeTruthy();

    const items = await listHandoverItems(handoverId);
    expect(items.every((i) => i.grantedAt !== null), "granted_at 没有回填").toBe(true);

    const bMems = await scopedQuery(B.id).memories();
    for (const id of picked) expect(bMems.map((m) => m.id)).toContain(id);

    const got = bMems.find((m) => m.id === picked[0])!;
    expect(got.viaHandover).not.toBeNull();
    expect(got.viaHandover!.fromName).toBe(A.displayName);

    const hits = await scopedQuery(B.id).search("华岳幕墙", V);
    expect(hits.length).toBeGreaterThan(0);
    const cross = hits.find((h) => h.ownerEmployeeId === A.id);
    expect(cross, "确认后接手人应该能检索到被交接的内容").toBeDefined();
    expect(cross!.handoverNote).toContain(`来源：${A.displayName} 交接`);
  });

  it("AC-5.2.4: **负向**——没勾的内容，交接完成后接手人依然看不到", async () => {
    const bMems = await scopedQuery(B.id).memories();
    for (const id of unpicked) {
      expect(bMems.map((m) => m.id), "未勾选的条目泄漏给了接手人").not.toContain(id);
      await expect(scopedQuery(B.id).memory(id)).rejects.toThrow(ForbiddenError);
    }
    await expect(scopedQuery(B.id).file(unpickedFileId)).rejects.toThrow(ForbiddenError);

    // 只出现在未勾选内容里的关键词，接手人一条都搜不到
    const hits = await scopedQuery(B.id).search("磐石重工", V);
    expect(hits.some((h) => h.snippet.includes("磐石重工"))).toBe(false);
  });

  it("AC-5.2.3: 交接完成后，被交接内容的 owner_employee_id **完全没变**", async () => {
    // 从原主人的视角读——如果 owner 被改走了，A 自己反而会读不到
    for (const id of picked) {
      const m = await scopedQuery(A.id).memory(id);
      expect(m.ownerEmployeeId, "交接把归属搬走了——这是授予，不是搬移").toBe(A.id);
      expect(m.viaHandover).toBeNull(); // 对原主人来说不是「交接来的」
    }
    const f = await scopedQuery(A.id).file(pickedFileId);
    expect(f.ownerEmployeeId).toBe(A.id);
  });

  it("AC-5.3.3: 已完成的交接单不能再改明细（记录只增不改）", async () => {
    await expect(
      editItems(handoverId, A.id, [{ itemType: "memory", id: unpicked[0] }], []),
    ).rejects.toThrow(/不允许再改明细/);
    await expect(confirm(handoverId, B.id)).rejects.toThrow(/已经确认过/);
  });

  it("AC-5.3.2: 离职原因的交接完成后，未交接内容被标「已随账号封存」而**不是删除**", async () => {
    const h = await getHandover(handoverId);
    expect(h.reason).toBe("offboard");

    // 数据仍在，只是多了封存标记
    for (const id of unpicked) {
      const m = await scopedQuery(A.id).memory(id);
      expect(m.archivedReason).toBe("已随账号封存");
      expect(m.content.length).toBeGreaterThan(0);
    }
    // 已交接出去的那两条不该被封存
    for (const id of picked) {
      expect((await scopedQuery(A.id).memory(id)).archivedReason).toBeNull();
    }
  });

  it("AC-5.1.2: 交给自己会被拒绝", async () => {
    await expect(
      startHandover({ fromEmployeeId: A.id, toEmployeeId: A.id, reason: "daily_sync" }),
    ).rejects.toThrow(/不能是同一个人/);
  });

  it("AC-5.2.2: 与这张单无关的第三人既看不到详情，也确认不了", async () => {
    const C = await createTestEmployee("路人");
    await expect(detail(handoverId, C.id)).rejects.toThrow(ForbiddenError);
    await expect(confirm(handoverId, C.id)).rejects.toThrow(ForbiddenError);
  });
});
