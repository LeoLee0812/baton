// 上传校验：类型白名单、大小上限、状态文案。
// ⚠️ 前端和服务端都要调这里，前端拦截不算数（AC-2.1.2 / AC-2.1.3）。

import { PARSE_STATUS_LABEL, type ParseStatus, type SourceType } from "./types";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20MB

/** 扩展名 → (sourceType, mime)。⛔ 白名单之外一律拒绝。 */
const ALLOWED: Record<string, { sourceType: SourceType; mimeType: string }> = {
  pdf: { sourceType: "pdf", mimeType: "application/pdf" },
  docx: {
    sourceType: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  xlsx: {
    sourceType: "xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  txt: { sourceType: "txt", mimeType: "text/plain" },
  md: { sourceType: "md", mimeType: "text/markdown" },
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED);

export class UploadRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadRejected";
  }
}

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i + 1).toLowerCase();
}

/**
 * 校验一次上传。不通过就抛带中文说明的 UploadRejected。
 * @returns 通过时返回推断出的 sourceType / mimeType
 */
export function validateUpload(
  filename: string,
  sizeBytes: number,
): { sourceType: SourceType; mimeType: string } {
  const ext = extensionOf(filename);
  const hit = ALLOWED[ext];
  if (!hit) {
    throw new UploadRejected(
      `不支持的文件类型「.${ext || "无扩展名"}」，目前只支持 ${ALLOWED_EXTENSIONS.map((e) => "." + e).join(" / ")}`,
    );
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new UploadRejected("文件大小无效");
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    const mb = (sizeBytes / 1024 / 1024).toFixed(1);
    throw new UploadRejected(`文件 ${mb}MB 超过上限 20MB，请先拆分或压缩`);
  }
  return hit;
}

/** 状态 → 中文文案。切片阶段带上片数，让进度条上的字是有信息量的（AC-2.1.4） */
export function statusLabel(status: ParseStatus, totalChunks = 0): string {
  if (status === "chunking" && totalChunks > 0) return `切片 ${totalChunks} 片`;
  return PARSE_STATUS_LABEL[status] ?? status;
}

/** 状态 → 进度百分比，用于文件行上的进度条 */
export function statusProgress(status: ParseStatus, total: number, embedded: number): number {
  switch (status) {
    case "pending":
      return 5;
    case "parsing":
      return 20;
    case "chunking":
      return 40;
    case "embedding":
      return total > 0 ? 40 + Math.round((embedded / total) * 55) : 60;
    case "done":
      return 100;
    case "failed":
      return 100;
  }
}
