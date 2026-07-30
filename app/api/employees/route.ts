// 员工列表：身份切换器的数据源。只返回展示用字段，不含任何资料内容。
import { listEmployees } from "@/lib/db";
import { handle } from "@/lib/api";

export const runtime = "nodejs";
export const preferredRegion = "hnd1"; // Leo-hub 在东京，就近连库
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => ({ employees: await listEmployees() }));
}
