// 提交：置 submitted，此刻接手人尚不能访问任何内容
import { submit } from "@/lib/handover";
import { currentEmployee, handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const me = await currentEmployee(req);
    return submit(id, me.id);
  });
}
