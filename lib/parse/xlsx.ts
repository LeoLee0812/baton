// xlsx 解析：以「Sheet名!行区间」作为出处，且**每个单元必须带上表头行**——
// 脱离表头的数字没有语义，检索出来也没法用（AC-2.2.3）。
// ⛔ 不要 npm i xlsx：npm 上的 SheetJS 停更多年，最新只有 0.18.5，带已知原型污染/DoS 漏洞。
import ExcelJS from "exceljs";
import { cleanForDisplay } from "../normalize";
import type { SourceUnit } from "../chunk";
import type { ParseResult } from "./pdf";

/** 每个单元最多包多少数据行（不含表头） */
const ROWS_PER_UNIT = 12;

function rowText(row: ExcelJS.Row): string {
  // row.values 的下标 0 是空占位，从 1 开始才是第一列
  const vals = (row.values as unknown[]).slice(1);
  return vals
    .map((v) => {
      if (v == null) return "";
      if (typeof v === "object" && v !== null && "text" in v) return String((v as { text: unknown }).text);
      if (typeof v === "object" && v !== null && "result" in v)
        return String((v as { result: unknown }).result);
      return String(v);
    })
    .join(" | ")
    .trim();
}

export async function parseXlsx(buffer: ArrayBuffer): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const units: SourceUnit[] = [];
  wb.eachSheet((ws) => {
    const rows: Array<{ n: number; text: string }> = [];
    ws.eachRow((row, n) => {
      const t = rowText(row);
      if (t.replace(/[\s|]/g, "")) rows.push({ n, text: t });
    });
    if (rows.length === 0) return;

    const header = rows[0];
    const body = rows.slice(1);
    if (body.length === 0) {
      units.push({
        text: cleanForDisplay(header.text),
        pageNo: null,
        pageLabel: `${ws.name}!${header.n}-${header.n}行`,
        headingPath: ws.name,
      });
      return;
    }

    for (let i = 0; i < body.length; i += ROWS_PER_UNIT) {
      const slice = body.slice(i, i + ROWS_PER_UNIT);
      const text = cleanForDisplay([header.text, ...slice.map((r) => r.text)].join("\n"));
      units.push({
        text,
        pageNo: null,
        pageLabel: `${ws.name}!${slice[0].n}-${slice.at(-1)!.n}行`,
        headingPath: ws.name,
      });
    }
  });

  const totalChars = units.reduce((s, u) => s + u.text.replace(/\s/g, "").length, 0);
  return { units, totalPages: null, totalChars, likelyScanned: false };
}
