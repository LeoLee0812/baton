// 健康检查：免登录可达（proxy.ts 的排除列表里有它），用于探活。
export const runtime = "nodejs";

export async function GET() {
  return Response.json({ ok: true, service: "baton", at: new Date().toISOString() });
}
