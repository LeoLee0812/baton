// 交接单详情：单据 + 明细 + 「接手人会看到什么」预览 + 三步进度
import { detail } from "@/lib/handover";
import { currentEmployee, handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const me = await currentEmployee(req);
    return detail(id, me.id);
  });
}
