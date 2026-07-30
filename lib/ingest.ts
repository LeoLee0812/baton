// 摄取流水线：前端轮询驱动的**分步**处理。
//
// 为什么不一把梭：即便 Vercel 函数超时是 300 秒，一次跑完也意味着
// 任何一步失败就前功尽弃、没有断点续传、进度条卡住不知道卡在哪。
// 分步之后断点续传是天然的——每次只取 embedding_status='pending' 的 chunk，
// 已完成的不会重算，用户关掉浏览器再回来接着轮询即可。
//
// 状态机：pending → parsing → chunking → embedding → done，任何一步异常 → failed。

import {
  countChunks,
  getFileForProcessing,
  markChunkEmbeddingFailed,
  pendingChunks,
  setChunkEmbedding,
  updateFileState,
  upsertChunks,
} from "./db";
import { chunkUnits } from "./chunk";
import { EMBED_BATCH_SIZE, embedBatch, type EmbedFn } from "./embed";
import { parseDocx } from "./parse/docx";
import { parsePdf, type ParseResult } from "./parse/pdf";
import { parseText } from "./parse/text";
import { parseXlsx } from "./parse/xlsx";
import type { FileRecord } from "./types";

export const SCANNED_ERROR = "疑似扫描件/图片型 PDF，暂不支持 OCR，请上传可选中文字的版本";

/** 取原文件字节：Blob 走 HTTP 拉，inline 走库里的 base64/文本 */
async function loadBytes(
  file: FileRecord,
  inlineContent: string | null,
): Promise<{ buffer: ArrayBuffer | null; text: string | null }> {
  if (file.storageProvider === "inline") {
    if (inlineContent === null) throw new Error("inline 文件没有内容");
    if (file.sourceType === "txt" || file.sourceType === "md") {
      return { buffer: null, text: inlineContent };
    }
    const buf = Buffer.from(inlineContent, "base64");
    return { buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), text: null };
  }
  if (!file.storageUrl) throw new Error("文件没有存储地址");
  const res = await fetch(file.storageUrl);
  if (!res.ok) throw new Error(`拉取原文件失败：HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  if (file.sourceType === "txt" || file.sourceType === "md") {
    return { buffer: null, text: new TextDecoder().decode(ab) };
  }
  return { buffer: ab, text: null };
}

async function parseByType(
  file: FileRecord,
  inlineContent: string | null,
): Promise<ParseResult> {
  const { buffer, text } = await loadBytes(file, inlineContent);
  switch (file.sourceType) {
    case "pdf":
      return parsePdf(buffer!);
    case "docx":
      return parseDocx(buffer!);
    case "xlsx":
      return parseXlsx(buffer!);
    case "txt":
    case "md":
      return parseText(text!, file.sourceType);
    default:
      throw new Error(`不支持的文件类型：${file.sourceType}`);
  }
}

/**
 * 推进一步。每次只做一小块，返回推进后的文件状态。
 * @param opts.embed 允许注入 embedding 实现——集成测试用固定 fixture 向量，
 *                   这是 02-TDD规程 §3 明确允许 mock 的少数几项之一；解析和入库仍然真跑。
 */
export async function stepIngest(
  fileId: string,
  opts: { embed?: EmbedFn } = {},
): Promise<FileRecord> {
  const embed = opts.embed ?? embedBatch;
  const { file, inlineContent } = await getFileForProcessing(fileId);

  if (file.parseStatus === "done" || file.parseStatus === "failed") return file;

  try {
    // ---- pending / parsing：解析 + 切片 + 落库 ----
    if (file.parseStatus === "pending" || file.parseStatus === "parsing") {
      await updateFileState(fileId, { parseStatus: "parsing", parseError: null });
      const parsed = await parseByType(file, inlineContent);

      if (parsed.likelyScanned) {
        // ⛔ 不许静默成功：库里空着却告诉用户传成功了，比报错还糟
        await updateFileState(fileId, {
          parseStatus: "failed",
          parseError: SCANNED_ERROR,
          pageCount: parsed.totalPages,
        });
        return (await getFileForProcessing(fileId)).file;
      }

      const rows = chunkUnits(parsed.units);
      if (rows.length === 0) {
        await updateFileState(fileId, {
          parseStatus: "failed",
          parseError: "解析后没有拿到任何可用文本，请确认文件内容不是空的",
        });
        return (await getFileForProcessing(fileId)).file;
      }

      await upsertChunks(
        rows.map((r) => ({
          fileId,
          ownerEmployeeId: file.ownerEmployeeId,
          chunkIndex: r.chunkIndex,
          pageNo: r.pageNo,
          pageLabel: r.pageLabel,
          headingPath: r.headingPath,
          content: r.content,
          contentNorm: r.contentNorm,
          charCount: r.charCount,
        })),
      );
      const c = await countChunks(fileId);
      await updateFileState(fileId, {
        parseStatus: "chunking",
        totalChunks: c.total,
        embeddedChunks: c.embedded,
        pageCount: parsed.totalPages,
      });
      return (await getFileForProcessing(fileId)).file;
    }

    // ---- chunking：切片已落库，转入向量化 ----
    if (file.parseStatus === "chunking") {
      await updateFileState(fileId, { parseStatus: "embedding" });
      return (await getFileForProcessing(fileId)).file;
    }

    // ---- embedding：每次取一批 pending 的 chunk 做向量化 ----
    if (file.parseStatus === "embedding") {
      const batch = await pendingChunks(fileId, EMBED_BATCH_SIZE);
      if (batch.length === 0) {
        const c = await countChunks(fileId);
        await updateFileState(fileId, {
          parseStatus: "done",
          totalChunks: c.total,
          embeddedChunks: c.embedded,
        });
        return (await getFileForProcessing(fileId)).file;
      }

      try {
        const vectors = await embed(batch.map((b) => b.content));
        for (let i = 0; i < batch.length; i++) {
          if (vectors[i]) await setChunkEmbedding(batch[i].id, vectors[i]);
          else await markChunkEmbeddingFailed(batch[i].id, batch[i].retryCount);
        }
      } catch {
        // 整批失败：⛔ 不丢弃 chunk，只累加重试次数，留给下一次补跑（AC-2.3.2）
        for (const b of batch) await markChunkEmbeddingFailed(b.id, b.retryCount);
      }

      const c = await countChunks(fileId);
      await updateFileState(fileId, { totalChunks: c.total, embeddedChunks: c.embedded });
      return (await getFileForProcessing(fileId)).file;
    }

    return file;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await updateFileState(fileId, { parseStatus: "failed", parseError: msg.slice(0, 500) });
    return (await getFileForProcessing(fileId)).file;
  }
}
