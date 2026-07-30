// SPEC-001 场景 1.1：密码门。这些用例刻意不用已登录夹具，走裸 context。
import { test, expect } from "@playwright/test";

const SITE_PASSWORD = process.env.HUB_SITE_PASSWORD ?? "";

test.describe("SPEC-001 密码门", () => {
  test("AC-1.1.1: 未登录访问受保护路径被重定向到 /login 且带 ?next=", async ({ page }) => {
    await page.context().clearCookies();
    const res = await page.goto("/handover");

    expect(new URL(page.url()).pathname).toBe("/login");
    expect(new URL(page.url()).searchParams.get("next")).toBe("/handover");
    expect(res?.status()).toBe(200); // 跟随 307 后最终落在登录页
    await expect(page.getByRole("heading", { name: /接棒/ })).toBeVisible();
  });

  test("AC-1.1.1: /login 与 /api/login 免登录可达", async ({ page }) => {
    await page.context().clearCookies();
    const loginPage = await page.goto("/login");
    expect(loginPage?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("AC-1.1.3: 密码错误返回 401，且响应体不含正确密码的任何片段", async ({ request }) => {
    const res = await request.post("/api/login", { data: { password: "这不是密码" } });
    expect(res.status()).toBe(401);
    const body = await res.text();
    expect(body).not.toContain(SITE_PASSWORD);
    // 正确密码形如 Leo-xxxx-hub，响应体连它的任一有辨识度片段都不许出现
    expect(body.toLowerCase()).not.toContain(SITE_PASSWORD.slice(0, 8).toLowerCase());
    expect(body).toContain("密码错误");
  });

  test("AC-1.1.2: 密码正确返回 200 并下发 httpOnly + secure 的会话 Cookie", async ({ page }) => {
    await page.context().clearCookies();
    const res = await page.request.post("/api/login", { data: { password: SITE_PASSWORD } });
    expect(res.status()).toBe(200);

    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === "hub_session");
    expect(session, "登录后必须存在 hub_session Cookie").toBeDefined();
    expect(session!.httpOnly).toBe(true);
    expect(session!.secure).toBe(true);
    expect(session!.path).toBe("/");

    // 拿到 Cookie 后受保护页面必须直接可达，不再被踢回登录页
    await page.goto("/handover");
    expect(new URL(page.url()).pathname).toBe("/handover");
  });
});
