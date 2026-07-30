// txt / md 解析：按标题分节。md 用 # 层级，txt 用空行分段兜底。
import { cleanForDisplay } from "../normalize";
import type { SourceUnit } from "../chunk";
import type { ParseResult } from "./pdf";

const MD_HEADING = /^(#{1,6})\s+(.+)$/;

export function parseText(content: string, sourceType: "txt" | "md"): ParseResult {
  const lines = cleanForDisplay(content).split("\n");
  const units: SourceUnit[] = [];
  const stack: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    const text = buf.join("\n").trim();
    buf = [];
    if (!text) return;
    const path = stack.filter(Boolean).join(" > ") || `第 ${units.length + 1} 节`;
    units.push({ text, pageNo: null, pageLabel: path, headingPath: path });
  };

  if (sourceType === "md") {
    for (const line of lines) {
      const h = line.match(MD_HEADING);
      if (h) {
        flush();
        const level = h[1].length;
        stack.length = Math.max(level - 1, 0);
        stack[level - 1] = h[2].trim();
        continue;
      }
      buf.push(line);
    }
    flush();
  } else {
    // 纯文本没有标题结构，按空行分段，段号即出处
    for (const para of lines.join("\n").split(/\n{2,}/)) {
      const text = para.trim();
      if (!text) continue;
      units.push({
        text,
        pageNo: null,
        pageLabel: `第 ${units.length + 1} 节`,
        headingPath: null,
      });
    }
  }

  const totalChars = units.reduce((s, u) => s + u.text.replace(/\s/g, "").length, 0);
  return { units, totalPages: null, totalChars, likelyScanned: false };
}
