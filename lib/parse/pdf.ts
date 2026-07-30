// PDF 解析：逐页提取，同时检测「疑似扫描件」。
// 用 unpdf（unjs 出品，内置去掉 canvas 的 pdf.js，零原生依赖，官方测过 Vercel Functions）。
// ⛔ 不要用 pdf-parse（依赖原生 canvas，serverless 会崩），也不要裸用 pdfjs-dist。
import { extractText, getDocumentProxy } from "unpdf";
import { cleanForDisplay } from "../normalize";
import type { SourceUnit } from "../chunk";

export interface ParseResult {
  units: SourceUnit[];
  totalPages: number | null;
  totalChars: number;
  likelyScanned: boolean;
}

export async function parsePdf(buffer: ArrayBuffer): Promise<ParseResult> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  const units: SourceUnit[] = (text as string[]).map((t, i) => ({
    text: cleanForDisplay(t),
    pageNo: i + 1,
    pageLabel: `第 ${i + 1} 页`,
    headingPath: null,
  }));

  const totalChars = units.reduce((s, u) => s + u.text.replace(/\s/g, "").length, 0);
  // 扫描件（图片型 PDF）没有文字层，提取出来几乎是空的。
  // 两条判据取其一：整篇不足 50 字，或超过 60% 的页面几乎无字。
  const emptyPages = units.filter((u) => u.text.replace(/\s/g, "").length < 20).length;
  const likelyScanned =
    totalPages > 0 && (totalChars < 50 || emptyPages / totalPages > 0.6);

  return {
    units: units.filter((u) => u.text.trim().length > 0),
    totalPages,
    totalChars,
    likelyScanned,
  };
}
