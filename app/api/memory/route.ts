// 我的记忆条目列表（可按类型筛选）。
import { scopedQuery } from "@/lib/db";
import { currentEmployee, handle } from "@/lib/api";
import { MEMORY_CATEGORIES, type MemoryCategory } from "@/lib/types";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const me = await currentEmployee(req);
    const raw = new URL(req.url).searchParams.get("category");
    const category = MEMORY_CATEGORIES.includes(raw as MemoryCategory)
      ? (raw as MemoryCategory)
      : undefined;
    return { memories: await scopedQuery(me.id).memories(category) };
  });
}
