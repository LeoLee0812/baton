// 接手人打开即记 viewed
import { markViewed } from "@/lib/handover";
import { currentEmployee, handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const me = await currentEmployee(req);
    return markViewed(id, me.id);
  });
}
