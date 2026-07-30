// 问答：先检索再生成。检索为空时根本不调用模型，直接回「我的资料里没有」。
import { ask } from "@/lib/ask";
import { currentEmployee, handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const me = await currentEmployee(req);
    const body = await req.json();
    return ask({
      employeeId: me.id,
      question: String(body.question ?? ""),
      askColleagueCode: body.askColleagueCode ?? null,
      // hop 由服务端自己算，⛔ 不信客户端传来的值（否则一跳限制就被绕过了）
      hop: 0,
    });
  });
}
