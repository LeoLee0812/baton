// 编辑一条记忆 / 切三个开关。is_editable=false 时服务端硬拒（AC-4.2.3）。
import { scopedQuery } from "@/lib/db";
import { currentEmployee, handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const me = await currentEmployee(req);
    const body = await req.json();
    const memory = await scopedQuery(me.id).updateMemory(id, {
      title: body.title,
      content: body.content,
      isEditable: body.isEditable,
      visibleToColleagues: body.visibleToColleagues,
      includeInHandoverDefault: body.includeInHandoverDefault,
    });
    return { memory };
  });
}
