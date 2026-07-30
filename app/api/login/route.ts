// 登录接口：校验访问密码，正确则签发 HMAC 会话令牌，写进父域 httpOnly Cookie（跨子域 SSO）。

import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  COOKIE_DOMAIN,
  SESSION_MAX_AGE_MS,
  checkPassword,
  signToken,
} from "../../../lib/hub-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.HUB_AUTH_SECRET;
  const password = process.env.HUB_SITE_PASSWORD;

  if (!secret || !password) {
    return NextResponse.json(
      { error: "服务端未配置访问密码（HUB_SITE_PASSWORD / HUB_AUTH_SECRET）" },
      { status: 503 },
    );
  }

  let input = "";
  try {
    const body = await request.json();
    input = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  if (!checkPassword(input, password)) {
    await new Promise((r) => setTimeout(r, 600)); // 拖慢暴力破解
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }

  const token = await signToken(secret, Date.now());
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    domain: COOKIE_DOMAIN,
    maxAge: Math.floor(SESSION_MAX_AGE_MS / 1000),
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    domain: COOKIE_DOMAIN,
    maxAge: 0,
  });
  return res;
}
