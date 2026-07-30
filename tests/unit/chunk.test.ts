// SPEC-002 AC-2.2.4：切片长度与重叠。
// 铁律：先按源文件的物理/逻辑单元切，再在单元内按长度切。
// ⛔ 绝不能先拼成一整篇纯文本再无差别滑窗——页码在拼接那一步就永久丢了。
import { describe, it, expect } from "vitest";
import { chunkUnit, chunkUnits, CHUNK_MAX, CHUNK_MIN, OVERLAP_RATIO } from "@/lib/chunk";

/** 造一段带句号的中文长文，避免退化成「找不到断点只能硬切」的极端情况 */
function makeText(sentences: number, perSentence = 40): string {
  return Array.from(
    { length: sentences },
    (_, i) => `第${i + 1}句${"内容".repeat(Math.floor(perSentence / 2))}。`,
  ).join("");
}

describe("SPEC-002 切片", () => {
  it("AC-2.2.4: 单个 chunk 的字符数落在 300–1000 之间（末片可短）", () => {
    const parts = chunkUnit(makeText(60), { pageNo: 3, pageLabel: "第 3 页" });
    expect(parts.length).toBeGreaterThan(1);

    parts.forEach((p, i) => {
      expect(p.content.length).toBeLessThanOrEqual(CHUNK_MAX);
      if (i < parts.length - 1) {
        expect(p.content.length).toBeGreaterThanOrEqual(CHUNK_MIN);
      }
    });
    expect(CHUNK_MIN).toBe(300);
    expect(CHUNK_MAX).toBe(1000);
  });

  it("AC-2.2.4: 相邻 chunk 有约 15% 的重叠，且重叠是真的重叠（后片开头能在前片结尾找到）", () => {
    const parts = chunkUnit(makeText(80), { pageNo: 1, pageLabel: "第 1 页" });
    expect(parts.length).toBeGreaterThanOrEqual(3);

    for (let i = 1; i < parts.length; i++) {
      const prev = parts[i - 1].content;
      const cur = parts[i].content;
      // 后片开头的一段必须出现在前片里，否则「重叠」是假的
      const head = cur.slice(0, 30);
      expect(prev.includes(head), `第 ${i} 片与前片没有真实重叠`).toBe(true);
    }
    expect(OVERLAP_RATIO).toBeCloseTo(0.15, 2);
  });

  it("AC-2.2.1: chunk 不跨页——每片都原样继承所属单元的 pageNo / pageLabel", () => {
    const units = [
      { text: makeText(30), pageNo: 1, pageLabel: "第 1 页" },
      { text: makeText(30), pageNo: 2, pageLabel: "第 2 页" },
      { text: makeText(30), pageNo: 3, pageLabel: "第 3 页" },
    ];
    const chunks = chunkUnits(units);

    // 每一片都必须能说出自己来自哪一页，且页码只能是三页之一
    for (const c of chunks) {
      expect([1, 2, 3]).toContain(c.pageNo);
      expect(c.pageLabel).toBe(`第 ${c.pageNo} 页`);
    }
    // 三页的内容都要有片，且 chunk_index 全局连续递增
    expect(new Set(chunks.map((c) => c.pageNo))).toEqual(new Set([1, 2, 3]));
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  it("AC-2.2.4: 短单元不被继续切分，空白单元被丢弃", () => {
    const chunks = chunkUnits([
      { text: "很短的一句话。", pageNo: 1, pageLabel: "第 1 页" },
      { text: "   \n\t  ", pageNo: 2, pageLabel: "第 2 页" },
      { text: "另一段短内容。", pageNo: 3, pageLabel: "第 3 页" },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toBe("很短的一句话。");
    expect(chunks[1].pageNo).toBe(3);
  });

  it("AC-2.2.4: 每片都带归一化后的 contentNorm 与真实字符数", () => {
    const chunks = chunkUnits([
      { text: "ＡＢＣ　１２３　报价单", pageNo: 1, pageLabel: "第 1 页" },
    ]);
    expect(chunks[0].contentNorm).toBe("abc 123 报价单");
    expect(chunks[0].charCount).toBe(chunks[0].content.length);
  });
});
