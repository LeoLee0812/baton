// 接手人确认：置 completed 并盖 granted_at，此后被勾选内容才对接手人开放
import { confirm } from "@/lib/handover";
import { currentEmployee, handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const me = await currentEmployee(req);
    return confirm(id, me.id);
  });
}
