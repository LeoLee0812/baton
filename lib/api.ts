// Route Handler 的公共外壳：解析当前身份、统一错误格式。
// 所有 /api/* 都必须经由这里拿 employeeId，⛔ 不许各写各的。

import { NextResponse } from "next/server";
import { BatonError, ForbiddenError, getEmployeeByCode } from "./db";
import { DEFAULT_EMPLOYEE_CODE, IDENTITY_HEADER } from "./identity";
import type { Employee } from "./types";

/**
 * 从请求里取出当前身份。
 * 身份来自请求头 `x-baton-employee`（employee_code）。
 * ⚠️ 这是**演示用的视角切换**，不是认证——真正挡人的是密码门（proxy.ts）。
 * 但即便如此，一旦确定了身份，后续所有查询都必须被 scopedQuery 锁死在这个身份的作用域内。
 */
export async function currentEmployee(req: Request): Promise<Employee> {
  const code = req.headers.get(IDENTITY_HEADER)?.trim() || DEFAULT_EMPLOYEE_CODE;
  return getEmployeeByCode(code);
}

/**
 * 校验请求里显式带来的 employee 参数是否就是当前身份。
 * 不是 → 403（AC-1.3.2：⛔ 不能因为参数里写了别人的 id 就返回别人的数据）。
 */
export function assertSelf(me: Employee, requested: string | null | undefined): void {
  if (!requested) return;
  if (requested === me.id || requested === me.employeeCode) return;
  throw new ForbiddenError("不能以他人身份访问数据");
}

/** 把业务异常转成带状态码的 JSON，⛔ 不许静默吞掉（对应 AC-7.3.1 的前端 toast） */
export function fail(e: unknown): NextResponse {
  if (e instanceof BatonError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[baton] 未预期的错误：", msg);
  return NextResponse.json({ error: `服务端错误：${msg}` }, { status: 500 });
}

/** 统一包一层 try/catch，省得每个 route 都写 */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    return fail(e);
  }
}
