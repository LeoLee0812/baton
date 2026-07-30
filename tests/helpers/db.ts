// 集成测试的数据卫生工厂。
//
// ⛔ 绝对不要在测试里删除或修改非本次运行创建的数据 —— Leo-hub 上有 20+ 张别的项目的表在跑生产业务。
// 规则：所有测试数据的可辨识字段都必须以 RUN_ID 开头；所有 delete 都必须带 RUN_ID 条件。
// 测试文件 ⛔ 禁止绕过这些工厂函数直接 insert。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RUN_ID } from "../setup/integration";
import { normalizeText } from "@/lib/normalize";

let client: SupabaseClient | null = null;
export function testDb(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_KEY!,
      { auth: { persistSession: false } },
    );
  }
  return client;
}

/** 本次运行的前缀。所有测试数据都靠它辨识与清理。 */
export const PREFIX = `${RUN_ID}_`;

export async function createTestEmployee(name: string) {
  const code = `${PREFIX}${name}`;
  const { data, error } = await testDb()
    .from("bt_employees")
    .insert({
      employee_code: code,
      display_name: `${PREFIX}${name}`,
      title: "测试员工",
      department: "测试",
    })
    .select("*")
    .single();
  if (error) throw new Error(`建测试员工失败：${error.message}`);
  return { id: data.id as string, code, displayName: data.display_name as string };
}

export async function createTestFile(
  ownerId: string,
  filename: string,
  opts: { sourceType?: string; parseStatus?: string } = {},
) {
  const { data, error } = await testDb()
    .from("bt_files")
    .insert({
      owner_employee_id: ownerId,
      original_filename: `${PREFIX}${filename}`,
      storage_provider: "inline",
      mime_type: "text/plain",
      file_size_bytes: 1024,
      source_type: opts.sourceType ?? "txt",
      parse_status: opts.parseStatus ?? "done",
    })
    .select("*")
    .single();
  if (error) throw new Error(`建测试文件失败：${error.message}`);
  return { id: data.id as string, filename: data.original_filename as string };
}

export async function createTestChunk(
  fileId: string,
  ownerId: string,
  index: number,
  content: string,
  opts: { pageNo?: number | null; pageLabel?: string; embedding?: number[] | null } = {},
) {
  const { data, error } = await testDb()
    .from("bt_chunks")
    .insert({
      file_id: fileId,
      owner_employee_id: ownerId,
      chunk_index: index,
      page_no: opts.pageNo ?? index + 1,
      page_label: opts.pageLabel ?? `第 ${index + 1} 页`,
      content,
      content_norm: normalizeText(content),
      char_count: content.length,
      embedding: (opts.embedding ?? null) as unknown as string | null,
      embedding_status: opts.embedding ? "done" : "pending",
    })
    .select("*")
    .single();
  if (error) throw new Error(`建测试切片失败：${error.message}`);
  return { id: data.id as string };
}

export async function createTestMemory(
  ownerId: string,
  title: string,
  content: string,
  opts: {
    category?: string;
    visibleToColleagues?: boolean;
    includeInHandoverDefault?: boolean;
    isEditable?: boolean;
    sourceFileId?: string | null;
    embedding?: number[] | null;
  } = {},
) {
  const { data, error } = await testDb()
    .from("bt_memories")
    .insert({
      owner_employee_id: ownerId,
      category: opts.category ?? "客户约定",
      title: `${PREFIX}${title}`,
      content,
      source_file_id: opts.sourceFileId ?? null,
      source_label: "测试出处",
      visible_to_colleagues: opts.visibleToColleagues ?? false,
      include_in_handover_default: opts.includeInHandoverDefault ?? true,
      is_editable: opts.isEditable ?? true,
      embedding: (opts.embedding ?? null) as unknown as string | null,
    })
    .select("*")
    .single();
  if (error) throw new Error(`建测试记忆失败：${error.message}`);
  return { id: data.id as string, title: data.title as string };
}

/**
 * 固定的 fixture 向量：集成测试 ⛔ 不打真实 embedding API
 * （02-TDD规程 §3 允许 mock 的少数几项之一）。
 *
 * 用 LCG 伪随机而不是 sin 波：不同 seed 的 sin 波只是相位差，彼此高度相关，
 * 会让「不相关的查询向量」也召回目标 chunk，把 AC-3.1.1 这类测试蒙混过去。
 * LCG 出来的向量近似正交（余弦相似度 ≈ 0），才逼得出「模糊那一路必须真生效」。
 */
export function fixtureVector(seed: number): number[] {
  let s = (seed * 2654435761) >>> 0;
  const v = new Array(1536);
  for (let i = 0; i < 1536; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    v[i] = s / 4294967296 - 0.5;
  }
  const norm = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return v.map((x) => x / norm);
}

/**
 * 按 RUN_ID 前缀清理本次运行产生的数据。
 * ⛔ 每条 delete 都带前缀条件，不存在无条件删除。
 */
export async function cleanupTestData() {
  const db = testDb();
  const { data: emps } = await db
    .from("bt_employees")
    .select("id")
    .like("employee_code", `${PREFIX}%`);
  const ids = (emps ?? []).map((e) => e.id as string);
  if (ids.length === 0) return;

  // 先删依赖方，再删被依赖方（外键是 restrict）
  const { data: hs } = await db
    .from("bt_handovers")
    .select("id")
    .or(`from_employee_id.in.(${ids.join(",")}),to_employee_id.in.(${ids.join(",")})`);
  const hids = (hs ?? []).map((h) => h.id as string);
  if (hids.length) await db.from("bt_handover_items").delete().in("handover_id", hids);
  if (hids.length) await db.from("bt_handovers").delete().in("id", hids);

  await db.from("bt_agent_queries").delete().in("asking_employee_id", ids);
  await db.from("bt_memories").delete().in("owner_employee_id", ids);
  await db.from("bt_chunks").delete().in("owner_employee_id", ids);
  await db.from("bt_files").delete().in("owner_employee_id", ids);
  await db.from("bt_employees").delete().in("id", ids);
}
