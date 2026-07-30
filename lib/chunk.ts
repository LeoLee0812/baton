// 切片。
//
// 铁律：**先按源文件的物理/逻辑单元切，再在单元内按长度切。**
// ⛔ 绝对不要先把所有页拼成一整篇纯文本再无差别滑窗——页码在拼接那一步就永久丢了，
// 之后无论怎么补都还不回来，而「出处能指回第几页」正是这个产品敢让人信的地方。

import { normalizeText } from "./normalize";

export const CHUNK_MIN = 300;
export const CHUNK_MAX = 1000;
/** 相邻 chunk 的重叠比例。重叠是为了避免关键数字被硬切在两片中间 */
export const OVERLAP_RATIO = 0.15;

/** 一个「物理/逻辑单元」：PDF 的一页、docx 的一段、xlsx 的一段行区间、md 的一节 */
export interface SourceUnit {
  text: string;
  pageNo: number | null;
  pageLabel: string;
  headingPath?: string | null;
}

export interface ChunkPart {
  content: string;
  pageNo: number | null;
  pageLabel: string;
  headingPath: string | null;
}

export interface ChunkRow extends ChunkPart {
  chunkIndex: number;
  contentNorm: string;
  charCount: number;
}

/** 中文里适合断句的位置，越靠前优先级越高 */
const BREAKERS = ["\n\n", "。", "！", "？", "；", "\n", "，", "、", " "];

/**
 * 在 [from, hardEnd) 区间里找一个自然断点。
 * 找不到就返回 hardEnd（硬切），但至少不会把一句话拦腰截断在最常见的情况下。
 */
function findBreak(text: string, from: number, hardEnd: number): number {
  const searchFrom = Math.max(from + CHUNK_MIN, from);
  if (hardEnd >= text.length) return text.length;
  for (const b of BREAKERS) {
    const idx = text.lastIndexOf(b, hardEnd);
    if (idx > searchFrom) return idx + b.length;
  }
  return hardEnd;
}

/**
 * 把**一个单元**切成若干片。单元自身的出处（页码/标签）原样带给每一片，
 * 所以任何一片都不会跨页（AC-2.2.1）。
 */
export function chunkUnit(
  text: string,
  meta: { pageNo: number | null; pageLabel: string; headingPath?: string | null },
): ChunkPart[] {
  const body = text.trim();
  if (!body) return [];

  const base: Omit<ChunkPart, "content"> = {
    pageNo: meta.pageNo,
    pageLabel: meta.pageLabel,
    headingPath: meta.headingPath ?? null,
  };
  if (body.length <= CHUNK_MAX) return [{ content: body, ...base }];

  const overlap = Math.round(CHUNK_MAX * OVERLAP_RATIO);
  const parts: ChunkPart[] = [];
  let cursor = 0;

  while (cursor < body.length) {
    const hardEnd = Math.min(cursor + CHUNK_MAX, body.length);
    const end = findBreak(body, cursor, hardEnd);
    const piece = body.slice(cursor, end).trim();
    if (piece) parts.push({ content: piece, ...base });

    if (end >= body.length) break;
    // 下一片从「本片末尾往回退 overlap 字符」开始 —— 这样重叠是真的重叠，
    // 后片开头那段一定能在前片里找到。
    const next = Math.max(end - overlap, cursor + 1);
    cursor = next;
  }
  return parts;
}

/** 把一组单元切成可直接入库的行，chunk_index 全局连续 */
export function chunkUnits(units: SourceUnit[]): ChunkRow[] {
  const rows: ChunkRow[] = [];
  for (const u of units) {
    for (const p of chunkUnit(u.text, {
      pageNo: u.pageNo,
      pageLabel: u.pageLabel,
      headingPath: u.headingPath ?? null,
    })) {
      const norm = normalizeText(p.content);
      if (!norm) continue; // 归一化后为空的片直接丢掉
      rows.push({
        ...p,
        chunkIndex: rows.length,
        contentNorm: norm,
        charCount: p.content.length,
      });
    }
  }
  return rows;
}
