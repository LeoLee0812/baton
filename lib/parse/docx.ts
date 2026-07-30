// docx 解析：.docx 没有物理页码（分页是渲染时才算的），
// 所以出处用「章节路径」heading_path，page_no 留 null 但 page_label 必须有值（AC-2.2.2）。
import mammoth from "mammoth";
import { cleanForDisplay } from "../normalize";
import type { SourceUnit } from "../chunk";
import type { ParseResult } from "./pdf";

/** mammoth 转出的 HTML 里，h1..h6 就是标题层级 */
const HEADING_RE = /^<h([1-6])>(.*?)<\/h\1>$/i;

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export async function parseDocx(buffer: ArrayBuffer): Promise<ParseResult> {
  const { value: html } = await mammoth.convertToHtml({ buffer: Buffer.from(buffer) });
  // 按块级标签拆开，逐块判断是标题还是正文
  const blocks = html.split(/(?=<h[1-6]>)|(?=<p>)|(?=<table)/i).filter((b) => b.trim());

  const units: SourceUnit[] = [];
  const stack: string[] = [];

  for (const raw of blocks) {
    const block = raw.trim();
    const h = block.match(HEADING_RE);
    if (h) {
      const level = Number(h[1]);
      const title = stripTags(h[2]).trim();
      stack.length = Math.max(level - 1, 0);
      stack[level - 1] = title;
      continue;
    }
    const text = cleanForDisplay(stripTags(block));
    if (!text) continue;
    const path = stack.filter(Boolean).join(" > ") || "正文";
    units.push({ text, pageNo: null, pageLabel: path, headingPath: path });
  }

  const totalChars = units.reduce((s, u) => s + u.text.replace(/\s/g, "").length, 0);
  return { units, totalPages: null, totalChars, likelyScanned: false };
}
