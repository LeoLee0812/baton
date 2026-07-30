// 交接的业务逻辑层。**项目的心脏。**
//
// 一句话说清这里在干什么：交接 = 授予可见权，⛔ 不是搬走数据。
// 所以本文件从头到尾都不会去改 bt_memories / bt_files 的 owner_employee_id（AC-5.2.3），
// 生效的唯一动作是给 bt_handover_items 盖 granted_at + 把单据置为 completed。
//
// 状态机：draft → submitted → viewed → completed
//         只有 completed 才开放访问（AC-5.2.1 / AC-5.2.3）。

import {
  BatonError,
  ForbiddenError,
  addHandoverItems,
  archiveUnhandedMemories,
  createHandover,
  getEmployeeById,
  getHandover,
  grantHandoverItems,
  listHandoverItems,
  removeHandoverItems,
  scopedQuery,
  setEmployeeStatus,
  setHandoverStatus,
} from "./db";
import {
  HANDOVER_REASON_LABEL,
  type HandoverItemRecord,
  type HandoverReason,
  type HandoverRecord,
  type MemoryCategory,
} from "./types";

export interface HandoverDetail {
  handover: HandoverRecord;
  items: HandoverItemRecord[];
  preview: HandoverPreview;
  /** 三步进度条：已发起 → 对方已查看 → 对方已确认 */
  steps: Array<{ label: string; done: boolean; at: string | null }>;
}

export interface HandoverPreview {
  memoryCount: number;
  fileCount: number;
  byCategory: Array<{ category: string; count: number }>;
  fileNames: string[];
  summary: string;
}

/**
 * 发起一张交接单，并自动带入默认勾选（AC-5.1.1 / AC-5.1.2 / AC-5.1.3）。
 * 默认勾选 = 发起人名下所有 include_in_handover_default = true 且**自己拥有**的记忆条目。
 * ⛔ 交接来的条目不能再转交（那会绕开原主人的控制）。
 */
export async function startHandover(input: {
  fromEmployeeId: string;
  toEmployeeId: string;
  reason: HandoverReason;
  note?: string | null;
}): Promise<HandoverDetail> {
  if (input.fromEmployeeId === input.toEmployeeId) {
    throw new BatonError("交接的双方不能是同一个人");
  }
  await getEmployeeById(input.toEmployeeId); // 不存在会抛 404

  const handover = await createHandover(input);

  const mine = await scopedQuery(input.fromEmployeeId).memories();
  const defaults = mine.filter(
    (m) => !m.viaHandover && m.includeInHandoverDefault && !m.archivedReason,
  );
  if (defaults.length) {
    await addHandoverItems(
      handover.id,
      defaults.map((m) => ({ itemType: "memory" as const, id: m.id, includedBy: "default" as const })),
    );
  }
  return detail(handover.id, input.fromEmployeeId);
}

/** 只有发起人和接手人能看这张单 */
async function assertParty(handoverId: string, employeeId: string): Promise<HandoverRecord> {
  const h = await getHandover(handoverId);
  if (h.fromEmployeeId !== employeeId && h.toEmployeeId !== employeeId) {
    throw new ForbiddenError("这张交接单与你无关");
  }
  return h;
}

export async function detail(handoverId: string, employeeId: string): Promise<HandoverDetail> {
  const handover = await assertParty(handoverId, employeeId);
  const items = await listHandoverItems(handoverId);
  const [from, to] = await Promise.all([
    getEmployeeById(handover.fromEmployeeId),
    getEmployeeById(handover.toEmployeeId),
  ]);
  return {
    handover: { ...handover, fromName: from.displayName, toName: to.displayName },
    items,
    preview: buildPreview(items, to.displayName, HANDOVER_REASON_LABEL[handover.reason]),
    steps: [
      { label: "已发起", done: !!handover.submittedAt, at: handover.submittedAt },
      { label: "对方已查看", done: !!handover.viewedAt, at: handover.viewedAt },
      { label: "对方已确认", done: !!handover.completedAt, at: handover.completedAt },
    ],
  };
}

/** 「接手人会看到什么」的摘要（AC-5.1.5） */
export function buildPreview(
  items: HandoverItemRecord[],
  toName: string,
  reasonLabel: string,
): HandoverPreview {
  const memories = items.filter((i) => i.itemType === "memory");
  const files = items.filter((i) => i.itemType === "file");
  const counts = new Map<string, number>();
  for (const m of memories) {
    const c = (m.category as MemoryCategory | undefined) ?? "未分类";
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const byCategory = Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return {
    memoryCount: memories.length,
    fileCount: files.length,
    byCategory,
    fileNames: files.map((f) => f.label ?? "（未命名文件）"),
    summary:
      memories.length + files.length === 0
        ? "这张单目前一条都没勾，提交后对方什么也看不到。"
        : `${reasonLabel}：将把 ${memories.length} 条记忆条目、${files.length} 份原始文件的**可见权**授予 ${toName}。` +
          `对方确认后才生效；未勾选的内容对方依然看不到；原始归属不变。`,
  };
}

/** 增删勾选。已提交的单不许再改明细（AC-5.3.3 的一半） */
export async function editItems(
  handoverId: string,
  employeeId: string,
  add: Array<{ itemType: "memory" | "file"; id: string }>,
  remove: Array<{ itemType: "memory" | "file"; id: string }>,
): Promise<HandoverDetail> {
  const h = await assertParty(handoverId, employeeId);
  if (h.fromEmployeeId !== employeeId) throw new ForbiddenError("只有发起人能修改勾选");
  if (h.status !== "draft") {
    throw new BatonError(`交接单已是「${h.status}」状态，不允许再改明细`);
  }

  // 只能勾自己拥有的东西
  const q = scopedQuery(employeeId);
  for (const a of add) {
    if (a.itemType === "memory") {
      const m = await q.memory(a.id);
      if (m.viaHandover) throw new ForbiddenError("交接来的条目不能再转交给第三人");
    } else {
      const f = await q.file(a.id);
      if (f.viaHandover) throw new ForbiddenError("交接来的文件不能再转交给第三人");
    }
  }

  if (remove.length) await removeHandoverItems(handoverId, remove);
  const memAdds = add.filter((a) => a.itemType === "memory");
  const fileAdds = add.filter((a) => a.itemType === "file");
  if (memAdds.length) await addHandoverItems(handoverId, memAdds);
  if (fileAdds.length) await addHandoverItems(handoverId, fileAdds);

  return detail(handoverId, employeeId);
}

/** 提交：置 submitted。此刻接手人**尚不能**访问任何内容（AC-5.2.1） */
export async function submit(handoverId: string, employeeId: string): Promise<HandoverDetail> {
  const h = await assertParty(handoverId, employeeId);
  if (h.fromEmployeeId !== employeeId) throw new ForbiddenError("只有发起人能提交");
  if (h.status !== "draft") throw new BatonError(`只有草稿状态能提交，当前是「${h.status}」`);
  const items = await listHandoverItems(handoverId);
  if (items.length === 0) throw new BatonError("一条都没勾，交接单不能提交");

  await setHandoverStatus(handoverId, "submitted", "submitted_at");
  return detail(handoverId, employeeId);
}

/** 接手人打开即记 viewed（三步进度条的中间那步） */
export async function markViewed(handoverId: string, employeeId: string): Promise<HandoverDetail> {
  const h = await assertParty(handoverId, employeeId);
  if (h.toEmployeeId === employeeId && h.status === "submitted") {
    await setHandoverStatus(handoverId, "viewed", "viewed_at");
  }
  return detail(handoverId, employeeId);
}

/**
 * 接手人确认：置 completed + 给每条明细盖 granted_at，此后接手人才能访问被勾选内容（AC-5.2.2）。
 * ⛔ 这里不改任何 owner_employee_id。
 */
export async function confirm(handoverId: string, employeeId: string): Promise<HandoverDetail> {
  const h = await assertParty(handoverId, employeeId);
  if (h.toEmployeeId !== employeeId) throw new ForbiddenError("只有接手人能确认");
  if (h.status === "completed") throw new BatonError("这张交接单已经确认过了");
  if (!["submitted", "viewed"].includes(h.status)) {
    throw new BatonError(`交接单还没提交（当前「${h.status}」），无法确认`);
  }

  await grantHandoverItems(handoverId);
  // 接手人往往直接在待确认列表里点「确认接收」，不会先点一下「查看」。
  // 这时候 viewed_at 是 null，三步进度条就成了 ✓ ✗ ✓——中间那步空着，读起来像出了错。
  // 语义上也说不通：都确认了，怎么可能没看过。这里补上（AC-5.2.5）。
  if (!h.viewedAt) await setHandoverStatus(handoverId, "viewed", "viewed_at");
  await setHandoverStatus(handoverId, "completed", "completed_at");

  // 离职原因的交接完成后，把发起人未交接的内容标「已随账号封存」（AC-5.3.2，⛔ 不删数据）
  if (h.reason === "offboard") {
    await setEmployeeStatus(h.fromEmployeeId, "offboarded");
    await archiveUnhandedMemories(h.fromEmployeeId);
  }
  return detail(handoverId, employeeId);
}
