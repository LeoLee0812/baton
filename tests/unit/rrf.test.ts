// SPEC-003 AC-3.1.2：RRF 融合。
// 这条在 SQL 里也实现了一份（bt_hybrid_search），这里测的是同一套公式的 JS 版本——
// 它是 /api/ask 里合并「自己的检索结果」和「跨人检索结果」时用的，不是摆设。
import { describe, it, expect } from "vitest";
import { RRF_K, rrfFuse } from "@/lib/rrf";

describe("SPEC-003 RRF 融合", () => {
  it("AC-3.1.2: 用 1/(k+rank) 求和，k = 60", () => {
    expect(RRF_K).toBe(60);
    const fused = rrfFuse([[{ id: "a" }], [{ id: "a" }]], (x) => x.id);
    // a 在两路都排第 1 → 2 * 1/61
    expect(fused[0].score).toBeCloseTo(2 / 61, 10);
  });

  it("AC-3.1.2: 两路都出现的条目排在只出现一路的前面", () => {
    const vec = [{ id: "only-vec" }, { id: "both" }];
    const trgm = [{ id: "both" }, { id: "only-trgm" }];
    const fused = rrfFuse([vec, trgm], (x) => x.id);

    expect(fused[0].key).toBe("both");
    // 严格降序
    for (let i = 1; i < fused.length; i++) {
      expect(fused[i - 1].score).toBeGreaterThanOrEqual(fused[i].score);
    }
    expect(fused.map((f) => f.key).sort()).toEqual(["both", "only-trgm", "only-vec"]);
  });

  it("AC-3.1.2: 同一条目只出现一次，且保留首次出现的原始对象", () => {
    const a1 = { id: "x", from: "vec" };
    const a2 = { id: "x", from: "trgm" };
    const fused = rrfFuse([[a1], [a2]], (x) => x.id);
    expect(fused).toHaveLength(1);
    expect(fused[0].item).toBe(a1);
  });

  it("AC-3.1.2: 空输入返回空数组，不抛异常", () => {
    expect(rrfFuse([], (x: { id: string }) => x.id)).toEqual([]);
    expect(rrfFuse([[], []], (x: { id: string }) => x.id)).toEqual([]);
  });
});
