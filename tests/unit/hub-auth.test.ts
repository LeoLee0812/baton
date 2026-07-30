// SPEC-001 场景 1.1 的纯逻辑部分：会话令牌签发/校验、Cookie 域名选择、未配置 env 的行为
import { describe, it, expect } from "vitest";
import {
  signToken,
  verifyToken,
  checkPassword,
  resolveCookieDomain,
  SESSION_MAX_AGE_MS,
} from "@/lib/hub-auth";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("SPEC-001 密码门", () => {
  it("AC-1.1.2: 签发的令牌能被同一密钥校验通过，且过期时间为 30 天", async () => {
    const now = Date.now();
    const token = await signToken(SECRET, now);
    await expect(verifyToken(SECRET, token, now)).resolves.toBe(true);

    const exp = Number(token.slice(0, token.indexOf(".")));
    expect(exp - now).toBe(SESSION_MAX_AGE_MS);
    expect(SESSION_MAX_AGE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("AC-1.1.2: 会话 Cookie 在 saveme505.help 子域上挂父域，在 localhost 上退化为 host-only", () => {
    // 线上：必须挂父域，才能和 hub 等兄弟站共享登录态
    expect(resolveCookieDomain("baton.saveme505.help", ".saveme505.help")).toBe(
      ".saveme505.help",
    );
    expect(resolveCookieDomain("saveme505.help", ".saveme505.help")).toBe(
      ".saveme505.help",
    );
    // 本地开发 / E2E：域名对不上时必须不带 domain，否则浏览器整条 Cookie 都会被丢弃
    expect(resolveCookieDomain("localhost:3000", ".saveme505.help")).toBeUndefined();
    expect(resolveCookieDomain("127.0.0.1:3000", ".saveme505.help")).toBeUndefined();
    expect(resolveCookieDomain(undefined, ".saveme505.help")).toBeUndefined();
    // 后缀相似但不是子域的域名不能被误判成自己人
    expect(resolveCookieDomain("evilsaveme505.help", ".saveme505.help")).toBeUndefined();
  });

  it("AC-1.1.3: 被篡改的签名、过期的令牌、空令牌一律校验失败", async () => {
    const now = Date.now();
    const token = await signToken(SECRET, now);

    // 篡改签名
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    await expect(verifyToken(SECRET, tampered, now)).resolves.toBe(false);
    // 换密钥
    await expect(verifyToken(SECRET.replace("0", "1"), token, now)).resolves.toBe(false);
    // 已过期
    await expect(
      verifyToken(SECRET, token, now + SESSION_MAX_AGE_MS + 1000),
    ).resolves.toBe(false);
    // 空
    await expect(verifyToken(SECRET, undefined, now)).resolves.toBe(false);
    await expect(verifyToken(SECRET, "", now)).resolves.toBe(false);
    await expect(verifyToken(SECRET, "没有点号", now)).resolves.toBe(false);
  });

  it("AC-1.1.4: 未配置密码时 checkPassword 恒为 false（绝不裸奔）", () => {
    expect(checkPassword("任何输入", "")).toBe(false);
    expect(checkPassword("", "真密码")).toBe(false);
    expect(checkPassword("真密码", "真密码")).toBe(true);
    expect(checkPassword("错密码", "真密码")).toBe(false);
  });
});
