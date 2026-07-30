// SPEC-002 场景 2.2：解析与出处。**真喂 fixture 文件，⛔ 不 mock 解析。**
// fixture 由 scripts/make-fixtures.mjs 生成，是真格式（真 PDF / 真 docx zip / 真 xlsx）。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePdf } from "@/lib/parse/pdf";
import { parseDocx } from "@/lib/parse/docx";
import { parseXlsx } from "@/lib/parse/xlsx";
import { parseText } from "@/lib/parse/text";
import { chunkUnits } from "@/lib/chunk";

/**
 * 读 fixture 并转成**独立**的 ArrayBuffer。
 * ⚠️ 不能直接用 Buffer.buffer——Node 的 Buffer 来自共享内存池，
 * 那个 ArrayBuffer 往往比文件本身大得多，pdf.js 走 structured clone 时会报
 * DataCloneError: Cannot transfer object of unsupported type。
 */
function FIX(n: string): Buffer {
  return readFileSync(join(process.cwd(), "tests/fixtures", n));
}
function FIX_AB(n: string): ArrayBuffer {
  const b = FIX(n);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

describe("SPEC-002 PDF 解析", () => {
  it("AC-2.2.1: 逐页提取，chunk 的 page_no 是真实页码且不跨页", async () => {
    const r = await parsePdf(FIX_AB("sample.pdf"));
    expect(r.likelyScanned).toBe(false);
    expect(r.units).toHaveLength(3);

    // 只出现在第 2 页的关键词，必须被标成第 2 页
    const marker = "HONGYUAN-JIANCAI-2026";
    const unit = r.units.find((u) => u.text.includes(marker));
    expect(unit).toBeDefined();
    expect(unit!.pageNo).toBe(2);
    expect(unit!.pageLabel).toBe("第 2 页");

    const chunks = chunkUnits(r.units);
    const hit = chunks.find((c) => c.content.includes(marker));
    expect(hit!.pageNo).toBe(2);
    expect(hit!.pageLabel).toBe("第 2 页");
    // 每一片都只属于一页
    for (const c of chunks) expect([1, 2, 3]).toContain(c.pageNo);
  });

  it("AC-2.2.5: 没有文字层的 PDF 被判定为扫描件，⛔ 不许静默成功", async () => {
    const r = await parsePdf(FIX_AB("scanned.pdf"));
    expect(r.likelyScanned).toBe(true);
    expect(r.totalChars).toBeLessThan(50);
  });
});

describe("SPEC-002 docx 解析", () => {
  it("AC-2.2.2: page_no 为空但 page_label 必有值，且 heading_path 反映章节层级", async () => {
    const r = await parseDocx(FIX_AB("sample.docx"));
    expect(r.units.length).toBeGreaterThan(0);

    for (const u of r.units) {
      expect(u.pageNo).toBeNull();
      expect(u.pageLabel, "docx 的每个单元都必须有 page_label").toBeTruthy();
      expect(u.pageLabel.length).toBeGreaterThan(0);
    }

    const pay = r.units.find((u) => u.text.includes("月结六十天"));
    expect(pay).toBeDefined();
    expect(pay!.headingPath).toContain("第2章 价格与结算");
    expect(pay!.headingPath).toContain("2.3 付款方式");
    expect(pay!.pageLabel).toBe(pay!.headingPath);
  });
});

describe("SPEC-002 xlsx 解析", () => {
  it("AC-2.2.3: page_label 是「Sheet名!行区间」，且每个单元都带表头行", async () => {
    const r = await parseXlsx(FIX_AB("sample.xlsx"));
    expect(r.units.length).toBeGreaterThan(0);

    for (const u of r.units) {
      expect(u.pageLabel).toMatch(/^.+!\d+-\d+行$/);
      expect(u.pageNo).toBeNull();
    }

    const priceSheet = r.units.filter((u) => u.pageLabel.startsWith("报价明细!"));
    expect(priceSheet.length).toBeGreaterThan(0);
    // 表头行必须出现在每一个单元里，否则脱离表头的数字没有语义
    for (const u of priceSheet) {
      expect(u.text, `${u.pageLabel} 缺表头`).toContain("年框价(元)");
    }
    expect(priceSheet.some((u) => u.text.includes("复合地板"))).toBe(true);
    // 第二个 sheet 也要被解析到
    expect(r.units.some((u) => u.pageLabel.startsWith("客户!"))).toBe(true);
  });
});

describe("SPEC-002 txt/md 解析", () => {
  it("AC-2.2.2: markdown 按标题分节，每节的 page_label 是标题本身", async () => {
    const r = parseText(FIX("sample.md").toString("utf8"), "md");
    expect(r.units.length).toBeGreaterThanOrEqual(2);
    expect(r.units.every((u) => u.pageNo === null)).toBe(true);
    expect(r.units.some((u) => u.pageLabel.includes("第 1 节 请购"))).toBe(true);
    const bidding = r.units.find((u) => u.text.includes("三家比价"));
    expect(bidding!.pageLabel).toContain("第 2 节 询比价");
  });
});
