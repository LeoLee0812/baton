// SPEC-005 场景 5.1 / 5.3：发起、勾选增删、三步进度、记录查询。
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ForbiddenError, listHandovers } from "@/lib/db";
import { confirm, detail, editItems, markViewed, startHandover, submit } from "@/lib/handover";
import {
  cleanupTestData,
  createTestEmployee,
  createTestFile,
  createTestMemory,
} from "../helpers/db";

let A: { id: string; code: string; displayName: string };
let B: { id: string; code: string; displayName: string };
let memDefault: string;
let memManual: string;
let fileId: string;

beforeAll(async () => {
  A = await createTestEmployee("流程甲");
  B = await createTestEmployee("流程乙");
  memDefault = (await createTestMemory(A.id, "默认进单", "默认勾选的条目内容。")).id;
  memManual = (
    await createTestMemory(A.id, "手动加的", "默认不进单的条目内容。", {
      category: "流程习惯",
      includeInHandoverDefault: false,
    })
  ).id;
  fileId = (await createTestFile(A.id, "流程用文件.txt")).id;
}, 60000);

afterAll(async () => {
  await cleanupTestData();
}, 60000);

describe("SPEC-005 交接流程", () => {
  it("AC-5.1.3: 默认勾选只包含 include_in_handover_default=true 的条目，included_by 标 default", async () => {
    const d = await startHandover({
      fromEmployeeId: A.id,
      toEmployeeId: B.id,
      reason: "role_change",
    });
    const mems = d.items.filter((i) => i.itemType === "memory");
    expect(mems.map((m) => m.memoryId)).toEqual([memDefault]);
    expect(mems[0].includedBy).toBe("default");
  });

  it("AC-5.1.3 / AC-5.1.4: 可以逐条增删，手动加的标 manual_add，重复添加不产生重复明细", async () => {
    const d0 = await startHandover({
      fromEmployeeId: A.id,
      toEmployeeId: B.id,
      reason: "daily_sync",
    });
    const id = d0.handover.id;

    const d1 = await editItems(
      id,
      A.id,
      [
        { itemType: "memory", id: memManual },
        { itemType: "file", id: fileId },
      ],
      [],
    );
    expect(d1.items).toHaveLength(3); // 1 默认 + 1 手动条目 + 1 文件
    expect(d1.items.find((i) => i.memoryId === memManual)!.includedBy).toBe("manual_add");

    // 再加一次同样的，不该变多
    const d2 = await editItems(id, A.id, [{ itemType: "memory", id: memManual }], []);
    expect(d2.items).toHaveLength(3);

    // 移掉默认那条
    const d3 = await editItems(id, A.id, [], [{ itemType: "memory", id: memDefault }]);
    expect(d3.items).toHaveLength(2);
    expect(d3.items.map((i) => i.memoryId)).not.toContain(memDefault);
  });

  it("AC-5.2.1: 一条都没勾的交接单不能提交", async () => {
    const d = await startHandover({
      fromEmployeeId: B.id, // B 名下没有任何条目，所以默认勾选为空
      toEmployeeId: A.id,
      reason: "daily_sync",
    });
    expect(d.items).toHaveLength(0);
    await expect(submit(d.handover.id, B.id)).rejects.toThrow(/一条都没勾/);
  });

  it("AC-5.2.5: 三步进度按「已发起 → 对方已查看 → 对方已确认」依次点亮", async () => {
    const d0 = await startHandover({
      fromEmployeeId: A.id,
      toEmployeeId: B.id,
      reason: "role_change",
    });
    const id = d0.handover.id;
    expect(d0.steps.map((s) => s.label)).toEqual(["已发起", "对方已查看", "对方已确认"]);
    expect(d0.steps.map((s) => s.done)).toEqual([false, false, false]);

    const d1 = await submit(id, A.id);
    expect(d1.steps.map((s) => s.done)).toEqual([true, false, false]);

    const d2 = await markViewed(id, B.id);
    expect(d2.handover.status).toBe("viewed");
    expect(d2.steps.map((s) => s.done)).toEqual([true, true, false]);

    const d3 = await confirm(id, B.id);
    expect(d3.steps.map((s) => s.done)).toEqual([true, true, true]);
    // 每一步的时间戳都要真的落下来
    for (const s of d3.steps) expect(s.at).toBeTruthy();
  });

  it("AC-5.2.5: 接手人不点「查看」直接确认时，「对方已查看」这一步也要点亮", async () => {
    // 真实操作路径就是这样的：待确认列表里直接点「确认接收」，根本不会先点「查看」。
    // 如果 viewed_at 保持 null，三步进度条就变成 ✓ ✗ ✓ —— 中间那步空着，读起来像出了错。
    // 语义上也说不通：你都确认了，怎么可能没看过。
    const d = await startHandover({
      fromEmployeeId: A.id,
      toEmployeeId: B.id,
      reason: "daily_sync",
    });
    const id = d.handover.id;
    await submit(id, A.id);

    // ⛔ 刻意跳过 markViewed
    const done = await confirm(id, B.id);

    expect(done.handover.viewedAt, "直接确认时 viewed_at 没有被补上").toBeTruthy();
    expect(done.steps.map((s) => s.done)).toEqual([true, true, true]);
    for (const s of done.steps) expect(s.at).toBeTruthy();

    // 补的时间要落在提交之后、完成之时或之前，不能是个瞎编的值
    const submitted = new Date(done.handover.submittedAt!).getTime();
    const viewed = new Date(done.handover.viewedAt!).getTime();
    const completed = new Date(done.handover.completedAt!).getTime();
    expect(viewed).toBeGreaterThanOrEqual(submitted);
    expect(viewed).toBeLessThanOrEqual(completed);
  });

  it("AC-5.1.2 / AC-5.2.2: 只有发起人能提交、只有接手人能确认", async () => {
    const d = await startHandover({
      fromEmployeeId: A.id,
      toEmployeeId: B.id,
      reason: "daily_sync",
    });
    const id = d.handover.id;

    await expect(submit(id, B.id)).rejects.toThrow(/只有发起人能提交/);
    await submit(id, A.id);
    await expect(confirm(id, A.id)).rejects.toThrow(/只有接手人能确认/);
    await expect(editItems(id, B.id, [], [])).rejects.toThrow(ForbiddenError);
  });

  it("AC-5.3.1: 记录查询返回谁交给谁、什么时候、交了几条几份", async () => {
    const rows = await listHandovers(A.id);
    expect(rows.length).toBeGreaterThan(0);
    const done = rows.find((r) => r.status === "completed");
    expect(done).toBeDefined();
    expect(done!.fromName).toBe(A.displayName);
    expect(done!.toName).toBe(B.displayName);
    expect(done!.submittedAt).toBeTruthy();
    expect(done!.completedAt).toBeTruthy();
    expect((done!.memoryCount ?? 0) + (done!.fileCount ?? 0)).toBeGreaterThan(0);
  });

  it("AC-5.2.2: 还没提交的草稿单不能被确认", async () => {
    const d = await startHandover({
      fromEmployeeId: A.id,
      toEmployeeId: B.id,
      reason: "daily_sync",
    });
    await expect(confirm(d.handover.id, B.id)).rejects.toThrow(/还没提交/);
  });

  it("AC-5.2.3: 交接来的条目不能再转交给第三人", async () => {
    const C = await createTestEmployee("流程丙");
    // A → B 完成一笔，把 memDefault 交给 B
    const d = await startHandover({
      fromEmployeeId: A.id,
      toEmployeeId: B.id,
      reason: "daily_sync",
    });
    await submit(d.handover.id, A.id);
    await confirm(d.handover.id, B.id);

    // B 再想把这条转给 C —— 必须被拒
    const d2 = await startHandover({
      fromEmployeeId: B.id,
      toEmployeeId: C.id,
      reason: "daily_sync",
    });
    await expect(
      editItems(d2.handover.id, B.id, [{ itemType: "memory", id: memDefault }], []),
    ).rejects.toThrow(/不能再转交/);

    // 详情仍然只对双方可见
    await expect(detail(d2.handover.id, A.id)).rejects.toThrow(ForbiddenError);
  });
});
