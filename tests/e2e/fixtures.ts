// E2E 公共夹具：所有页面都在密码门后面，测试必须先真的过一次门。
import { test as base, expect, type Page } from "@playwright/test";

export const SITE_PASSWORD = process.env.HUB_SITE_PASSWORD ?? "";

/** 走真实的 /api/login 拿会话 Cookie，注入到浏览器 context */
export async function loginViaApi(page: Page) {
  const res = await page.request.post("/api/login", {
    data: { password: SITE_PASSWORD },
  });
  expect(res.status(), "登录接口必须返回 200，否则说明本地 .env.local 没配 HUB_SITE_PASSWORD").toBe(200);
  return res;
}

/** 已登录的 test：每个用例开始前先过门 */
export const test = base.extend<{ authed: void }>({
  authed: [
    async ({ page }, use) => {
      await loginViaApi(page);
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/** 五个控制台页面的路由与标题，多个测试共用 */
export const CONSOLE_PAGES = [
  { path: "/", nav: "总览", heading: "总览" },
  { path: "/knowledge", nav: "我的知识库", heading: "我的知识库" },
  { path: "/memory", nav: "记忆条目", heading: "记忆条目" },
  { path: "/handover", nav: "交接", heading: "交接" },
  { path: "/records", nav: "记录", heading: "记录" },
] as const;
