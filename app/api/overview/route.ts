// 总览页数据：四个数字卡 + 员工卡片墙 + 动态时间线。
// 这是全站唯一一处「跨员工聚合」的地方，只出计数不出内容，不构成隔离破口。
import { employeeSummaries, overviewStats, recentActivity } from "@/lib/db";
import { handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const [stats, employees, activity] = await Promise.all([
      overviewStats(),
      employeeSummaries(),
      recentActivity(12),
    ]);
    return { stats, employees, activity };
  });
}
