// 全站共用的领域类型。字段名与 bt_* 表一一对应（驼峰 ↔ 下划线的映射在 lib/db.ts 里做）。

export const MEMORY_CATEGORIES = [
  "客户约定",
  "报价底线",
  "供应商渠道",
  "人际雷区",
  "流程习惯",
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const SOURCE_TYPES = ["pdf", "docx", "xlsx", "txt", "md"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const PARSE_STATUSES = [
  "pending",
  "parsing",
  "chunking",
  "embedding",
  "done",
  "failed",
] as const;
export type ParseStatus = (typeof PARSE_STATUSES)[number];

export const HANDOVER_STATUSES = [
  "draft",
  "submitted",
  "viewed",
  "completed",
  "cancelled",
] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];

export const HANDOVER_REASONS = ["offboard", "role_change", "daily_sync"] as const;
export type HandoverReason = (typeof HANDOVER_REASONS)[number];

export const HANDOVER_REASON_LABEL: Record<HandoverReason, string> = {
  offboard: "离职",
  role_change: "换岗",
  daily_sync: "日常同步",
};

export interface Employee {
  id: string;
  employeeCode: string;
  displayName: string;
  avatarEmoji: string | null;
  title: string | null;
  department: string | null;
  role: "agent" | "admin";
  status: "active" | "offboarding" | "offboarded";
}

export interface FileRecord {
  id: string;
  ownerEmployeeId: string;
  originalFilename: string;
  storageProvider: "vercel_blob" | "supabase_storage" | "inline";
  storageUrl: string | null;
  mimeType: string;
  fileSizeBytes: number;
  sourceType: SourceType | "other";
  pageCount: number | null;
  parseStatus: ParseStatus;
  parseError: string | null;
  totalChunks: number;
  embeddedChunks: number;
  uploadedAt: string;
  /** 该文件是否由交接授予而来（非本人所有） */
  viaHandover?: { fromName: string; grantedAt: string } | null;
}

export interface ChunkRecord {
  id: string;
  fileId: string;
  chunkIndex: number;
  pageNo: number | null;
  pageLabel: string;
  headingPath: string | null;
  content: string;
  charCount: number | null;
  embeddingStatus: "pending" | "done" | "failed";
}

export interface MemoryRecord {
  id: string;
  ownerEmployeeId: string;
  category: MemoryCategory;
  title: string;
  content: string;
  sourceFileId: string | null;
  sourceChunkId: string | null;
  sourceLabel: string | null;
  sourceFilename?: string | null;
  isEditable: boolean;
  visibleToColleagues: boolean;
  includeInHandoverDefault: boolean;
  archivedReason: string | null;
  updatedAt: string;
  viaHandover?: { fromName: string; grantedAt: string } | null;
}

export interface HandoverRecord {
  id: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  fromName?: string;
  toName?: string;
  reason: HandoverReason;
  status: HandoverStatus;
  note: string | null;
  createdAt: string;
  submittedAt: string | null;
  viewedAt: string | null;
  completedAt: string | null;
  memoryCount?: number;
  fileCount?: number;
}

export interface HandoverItemRecord {
  id: string;
  handoverId: string;
  itemType: "memory" | "file";
  memoryId: string | null;
  fileId: string | null;
  includedBy: "default" | "manual_add";
  grantedAt: string | null;
  label?: string;
  category?: MemoryCategory;
}

export interface SearchHit {
  itemType: "chunk" | "memory";
  itemId: string;
  fileId: string | null;
  fileName: string | null;
  pageNo: number | null;
  pageLabel: string | null;
  title: string | null;
  snippet: string;
  ownerEmployeeId: string;
  vecScore: number | null;
  trgmScore: number | null;
  rrfScore: number;
  /** 交接来源标注：「来源：王销售 交接，2026-07-31」（AC-3.2.2） */
  handoverNote: string | null;
}

export interface AgentQueryRecord {
  id: string;
  askingEmployeeId: string;
  targetEmployeeId: string | null;
  askingName?: string;
  targetName?: string;
  queryText: string;
  answerText: string | null;
  wasCrossEmployee: boolean;
  hop: number;
  latencyMs: number | null;
  createdAt: string;
  citationLabels?: string[];
}

/** 文件状态 → 中文文案（AC-2.1.4） */
export const PARSE_STATUS_LABEL: Record<ParseStatus, string> = {
  pending: "待处理",
  parsing: "解析中",
  chunking: "切片中",
  embedding: "向量化中",
  done: "已入库",
  failed: "处理失败",
};
