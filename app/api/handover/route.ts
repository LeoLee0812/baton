// 交接单：列表 / 发起
import { listHandovers } from "@/lib/db";
import { startHandover } from "@/lib/handover";
import { getEmployeeByCode } from "@/lib/db";
import { currentEmployee, handle } from "@/lib/api";
import { HANDOVER_REASONS, type HandoverReason } from "@/lib/types";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handle(async () => {
    const me = await currentEmployee(req);
    return { handovers: await listHandovers(me.id) };
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const me = await currentEmployee(req);
    const body = await req.json();
    const to = await getEmployeeByCode(String(body.toCode ?? ""));
    const reason: HandoverReason = HANDOVER_REASONS.includes(body.reason)
      ? body.reason
      : "daily_sync";
    return startHandover({
      fromEmployeeId: me.id,
      toEmployeeId: to.id,
      reason,
      note: body.note ?? null,
    });
  });
}
