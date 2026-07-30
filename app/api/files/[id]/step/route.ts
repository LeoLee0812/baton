// 推进摄取一步。前端轮询调用，每次只做一小块——断点续传天然成立。
import { scopedQuery } from "@/lib/db";
import { stepIngest } from "@/lib/ingest";
import { currentEmployee, handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1"; // Leo-hub 在东京
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const me = await currentEmployee(req);
    // 先过一次可见权，防止拿别人的 fileId 来消耗别人的配额
    await scopedQuery(me.id).file(id);
    return { file: await stepIngest(id) };
  });
}
