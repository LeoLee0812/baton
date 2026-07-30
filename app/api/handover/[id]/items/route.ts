// 增删勾选。只有发起人、且只在 draft 状态下允许。
import { editItems } from "@/lib/handover";
import { currentEmployee, handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const me = await currentEmployee(req);
    const body = await req.json();
    return editItems(id, me.id, body.add ?? [], body.remove ?? []);
  });
}
