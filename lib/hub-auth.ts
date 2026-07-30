// 站点访问门（跨子域共享版）：HMAC-SHA256 签名的会话令牌放进 httpOnly Cookie。
// Cookie 挂在父域 .saveme505.help，所有子站共用同一套密码+密钥即可单点登录。
// 全部用 Web Crypto，Edge 中间件（proxy）和 Node 路由都能跑。

export const AUTH_COOKIE = "hub_session";
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 天
export const COOKIE_DOMAIN = process.env.HUB_COOKIE_DOMAIN || ".saveme505.help";

/**
 * 决定这次响应该把会话 Cookie 挂在哪个域上。
 *
 * 线上（baton.saveme505.help）要挂父域 .saveme505.help，才能和 hub 等兄弟站单点登录；
 * 本地开发和 Playwright E2E 跑在 localhost，如果照样带 domain=.saveme505.help，
 * 浏览器会因为域名不匹配把整条 Cookie 丢掉，导致本地登录永远不生效、E2E 全跑不了。
 * 所以域名对不上时返回 undefined（host-only Cookie）。
 *
 * @param host 请求的 Host 头，可能带端口
 * @param cookieDomain 目标父域，形如 `.saveme505.help`
 */
export function resolveCookieDomain(
  host: string | undefined | null,
  cookieDomain: string = COOKIE_DOMAIN,
): string | undefined {
  if (!host || !cookieDomain) return undefined;
  const hostname = host.split(":")[0].toLowerCase();
  const base = cookieDomain.replace(/^\./, "").toLowerCase();
  if (!base) return undefined;
  // 只有「就是这个域」或「是它的真子域」才允许挂父域；
  // evilsaveme505.help 这种后缀相似的必须被排除，所以判断的是 `.base` 而不是 `base`
  if (hostname === base || hostname.endsWith(`.${base}`)) return cookieDomain;
  return undefined;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

export async function signToken(secret: string, now: number): Promise<string> {
  const exp = String(now + SESSION_MAX_AGE_MS);
  const sig = await hmacHex(secret, exp);
  return `${exp}.${sig}`;
}

export async function verifyToken(
  secret: string,
  token: string | undefined,
  now: number,
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < now) return false;
  const expected = await hmacHex(secret, exp);
  return timingSafeEqual(sig, expected);
}

export function checkPassword(input: string, expected: string): boolean {
  if (!expected || !input) return false;
  return timingSafeEqual(input, expected);
}
