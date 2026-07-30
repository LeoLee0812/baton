// SPEC-002 AC-2.3.4：单次 API 调用的处理量必须可控，不能一把梭跑到函数超时。
import { describe, it, expect } from "vitest";
import { EMBED_BATCH_SIZE } from "@/lib/embed";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("SPEC-002 分批与超时预算", () => {
  it("AC-2.3.4: 单次 step 的 embedding 批量在 30–50 之间", () => {
    // 批太小 → 轮询次数暴涨；批太大 → 单次请求可能顶到函数超时
    expect(EMBED_BATCH_SIZE).toBeGreaterThanOrEqual(30);
    expect(EMBED_BATCH_SIZE).toBeLessThanOrEqual(50);
  });

  it("AC-2.3.4: 摄取路由声明了 maxDuration，且一批的耗时预算远低于它", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/files/[id]/step/route.ts"),
      "utf8",
    );
    const m = route.match(/export const maxDuration = (\d+)/);
    expect(m, "step 路由必须显式声明 maxDuration").not.toBeNull();

    const maxDuration = Number(m![1]);
    expect(maxDuration).toBeLessThanOrEqual(300); // Vercel Hobby 上限

    // 单批 40 条、按单条最坏 2 秒算，也就 80 秒，留了三倍以上余量
    const worstCaseSeconds = EMBED_BATCH_SIZE * 2;
    expect(worstCaseSeconds).toBeLessThan(maxDuration);
  });

  it("AC-2.3.4: 查库路由都声明了就近区域（Leo-hub 在东京，Vercel 默认在美东）", () => {
    for (const rel of [
      "app/api/files/[id]/step/route.ts",
      "app/api/search/route.ts",
      "app/api/ask/route.ts",
      "app/api/handover/route.ts",
    ]) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src, `${rel} 缺 preferredRegion`).toContain('preferredRegion = "hnd1"');
    }
  });
});
