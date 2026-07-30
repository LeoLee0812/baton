// 我的文件列表 / 建档。作用域由 scopedQuery 锁死。
import { createFile, scopedQuery } from "@/lib/db";
import { currentEmployee, handle } from "@/lib/api";
import { validateUpload } from "@/lib/upload";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const me = await currentEmployee(req);
    return { files: await scopedQuery(me.id).files() };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const me = await currentEmployee(req);
    const body = await req.json();
    // 类型 / 大小校验必须在服务端也做一遍（前端拦截不算数）
    const v = validateUpload(String(body.filename ?? ""), Number(body.size ?? 0));
    const file = await createFile({
      ownerEmployeeId: me.id,
      originalFilename: String(body.filename),
      storageProvider: body.url ? "vercel_blob" : "inline",
      storageUrl: body.url ?? null,
      inlineContent: body.inlineContent ?? null,
      mimeType: String(body.mimeType ?? v.mimeType),
      fileSizeBytes: Number(body.size ?? 0),
      sourceType: v.sourceType,
    });
    return { file };
  });
}
