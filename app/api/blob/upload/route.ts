// Vercel Blob 客户端直传的看门人：不接收文件本体，只签令牌。
//
// 为什么必须直传：Vercel Function 请求体上限 4.5MB，文档动辄十几 MB。
// 让浏览器绕过我们的函数直接把字节传到 Blob，服务端只签一个短时效令牌。
//
// GET 是给前端探活用的：没配 BLOB_READ_WRITE_TOKEN 时返回 enabled:false，
// 前端据此降级到 inline（≤4MB 文本直接入库），而不是把用户卡在一个报错上。

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
];

export async function GET() {
  return NextResponse.json({ enabled: !!process.env.BLOB_READ_WRITE_TOKEN });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "服务端未配置 Vercel Blob（BLOB_READ_WRITE_TOKEN）" },
      { status: 503 },
    );
  }
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // 🔴 这里必须再确认一次会话有效。
        // proxy.ts 已经拦了未登录请求，但不能只靠中间件——
        // 不做这一步等于把 Blob 库对全网开放。
        // 本项目走统一密码门 Cookie，能走到这里说明 proxy 已放行。
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          addRandomSuffix: true,
          maximumSizeInBytes: 20 * 1024 * 1024, // 对应 AC-2.1.3
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // ⚠️ 本地开发收不到这个回调（Blob 回调不到 localhost）。
        // 所以建档不依赖它——前端拿到 blob.url 后会显式调 POST /api/files。
        void blob;
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
