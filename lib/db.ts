// ⭐ 全站唯一的数据库入口。
//
// 铁律：任何地方都不许直接 `supabase.from('bt_...')`。
// 本项目只有 publishable key，Supabase 的 RLS 是 `using(true)` 全开的（见 docs/night/decisions.md D1），
// 也就是说数据库层**不提供任何隔离**。员工之间看不见彼此的资料，100% 靠这个文件里的
// `scopedQuery(employeeId)` 强制往每个查询注入归属过滤来保证。
// 一旦有人绕过这里直接查表，跨人数据泄漏就发生了——那是这个项目的核心卖点当场破产。
// tests/unit/db-single-entry.test.ts 用 grep 守着这条（AC-1.3.4）。
//
// 作用域定义（全站统一）：
//   我能看到的 = 我自己拥有的  ∪  已通过 status='completed' 的交接单授予给我的
//   ⛔ 不含 visible_to_colleagues 的条目——那个开关只在跨人提问路径（SPEC-006）生效。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  ChunkRecord,
  Employee,
  FileRecord,
  HandoverItemRecord,
  HandoverRecord,
  HandoverReason,
  HandoverStatus,
  MemoryCategory,
  MemoryRecord,
  SearchHit,
  AgentQueryRecord,
} from "./types";

let client: SupabaseClient | null = null;

/** 供本文件内部使用的 Supabase client。⛔ 不导出，避免被外部拿去绕过 scopedQuery。 */
function sb(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
    if (!url || !key) {
      throw new Error("Supabase 未配置：缺少 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_KEY");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

/** 业务错误：带 HTTP 状态码，便于 route handler 直接转成响应 */
export class BatonError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
    this.name = "BatonError";
  }
}

export class ForbiddenError extends BatonError {
  constructor(message = "无权访问该内容") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends BatonError {
  constructor(message = "内容不存在") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new BatonError(`${what}失败：${res.error.message}`, 500);
  if (res.data === null) throw new NotFoundError(`${what}：没有数据`);
  return res.data;
}

// ============================ 员工 ============================

/* eslint-disable @typescript-eslint/no-explicit-any */
function toEmployee(r: any): Employee {
  return {
    id: r.id,
    employeeCode: r.employee_code,
    displayName: r.display_name,
    avatarEmoji: r.avatar_emoji,
    title: r.title,
    department: r.department,
    role: r.role,
    status: r.status,
  };
}

export async function listEmployees(): Promise<Employee[]> {
  const res = await sb()
    .from("bt_employees")
    .select("*")
    .order("created_at", { ascending: true });
  return must(res, "读取员工列表").map(toEmployee);
}

export async function getEmployeeByCode(code: string): Promise<Employee> {
  const res = await sb().from("bt_employees").select("*").eq("employee_code", code).maybeSingle();
  if (res.error) throw new BatonError(`读取员工失败：${res.error.message}`, 500);
  if (!res.data) throw new NotFoundError(`员工不存在：${code}`);
  return toEmployee(res.data);
}

export async function getEmployeeById(id: string): Promise<Employee> {
  const res = await sb().from("bt_employees").select("*").eq("id", id).maybeSingle();
  if (res.error) throw new BatonError(`读取员工失败：${res.error.message}`, 500);
  if (!res.data) throw new NotFoundError(`员工不存在：${id}`);
  return toEmployee(res.data);
}

export async function setEmployeeStatus(
  employeeId: string,
  status: Employee["status"],
): Promise<void> {
  const res = await sb().from("bt_employees").update({ status }).eq("id", employeeId).select("id");
  must(res, "更新员工状态");
}

// ============================ 授予关系 ============================

interface Grant {
  itemId: string;
  fromEmployeeId: string;
  fromName: string;
  grantedAt: string;
}

/**
 * 取「已通过完成态交接授予给我」的条目 id 集合。
 * ⛔ 只认 status='completed'，其余状态（含 submitted / viewed）一律不算授予（AC-3.2.3 / AC-5.2.1）。
 */
async function grantsFor(
  employeeId: string,
  itemType: "memory" | "file",
): Promise<Map<string, Grant>> {
  const res = await sb()
    .from("bt_handover_items")
    .select(
      "memory_id, file_id, granted_at, bt_handovers!inner(id, status, to_employee_id, from_employee_id, completed_at)",
    )
    .eq("item_type", itemType)
    .eq("bt_handovers.status", "completed")
    .eq("bt_handovers.to_employee_id", employeeId);
  const rows = must(res, "读取交接授予");

  const out = new Map<string, Grant>();
  const fromIds = new Set<string>();
  for (const r of rows as any[]) {
    const h = Array.isArray(r.bt_handovers) ? r.bt_handovers[0] : r.bt_handovers;
    if (!h) continue;
    fromIds.add(h.from_employee_id);
    const id = itemType === "memory" ? r.memory_id : r.file_id;
    if (!id) continue;
    out.set(id, {
      itemId: id,
      fromEmployeeId: h.from_employee_id,
      fromName: "",
      grantedAt: r.granted_at ?? h.completed_at,
    });
  }
  if (out.size === 0) return out;

  const namesRes = await sb()
    .from("bt_employees")
    .select("id, display_name")
    .in("id", Array.from(fromIds));
  const names = new Map(
    (must(namesRes, "读取交接来源姓名") as any[]).map((e) => [e.id, e.display_name as string]),
  );
  for (const g of out.values()) g.fromName = names.get(g.fromEmployeeId) ?? "前任";
  return out;
}

function handoverNote(g: Grant | undefined): { fromName: string; grantedAt: string } | null {
  if (!g) return null;
  return { fromName: g.fromName, grantedAt: (g.grantedAt ?? "").slice(0, 10) };
}

// ============================ 作用域查询入口 ============================

function toFile(r: any, g?: Grant): FileRecord {
  return {
    id: r.id,
    ownerEmployeeId: r.owner_employee_id,
    originalFilename: r.original_filename,
    storageProvider: r.storage_provider,
    storageUrl: r.storage_url,
    mimeType: r.mime_type,
    fileSizeBytes: Number(r.file_size_bytes),
    sourceType: r.source_type,
    pageCount: r.page_count,
    parseStatus: r.parse_status,
    parseError: r.parse_error,
    totalChunks: r.total_chunks,
    embeddedChunks: r.embedded_chunks,
    uploadedAt: r.uploaded_at,
    viaHandover: handoverNote(g),
  };
}

function toMemory(r: any, g?: Grant): MemoryRecord {
  return {
    id: r.id,
    ownerEmployeeId: r.owner_employee_id,
    category: r.category,
    title: r.title,
    content: r.content,
    sourceFileId: r.source_file_id,
    sourceChunkId: r.source_chunk_id,
    sourceLabel: r.source_label,
    sourceFilename: r.bt_files?.original_filename ?? null,
    isEditable: r.is_editable,
    visibleToColleagues: r.visible_to_colleagues,
    includeInHandoverDefault: r.include_in_handover_default,
    archivedReason: r.archived_reason,
    updatedAt: r.updated_at,
    viaHandover: handoverNote(g),
  };
}

function toChunk(r: any): ChunkRecord {
  return {
    id: r.id,
    fileId: r.file_id,
    chunkIndex: r.chunk_index,
    pageNo: r.page_no,
    pageLabel: r.page_label,
    headingPath: r.heading_path,
    content: r.content,
    charCount: r.char_count,
    embeddingStatus: r.embedding_status,
  };
}

/**
 * 以某个员工的身份查询。**这是全站唯一的读写入口。**
 * 返回的每个方法都已经把归属过滤焊死在查询里，调用方无法跳过。
 */
export function scopedQuery(employeeId: string) {
  if (!employeeId) throw new BatonError("缺少员工身份", 400);

  return {
    employeeId,

    /** 我能看到的文件：自己的 + 交接授予的 */
    async files(): Promise<FileRecord[]> {
      const grants = await grantsFor(employeeId, "file");
      const ownRes = await sb()
        .from("bt_files")
        .select("*")
        .eq("owner_employee_id", employeeId)
        .order("uploaded_at", { ascending: false });
      const own = (must(ownRes, "读取文件列表") as any[]).map((r) => toFile(r));

      if (grants.size === 0) return own;
      const grantedRes = await sb()
        .from("bt_files")
        .select("*")
        .in("id", Array.from(grants.keys()))
        .neq("owner_employee_id", employeeId);
      const granted = (must(grantedRes, "读取交接来的文件") as any[]).map((r) =>
        toFile(r, grants.get(r.id)),
      );
      return [...own, ...granted];
    },

    /** 单个文件（带可见权校验），无权时抛 403 而不是返回空（AC-1.3.2） */
    async file(fileId: string): Promise<FileRecord> {
      const res = await sb().from("bt_files").select("*").eq("id", fileId).maybeSingle();
      if (res.error) throw new BatonError(`读取文件失败：${res.error.message}`, 500);
      if (!res.data) throw new NotFoundError("文件不存在");
      if (res.data.owner_employee_id !== employeeId) {
        const grants = await grantsFor(employeeId, "file");
        const g = grants.get(fileId);
        if (!g) throw new ForbiddenError("这份文件不属于你，也没有通过交接授予给你");
        return toFile(res.data, g);
      }
      return toFile(res.data);
    },

    /** 某个文件的全部切片（先过可见权） */
    async chunks(fileId: string): Promise<ChunkRecord[]> {
      await this.file(fileId);
      const res = await sb()
        .from("bt_chunks")
        .select("*")
        .eq("file_id", fileId)
        .order("chunk_index", { ascending: true });
      return (must(res, "读取切片") as any[]).map(toChunk);
    },

    /** 我能看到的记忆条目：自己的 + 交接授予的 */
    async memories(category?: MemoryCategory): Promise<MemoryRecord[]> {
      const grants = await grantsFor(employeeId, "memory");
      let q = sb()
        .from("bt_memories")
        .select("*, bt_files(original_filename)")
        .eq("owner_employee_id", employeeId);
      if (category) q = q.eq("category", category);
      const ownRes = await q.order("created_at", { ascending: true });
      const own = (must(ownRes, "读取记忆条目") as any[]).map((r) => toMemory(r));

      if (grants.size === 0) return own;
      let gq = sb()
        .from("bt_memories")
        .select("*, bt_files(original_filename)")
        .in("id", Array.from(grants.keys()))
        .neq("owner_employee_id", employeeId);
      if (category) gq = gq.eq("category", category);
      const grantedRes = await gq;
      const granted = (must(grantedRes, "读取交接来的记忆条目") as any[]).map((r) =>
        toMemory(r, grants.get(r.id)),
      );
      return [...own, ...granted];
    },

    async memory(memoryId: string): Promise<MemoryRecord> {
      const res = await sb()
        .from("bt_memories")
        .select("*, bt_files(original_filename)")
        .eq("id", memoryId)
        .maybeSingle();
      if (res.error) throw new BatonError(`读取记忆条目失败：${res.error.message}`, 500);
      if (!res.data) throw new NotFoundError("记忆条目不存在");
      if (res.data.owner_employee_id !== employeeId) {
        const grants = await grantsFor(employeeId, "memory");
        const g = grants.get(memoryId);
        if (!g) throw new ForbiddenError("这条记忆不属于你，也没有通过交接授予给你");
        return toMemory(res.data, g);
      }
      return toMemory(res.data);
    },

    /**
     * 更新一条记忆。只有**所有者本人**能改（交接授予的是可见权，不是编辑权）。
     * is_editable=false 时服务端硬拒（AC-4.2.3）——前端拦截不算数。
     */
    async updateMemory(
      memoryId: string,
      patch: Partial<{
        title: string;
        content: string;
        isEditable: boolean;
        visibleToColleagues: boolean;
        includeInHandoverDefault: boolean;
      }>,
    ): Promise<MemoryRecord> {
      const cur = await sb()
        .from("bt_memories")
        .select("owner_employee_id, is_editable")
        .eq("id", memoryId)
        .maybeSingle();
      if (cur.error) throw new BatonError(`读取记忆条目失败：${cur.error.message}`, 500);
      if (!cur.data) throw new NotFoundError("记忆条目不存在");
      if (cur.data.owner_employee_id !== employeeId) {
        throw new ForbiddenError("只有条目的所有者能修改它");
      }
      const touchesContent = patch.title !== undefined || patch.content !== undefined;
      if (touchesContent && cur.data.is_editable === false) {
        throw new ForbiddenError("这条记忆已被锁定（is_editable=false），不允许修改正文");
      }

      const row: Record<string, unknown> = {};
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.content !== undefined) row.content = patch.content;
      if (patch.isEditable !== undefined) row.is_editable = patch.isEditable;
      if (patch.visibleToColleagues !== undefined)
        row.visible_to_colleagues = patch.visibleToColleagues;
      if (patch.includeInHandoverDefault !== undefined)
        row.include_in_handover_default = patch.includeInHandoverDefault;
      if (Object.keys(row).length === 0) throw new BatonError("没有需要更新的字段");

      const res = await sb()
        .from("bt_memories")
        .update(row)
        .eq("id", memoryId)
        .eq("owner_employee_id", employeeId) // 双保险：即使上面漏了，这里也不可能改到别人的
        .select("*, bt_files(original_filename)")
        .maybeSingle();
      if (res.error) throw new BatonError(`更新记忆条目失败：${res.error.message}`, 500);
      if (!res.data) throw new NotFoundError("记忆条目不存在或无权修改");
      return toMemory(res.data);
    },

    /** 混合检索：作用域已在 SQL 函数里焊死（自己的 ∪ completed 交接授予的） */
    async search(
      queryText: string,
      queryEmbedding: number[] | null,
      matchCount = 10,
    ): Promise<SearchHit[]> {
      const res = await sb().rpc("bt_hybrid_search", {
        query_text: queryText,
        query_embedding: queryEmbedding as unknown as string | null,
        target_employee_id: employeeId,
        match_count: matchCount,
      });
      if (res.error) throw new BatonError(`检索失败：${res.error.message}`, 500);
      const rows = (res.data ?? []) as any[];
      if (rows.length === 0) return [];

      // 补文件名 + 交接来源标注
      const fileIds = Array.from(
        new Set(rows.map((r) => r.file_id).filter((x): x is string => !!x)),
      );
      const nameMap = new Map<string, string>();
      if (fileIds.length) {
        const f = await sb().from("bt_files").select("id, original_filename").in("id", fileIds);
        for (const r of (f.data ?? []) as any[]) nameMap.set(r.id, r.original_filename);
      }
      const [fileGrants, memGrants] = await Promise.all([
        grantsFor(employeeId, "file"),
        grantsFor(employeeId, "memory"),
      ]);

      return rows.map((r) => {
        let note: string | null = null;
        if (r.owner_employee_id !== employeeId) {
          const g =
            r.item_type === "memory" ? memGrants.get(r.item_id) : fileGrants.get(r.file_id ?? "");
          if (g) note = `来源：${g.fromName} 交接，${(g.grantedAt ?? "").slice(0, 10)}`;
        }
        return {
          itemType: r.item_type,
          itemId: r.item_id,
          fileId: r.file_id,
          fileName: r.file_id ? (nameMap.get(r.file_id) ?? null) : null,
          pageNo: r.page_no,
          pageLabel: r.page_label,
          title: r.title,
          snippet: r.snippet,
          ownerEmployeeId: r.owner_employee_id,
          vecScore: r.vec_score,
          trgmScore: r.trgm_score,
          rrfScore: Number(r.rrf_score),
          handoverNote: note,
        } satisfies SearchHit;
      });
    },
  };
}

// ============================ 摄取（写入路径，同样只在本文件） ============================

export async function createFile(input: {
  ownerEmployeeId: string;
  originalFilename: string;
  storageProvider: FileRecord["storageProvider"];
  storageUrl: string | null;
  inlineContent?: string | null;
  mimeType: string;
  fileSizeBytes: number;
  sourceType: string;
}): Promise<FileRecord> {
  const res = await sb()
    .from("bt_files")
    .insert({
      owner_employee_id: input.ownerEmployeeId,
      original_filename: input.originalFilename,
      storage_provider: input.storageProvider,
      storage_url: input.storageUrl,
      inline_content: input.inlineContent ?? null,
      mime_type: input.mimeType,
      file_size_bytes: input.fileSizeBytes,
      source_type: input.sourceType,
      parse_status: "pending",
    })
    .select("*")
    .single();
  return toFile(must(res, "建档"));
}

export async function getFileForProcessing(fileId: string): Promise<{
  file: FileRecord;
  inlineContent: string | null;
}> {
  const res = await sb().from("bt_files").select("*").eq("id", fileId).maybeSingle();
  if (res.error) throw new BatonError(`读取文件失败：${res.error.message}`, 500);
  if (!res.data) throw new NotFoundError("文件不存在");
  return { file: toFile(res.data), inlineContent: res.data.inline_content ?? null };
}

export async function updateFileState(
  fileId: string,
  patch: Partial<{
    parseStatus: FileRecord["parseStatus"];
    parseError: string | null;
    totalChunks: number;
    embeddedChunks: number;
    pageCount: number | null;
  }>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.parseStatus !== undefined) row.parse_status = patch.parseStatus;
  if (patch.parseError !== undefined) row.parse_error = patch.parseError;
  if (patch.totalChunks !== undefined) row.total_chunks = patch.totalChunks;
  if (patch.embeddedChunks !== undefined) row.embedded_chunks = patch.embeddedChunks;
  if (patch.pageCount !== undefined) row.page_count = patch.pageCount;
  const res = await sb().from("bt_files").update(row).eq("id", fileId).select("id");
  must(res, "更新文件状态");
}

export async function upsertChunks(
  rows: Array<{
    fileId: string;
    ownerEmployeeId: string;
    chunkIndex: number;
    pageNo: number | null;
    pageLabel: string;
    headingPath: string | null;
    content: string;
    contentNorm: string;
    charCount: number;
  }>,
): Promise<number> {
  if (!rows.length) return 0;
  // (file_id, chunk_index) 唯一约束保证重复处理不产生重复 chunk（AC-2.3.3）
  const res = await sb()
    .from("bt_chunks")
    .upsert(
      rows.map((r) => ({
        file_id: r.fileId,
        owner_employee_id: r.ownerEmployeeId,
        chunk_index: r.chunkIndex,
        page_no: r.pageNo,
        page_label: r.pageLabel,
        heading_path: r.headingPath,
        content: r.content,
        content_norm: r.contentNorm,
        char_count: r.charCount,
      })),
      { onConflict: "file_id,chunk_index" },
    )
    .select("id");
  return (must(res, "写入切片") as any[]).length;
}

export async function pendingChunks(fileId: string, limit: number) {
  const res = await sb()
    .from("bt_chunks")
    .select("id, content, embedding_retry_count")
    .eq("file_id", fileId)
    .eq("embedding_status", "pending")
    .order("chunk_index", { ascending: true })
    .limit(limit);
  return (must(res, "读取待向量化切片") as any[]).map((r) => ({
    id: r.id as string,
    content: r.content as string,
    retryCount: r.embedding_retry_count as number,
  }));
}

export async function setChunkEmbedding(chunkId: string, embedding: number[]): Promise<void> {
  const res = await sb()
    .from("bt_chunks")
    .update({ embedding: embedding as unknown as string, embedding_status: "done" })
    .eq("id", chunkId)
    .select("id");
  must(res, "写入向量");
}

/** embedding 失败：⛔ 不丢弃 chunk，只累加重试次数（AC-2.3.2） */
export async function markChunkEmbeddingFailed(
  chunkId: string,
  retryCount: number,
): Promise<void> {
  const res = await sb()
    .from("bt_chunks")
    .update({
      embedding_status: retryCount + 1 >= 5 ? "failed" : "pending",
      embedding_retry_count: retryCount + 1,
    })
    .eq("id", chunkId)
    .select("id");
  must(res, "标记向量化失败");
}

export async function countChunks(fileId: string): Promise<{ total: number; embedded: number }> {
  const all = await sb()
    .from("bt_chunks")
    .select("id", { count: "exact", head: true })
    .eq("file_id", fileId);
  const done = await sb()
    .from("bt_chunks")
    .select("id", { count: "exact", head: true })
    .eq("file_id", fileId)
    .eq("embedding_status", "done");
  return { total: all.count ?? 0, embedded: done.count ?? 0 };
}

// ============================ 记忆条目写入 ============================

export async function insertMemories(
  rows: Array<{
    ownerEmployeeId: string;
    category: MemoryCategory;
    title: string;
    content: string;
    sourceFileId: string | null;
    sourceChunkId: string | null;
    sourceLabel: string | null;
  }>,
): Promise<number> {
  if (!rows.length) return 0;
  const res = await sb()
    .from("bt_memories")
    .insert(
      rows.map((r) => ({
        owner_employee_id: r.ownerEmployeeId,
        category: r.category,
        title: r.title,
        content: r.content,
        source_file_id: r.sourceFileId,
        source_chunk_id: r.sourceChunkId,
        source_label: r.sourceLabel,
      })),
    )
    .select("id");
  return (must(res, "写入记忆条目") as any[]).length;
}

/** 已存在的 (source_chunk_id, title) 组合，用于抽取去重（AC-4.1.4） */
export async function existingMemoryKeys(
  ownerEmployeeId: string,
  fileId: string,
): Promise<Set<string>> {
  const res = await sb()
    .from("bt_memories")
    .select("source_chunk_id, title")
    .eq("owner_employee_id", ownerEmployeeId)
    .eq("source_file_id", fileId);
  return new Set(
    (must(res, "读取已有记忆条目") as any[]).map((r) => `${r.source_chunk_id ?? ""}::${r.title}`),
  );
}

export async function chunkIdsByIndex(fileId: string): Promise<Map<number, { id: string; label: string }>> {
  const res = await sb()
    .from("bt_chunks")
    .select("id, chunk_index, page_label")
    .eq("file_id", fileId)
    .order("chunk_index", { ascending: true });
  return new Map(
    (must(res, "读取切片索引") as any[]).map((r) => [
      r.chunk_index as number,
      { id: r.id as string, label: r.page_label as string },
    ]),
  );
}

// ============================ 交接 ============================

function toHandover(r: any): HandoverRecord {
  return {
    id: r.id,
    fromEmployeeId: r.from_employee_id,
    toEmployeeId: r.to_employee_id,
    reason: r.reason,
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
    submittedAt: r.submitted_at,
    viewedAt: r.viewed_at,
    completedAt: r.completed_at,
  };
}

export async function createHandover(input: {
  fromEmployeeId: string;
  toEmployeeId: string;
  reason: HandoverReason;
  note?: string | null;
}): Promise<HandoverRecord> {
  if (input.fromEmployeeId === input.toEmployeeId) {
    throw new BatonError("交接的双方不能是同一个人");
  }
  const res = await sb()
    .from("bt_handovers")
    .insert({
      from_employee_id: input.fromEmployeeId,
      to_employee_id: input.toEmployeeId,
      reason: input.reason,
      note: input.note ?? null,
      status: "draft",
    })
    .select("*")
    .single();
  return toHandover(must(res, "创建交接单"));
}

export async function getHandover(handoverId: string): Promise<HandoverRecord> {
  const res = await sb().from("bt_handovers").select("*").eq("id", handoverId).maybeSingle();
  if (res.error) throw new BatonError(`读取交接单失败：${res.error.message}`, 500);
  if (!res.data) throw new NotFoundError("交接单不存在");
  return toHandover(res.data);
}

export async function listHandovers(employeeId?: string): Promise<HandoverRecord[]> {
  let q = sb()
    .from("bt_handovers")
    .select(
      "*, from_emp:bt_employees!bt_handovers_from_employee_id_fkey(display_name), to_emp:bt_employees!bt_handovers_to_employee_id_fkey(display_name), bt_handover_items(item_type)",
    );
  if (employeeId) q = q.or(`from_employee_id.eq.${employeeId},to_employee_id.eq.${employeeId}`);
  const res = await q.order("created_at", { ascending: false });
  return (must(res, "读取交接记录") as any[]).map((r) => ({
    ...toHandover(r),
    fromName: r.from_emp?.display_name ?? "",
    toName: r.to_emp?.display_name ?? "",
    memoryCount: (r.bt_handover_items ?? []).filter((i: any) => i.item_type === "memory").length,
    fileCount: (r.bt_handover_items ?? []).filter((i: any) => i.item_type === "file").length,
  }));
}

export async function listHandoverItems(handoverId: string): Promise<HandoverItemRecord[]> {
  const res = await sb()
    .from("bt_handover_items")
    .select("*, bt_memories(title, category), bt_files(original_filename)")
    .eq("handover_id", handoverId)
    .order("created_at", { ascending: true });
  return (must(res, "读取交接明细") as any[]).map((r) => ({
    id: r.id,
    handoverId: r.handover_id,
    itemType: r.item_type,
    memoryId: r.memory_id,
    fileId: r.file_id,
    includedBy: r.included_by,
    grantedAt: r.granted_at,
    label: r.item_type === "memory" ? r.bt_memories?.title : r.bt_files?.original_filename,
    category: r.bt_memories?.category,
  }));
}

export async function addHandoverItems(
  handoverId: string,
  items: Array<{ itemType: "memory" | "file"; id: string; includedBy?: "default" | "manual_add" }>,
): Promise<number> {
  if (!items.length) return 0;
  const res = await sb()
    .from("bt_handover_items")
    .upsert(
      items.map((i) => ({
        handover_id: handoverId,
        item_type: i.itemType,
        memory_id: i.itemType === "memory" ? i.id : null,
        file_id: i.itemType === "file" ? i.id : null,
        included_by: i.includedBy ?? "manual_add",
      })),
      { onConflict: i0(items) },
    )
    .select("id");
  return (must(res, "添加交接明细") as any[]).length;
}

/** 两个部分唯一索引各管一种 item_type，upsert 冲突键要按类型选 */
function i0(items: Array<{ itemType: "memory" | "file" }>): string {
  return items[0].itemType === "memory" ? "handover_id,memory_id" : "handover_id,file_id";
}

export async function removeHandoverItems(
  handoverId: string,
  items: Array<{ itemType: "memory" | "file"; id: string }>,
): Promise<void> {
  for (const i of items) {
    const col = i.itemType === "memory" ? "memory_id" : "file_id";
    const res = await sb()
      .from("bt_handover_items")
      .delete()
      .eq("handover_id", handoverId)
      .eq(col, i.id)
      .select("id");
    if (res.error) throw new BatonError(`移除交接明细失败：${res.error.message}`, 500);
  }
}

export async function setHandoverStatus(
  handoverId: string,
  status: HandoverStatus,
  stamp: "submitted_at" | "viewed_at" | "completed_at" | null,
): Promise<HandoverRecord> {
  const row: Record<string, unknown> = { status };
  if (stamp) row[stamp] = new Date().toISOString();
  const res = await sb()
    .from("bt_handovers")
    .update(row)
    .eq("id", handoverId)
    .select("*")
    .maybeSingle();
  if (res.error) throw new BatonError(`更新交接单状态失败：${res.error.message}`, 500);
  if (!res.data) throw new NotFoundError("交接单不存在");
  return toHandover(res.data);
}

/**
 * 交接生效：给每条明细盖 granted_at。
 * ⛔ 这里刻意**不** update bt_memories/bt_files 的 owner_employee_id ——
 * 交接是「授予可见权」，不是「搬走数据」，原始归属必须留痕（AC-5.2.3）。
 */
export async function grantHandoverItems(handoverId: string): Promise<number> {
  const res = await sb()
    .from("bt_handover_items")
    .update({ granted_at: new Date().toISOString() })
    .eq("handover_id", handoverId)
    .is("granted_at", null)
    .select("id");
  return (must(res, "授予交接明细") as any[]).length;
}

/** 离职封存：把未交接的记忆条目标记为「已随账号封存」，⛔ 不删数据（AC-5.3.2） */
export async function archiveUnhandedMemories(employeeId: string): Promise<number> {
  const granted = await sb()
    .from("bt_handover_items")
    .select("memory_id, bt_handovers!inner(status, from_employee_id)")
    .eq("item_type", "memory")
    .eq("bt_handovers.status", "completed")
    .eq("bt_handovers.from_employee_id", employeeId);
  const handed = new Set(
    ((granted.data ?? []) as any[]).map((r) => r.memory_id).filter(Boolean) as string[],
  );

  let q = sb()
    .from("bt_memories")
    .update({ archived_reason: "已随账号封存" })
    .eq("owner_employee_id", employeeId)
    .is("archived_reason", null);
  if (handed.size) q = q.not("id", "in", `(${Array.from(handed).join(",")})`);
  const res = await q.select("id");
  return (must(res, "封存未交接内容") as any[]).length;
}

// ============================ 跨人提问 ============================

export async function colleagueSearch(
  targetEmployeeId: string,
  queryText: string,
  queryEmbedding: number[] | null,
  matchCount = 5,
) {
  const res = await sb().rpc("bt_colleague_search", {
    query_text: queryText,
    query_embedding: queryEmbedding as unknown as string | null,
    target_employee_id: targetEmployeeId,
    match_count: matchCount,
  });
  if (res.error) throw new BatonError(`跨人检索失败：${res.error.message}`, 500);
  return ((res.data ?? []) as any[]).map((r) => ({
    itemId: r.item_id as string,
    title: r.title as string,
    snippet: r.snippet as string,
    pageLabel: r.page_label as string | null,
    score: Number(r.score),
  }));
}

export async function logAgentQuery(input: {
  askingEmployeeId: string;
  targetEmployeeId: string | null;
  queryText: string;
  answerText: string | null;
  matchedMemoryIds: string[];
  matchedChunkIds: string[];
  wasCrossEmployee: boolean;
  hop: number;
  latencyMs: number;
}): Promise<string> {
  const res = await sb()
    .from("bt_agent_queries")
    .insert({
      asking_employee_id: input.askingEmployeeId,
      target_employee_id: input.targetEmployeeId,
      query_text: input.queryText,
      answer_text: input.answerText,
      matched_memory_ids: input.matchedMemoryIds,
      matched_chunk_ids: input.matchedChunkIds,
      was_cross_employee: input.wasCrossEmployee,
      hop: input.hop,
      latency_ms: input.latencyMs,
    })
    .select("id")
    .single();
  return (must(res, "写入提问日志") as any).id;
}

export async function listAgentQueries(
  employeeId?: string,
  onlyCross = false,
): Promise<AgentQueryRecord[]> {
  let q = sb()
    .from("bt_agent_queries")
    .select(
      "*, asking:bt_employees!bt_agent_queries_asking_employee_id_fkey(display_name), target:bt_employees!bt_agent_queries_target_employee_id_fkey(display_name)",
    );
  if (onlyCross) q = q.eq("was_cross_employee", true);
  if (employeeId) q = q.or(`asking_employee_id.eq.${employeeId},target_employee_id.eq.${employeeId}`);
  const res = await q.order("created_at", { ascending: false }).limit(50);
  return (must(res, "读取提问记录") as any[]).map((r) => ({
    id: r.id,
    askingEmployeeId: r.asking_employee_id,
    targetEmployeeId: r.target_employee_id,
    askingName: r.asking?.display_name ?? "",
    targetName: r.target?.display_name ?? "",
    queryText: r.query_text,
    answerText: r.answer_text,
    wasCrossEmployee: r.was_cross_employee,
    hop: r.hop,
    latencyMs: r.latency_ms,
    createdAt: r.created_at,
  }));
}

// ============================ 总览统计 ============================

export async function overviewStats() {
  const [emp, files, mems, handovers] = await Promise.all([
    sb().from("bt_employees").select("id", { count: "exact", head: true }),
    sb().from("bt_files").select("id", { count: "exact", head: true }),
    sb().from("bt_memories").select("id", { count: "exact", head: true }),
    sb()
      .from("bt_handovers")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);
  return {
    employees: emp.count ?? 0,
    files: files.count ?? 0,
    memories: mems.count ?? 0,
    handoversThisMonth: handovers.count ?? 0,
  };
}

/** 每个员工的资料量，用于总览页的员工卡片墙 */
export async function employeeSummaries() {
  const employees = await listEmployees();
  const [filesRes, memsRes] = await Promise.all([
    sb().from("bt_files").select("owner_employee_id"),
    sb().from("bt_memories").select("owner_employee_id"),
  ]);
  const fc = new Map<string, number>();
  for (const r of (filesRes.data ?? []) as any[])
    fc.set(r.owner_employee_id, (fc.get(r.owner_employee_id) ?? 0) + 1);
  const mc = new Map<string, number>();
  for (const r of (memsRes.data ?? []) as any[])
    mc.set(r.owner_employee_id, (mc.get(r.owner_employee_id) ?? 0) + 1);
  return employees.map((e) => ({
    ...e,
    fileCount: fc.get(e.id) ?? 0,
    memoryCount: mc.get(e.id) ?? 0,
  }));
}

/** 总览页右侧的动态时间线：把最近的上传 / 抽取 / 交接混排 */
export async function recentActivity(limit = 12) {
  const [files, handovers, queries] = await Promise.all([
    sb()
      .from("bt_files")
      .select("id, original_filename, uploaded_at, bt_employees(display_name)")
      .order("uploaded_at", { ascending: false })
      .limit(limit),
    sb()
      .from("bt_handovers")
      .select(
        "id, status, created_at, completed_at, from_emp:bt_employees!bt_handovers_from_employee_id_fkey(display_name), to_emp:bt_employees!bt_handovers_to_employee_id_fkey(display_name)",
      )
      .order("created_at", { ascending: false })
      .limit(limit),
    sb()
      .from("bt_agent_queries")
      .select("id, query_text, created_at, was_cross_employee, asking:bt_employees!bt_agent_queries_asking_employee_id_fkey(display_name)")
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const items: Array<{ id: string; at: string; kind: string; text: string }> = [];
  for (const r of (files.data ?? []) as any[]) {
    items.push({
      id: `f-${r.id}`,
      at: r.uploaded_at,
      kind: "upload",
      text: `${r.bt_employees?.display_name ?? "某人"} 上传了《${r.original_filename}》`,
    });
  }
  for (const r of (handovers.data ?? []) as any[]) {
    items.push({
      id: `h-${r.id}`,
      at: r.completed_at ?? r.created_at,
      kind: "handover",
      text:
        r.status === "completed"
          ? `${r.from_emp?.display_name} → ${r.to_emp?.display_name} 的交接已确认`
          : `${r.from_emp?.display_name} 发起了给 ${r.to_emp?.display_name} 的交接`,
    });
  }
  for (const r of (queries.data ?? []) as any[]) {
    items.push({
      id: `q-${r.id}`,
      at: r.created_at,
      kind: r.was_cross_employee ? "cross" : "ask",
      text: `${r.asking?.display_name ?? "某人"} ${r.was_cross_employee ? "跨人提问" : "提问"}：${r.query_text}`,
    });
  }
  return items.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}
