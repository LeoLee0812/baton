// 文本归一化：解析出来的中文常带全角符号、控制字符、成片空白，
// 直接喂给 pg_trgm 会让相似度失真。content_norm 专供检索，不用于展示。

// 控制字符（不含 \n \r \t）与 BOM / 零宽字符
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF\u200B-\u200D]/g;

/** 全角 → 半角（ASCII 可见字符区 + 全角空格） */
export function toHalfWidth(input: string): string {
  return input
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

/**
 * 归一化：全角转半角、去控制字符、压缩空白、拉丁字母转小写。
 * ⛔ 不做分词——中文用 trigram 逐字滑窗天然贴合，分词反而会丢召回。
 */
export function normalizeText(input: string): string {
  return toHalfWidth(input)
    .replace(CONTROL_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * 展示用清理：保留换行、大小写**和中文标点**，只去掉控制字符和多余空白。
 * ⚠️ 刻意不调 toHalfWidth——那会把「，。（）」这些中文全角标点变成 ASCII，
 * 检索时这么做是对的（提高召回），但展示给人看就成了错别字。
 */
export function cleanForDisplay(input: string): string {
  return input
    .replace(/\u3000/g, " ")
    .replace(CONTROL_CHARS, "")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
