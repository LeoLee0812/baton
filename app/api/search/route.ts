// 在我的资料范围内做混合检索。作用域由 bt_hybrid_search 焊死。
import { scopedQuery } from "@/lib/db";
import { embedBatch } from "@/lib/embed";
import { assertSelf, currentEmployee, handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const me = await currentEmployee(req);
    const url = new URL(req.url);
    // 显式传了 employee 参数就必须是自己，⛔ 不能靠改参数看别人的（AC-1.3.2）
    assertSelf(me, url.searchParams.get("employee"));

    const q = (url.searchParams.get("q") ?? "").trim();
    if (!q) return { hits: [], query: "" };

    // embedding 打不通不算致命：降级为只走 pg_trgm 模糊那一路
    let vec: number[] | null = null;
    try {
      const [v] = await embedBatch([q]);
      vec = v ?? null;
    } catch {
      vec = null;
    }

    const hits = await scopedQuery(me.id).search(q, vec, 10);
    return { hits, query: q, vectorUsed: vec !== null };
  });
}
