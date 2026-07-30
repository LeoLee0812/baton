// 对一份已入库的文件做记忆条目抽取。可见权由 scopedQuery 校验（拿别人的 fileId 会 403）。
import { extractMemoriesFromFile } from "@/lib/extract";
import { currentEmployee, handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const me = await currentEmployee(req);
    const body = await req.json();
    const fileId = String(body.fileId ?? "");
    if (!fileId) throw new Error("缺少 fileId");
    return extractMemoriesFromFile(me.id, fileId);
  });
}
