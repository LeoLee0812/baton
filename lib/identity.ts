// 当前身份的存取。身份切换器是**演示用的视角切换**，不是认证——
// 真正挡人的是密码门（proxy.ts）。这一点在 README 的安全边界章节里写明。

export const IDENTITY_STORAGE_KEY = "bt_employee_code";
export const IDENTITY_HEADER = "x-baton-employee";
export const DEFAULT_EMPLOYEE_CODE = "wang";

/** 从浏览器读回上次选中的身份 */
export function readIdentity(): string {
  if (typeof window === "undefined") return DEFAULT_EMPLOYEE_CODE;
  return window.localStorage.getItem(IDENTITY_STORAGE_KEY) || DEFAULT_EMPLOYEE_CODE;
}

export function writeIdentity(code: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IDENTITY_STORAGE_KEY, code);
}

/** 客户端统一的取数函数：自动带上当前身份，并把错误转成可读的中文 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit & { employeeCode?: string } = {},
): Promise<T> {
  const { employeeCode, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      [IDENTITY_HEADER]: employeeCode ?? readIdentity(),
      ...(rest.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const msg =
      (body as { error?: string } | null)?.error ?? `请求失败（HTTP ${res.status}）`;
    throw new Error(msg);
  }
  return body as T;
}
