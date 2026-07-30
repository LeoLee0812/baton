// 某份文件的全部切片（抽屉里展开看的内容）。可见权在 scopedQuery.chunks 里判。
import { scopedQuery } from "@/lib/db";
import { currentEmployee, handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params; // Next 16：params 是异步的
    const me = await currentEmployee(req);
    const q = scopedQuery(me.id);
    const [file, chunks] = await Promise.all([q.file(id), q.chunks(id)]);
    return { file, chunks };
  });
}
