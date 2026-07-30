// SPEC-004 场景 4.2：编辑与三个开关。真写 Supabase。
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ForbiddenError, scopedQuery } from "@/lib/db";
import { cleanupTestData, createTestEmployee, createTestMemory } from "../helpers/db";

let E: { id: string; code: string };
let editableId: string;
let lockedId: string;

beforeAll(async () => {
  E = await createTestEmployee("编辑");
  const a = await createTestMemory(E.id, "可改的条目", "原始正文内容。");
  editableId = a.id;
  const b = await createTestMemory(E.id, "锁定的条目", "这条不许改。", { isEditable: false });
  lockedId = b.id;
}, 60000);

afterAll(async () => {
  await cleanupTestData();
}, 60000);

describe("SPEC-004 记忆条目编辑与开关", () => {
  it("AC-4.2.1: 改正文后持久化，且 updated_at 变新", async () => {
    const before = await scopedQuery(E.id).memory(editableId);
    await new Promise((r) => setTimeout(r, 1100)); // 让 updated_at 有可比的差值

    const after = await scopedQuery(E.id).updateMemory(editableId, {
      content: "改过之后的正文：账期改成月结 30 天。",
    });
    expect(after.content).toContain("月结 30 天");

    // 重新读一次，确认是真的落库了而不是只改了返回值
    const reread = await scopedQuery(E.id).memory(editableId);
    expect(reread.content).toBe(after.content);
    expect(new Date(reread.updatedAt).getTime()).toBeGreaterThan(
      new Date(before.updatedAt).getTime(),
    );
  });

  it("AC-4.2.2: 三个开关各自独立，切换后立即持久化", async () => {
    const m0 = await scopedQuery(E.id).memory(editableId);

    await scopedQuery(E.id).updateMemory(editableId, { visibleToColleagues: !m0.visibleToColleagues });
    const m1 = await scopedQuery(E.id).memory(editableId);
    expect(m1.visibleToColleagues).toBe(!m0.visibleToColleagues);
    // 只动了一个开关，另外两个不许被带着变
    expect(m1.isEditable).toBe(m0.isEditable);
    expect(m1.includeInHandoverDefault).toBe(m0.includeInHandoverDefault);

    await scopedQuery(E.id).updateMemory(editableId, {
      includeInHandoverDefault: !m0.includeInHandoverDefault,
    });
    const m2 = await scopedQuery(E.id).memory(editableId);
    expect(m2.includeInHandoverDefault).toBe(!m0.includeInHandoverDefault);
    expect(m2.visibleToColleagues).toBe(m1.visibleToColleagues);
  });

  it("AC-4.2.3: is_editable=false 时，**服务端**拒绝改正文（前端拦截不算数）", async () => {
    await expect(
      scopedQuery(E.id).updateMemory(lockedId, { content: "偷偷改一下" }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      scopedQuery(E.id).updateMemory(lockedId, { title: "偷偷改标题" }),
    ).rejects.toThrow(/锁定/);

    // 内容确实没被动过
    const still = await scopedQuery(E.id).memory(lockedId);
    expect(still.content).toBe("这条不许改。");
  });

  it("AC-4.2.3: 锁定状态下仍可以切换开关本身（否则就永远解不开锁了）", async () => {
    await scopedQuery(E.id).updateMemory(lockedId, { isEditable: true });
    const unlocked = await scopedQuery(E.id).memory(lockedId);
    expect(unlocked.isEditable).toBe(true);

    // 解锁后正文就能改了
    await scopedQuery(E.id).updateMemory(lockedId, { content: "解锁后改的内容。" });
    expect((await scopedQuery(E.id).memory(lockedId)).content).toBe("解锁后改的内容。");
  });

  it("AC-4.2.4: 按类型筛选只返回该类型的条目", async () => {
    await createTestMemory(E.id, "供应商的条目", "恒美板材是唯一稳定供 E0 的。", {
      category: "供应商渠道",
    });
    const all = await scopedQuery(E.id).memories();
    const only = await scopedQuery(E.id).memories("供应商渠道");

    expect(only.length).toBeGreaterThan(0);
    expect(only.length).toBeLessThan(all.length);
    expect(only.every((m) => m.category === "供应商渠道")).toBe(true);
  });
});
