// SPEC-007 场景 7.1：整体布局与视觉硬规则
import { test, expect, CONSOLE_PAGES } from "./fixtures";

test.describe("SPEC-007 布局", () => {
  test("AC-7.1.1: 侧边栏含公司名、身份切换器与五个菜单项", async ({ page }) => {
    await page.goto("/");
    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText("接棒 Baton")).toBeVisible();
    await expect(page.getByTestId("identity-switcher")).toBeVisible();

    for (const p of CONSOLE_PAGES) {
      await expect(sidebar.getByRole("link", { name: p.nav })).toBeVisible();
    }
    // 恰好五个菜单项，不多不少
    await expect(sidebar.getByTestId("nav-item")).toHaveCount(5);
  });

  test("AC-7.1.2: 页面背景为浅灰、卡片为纯白，二者不相同", async ({ page }) => {
    await page.goto("/");
    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    const cardBg = await page
      .getByTestId("stat-card")
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(bodyBg).toBe("rgb(246, 247, 249)"); // #f6f7f9
    expect(cardBg).toBe("rgb(255, 255, 255)"); // #ffffff
    expect(bodyBg).not.toBe(cardBg);
  });

  test("AC-7.1.3: 1280px 宽度下五个页面都不出现横向滚动条", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const p of CONSOLE_PAGES) {
      await page.goto(p.path);
      await expect(page.getByRole("heading", { name: p.heading }).first()).toBeVisible();
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, `${p.path} 出现了横向滚动`).toBeLessThanOrEqual(clientWidth);
    }
  });
});
