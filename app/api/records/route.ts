// 记录页：交接记录 + 跨人提问记录两个 tab 的数据源。
import { listAgentQueries, listHandovers } from "@/lib/db";
import { currentEmployee, handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const me = await currentEmployee(req);
    const [handovers, queries] = await Promise.all([
      listHandovers(me.id),
      listAgentQueries(me.id, true),
    ]);
    return { handovers, queries };
  });
}
