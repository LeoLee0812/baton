// SPEC-007 场景 7.2：五个页面各自的关键元素。顺带产出验收用截图。
import { test, expect } from "./fixtures";

const SHOT = "docs/night/screenshots";

test.describe("SPEC-007 五个页面", () => {
  test("AC-7.2.1: 总览页有四个数字卡片、员工卡片墙、右侧动态时间线", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "总览" }).first()).toBeVisible();

    await expect(page.getByTestId("stat-card")).toHaveCount(4);
    await expect(page.getByTestId("stat-card").filter({ hasText: "员工" })).toBeVisible();
    await expect(page.getByTestId("stat-card").filter({ hasText: "文件" })).toBeVisible();
    await expect(page.getByTestId("stat-card").filter({ hasText: "记忆条目" })).toBeVisible();
    await expect(page.getByTestId("stat-card").filter({ hasText: "本月交接" })).toBeVisible();

    await expect(page.getByTestId("employee-wall")).toBeVisible();
    await expect(page.getByTestId("employee-card").first()).toBeVisible();
    await expect(page.getByTestId("timeline")).toBeVisible();

    await page.screenshot({ path: `${SHOT}/p1-overview.png`, fullPage: true });
  });

  test("AC-7.2.2: 知识库页有拖拽上传区与文件表格，点行开抽屉看 chunk 出处", async ({ page }) => {
    await page.goto("/knowledge");
    await expect(page.getByRole("heading", { name: "我的知识库" }).first()).toBeVisible();

    await expect(page.getByTestId("dropzone")).toBeVisible();
    await expect(page.getByTestId("dropzone")).toContainText("拖");
    await expect(page.getByTestId("file-table")).toBeVisible();

    const firstRow = page.getByTestId("file-row").first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();

    const drawer = page.getByTestId("chunk-drawer");
    await expect(drawer).toBeVisible();
    const chunk = drawer.getByTestId("chunk-item").first();
    await expect(chunk).toBeVisible();
    // 每片必须标注出处
    await expect(chunk.getByTestId("chunk-source")).toBeVisible();
    await expect(chunk.getByTestId("chunk-source")).not.toBeEmpty();

    await page.screenshot({ path: `${SHOT}/p1-kb.png`, fullPage: true });
  });

  test("AC-7.2.3: 记忆条目页按五类分组，每卡含结论、出处小字与三个开关", async ({ page }) => {
    await page.goto("/memory");
    await expect(page.getByRole("heading", { name: "记忆条目" }).first()).toBeVisible();

    for (const cat of ["客户约定", "报价底线", "供应商渠道", "人际雷区", "流程习惯"]) {
      await expect(page.getByTestId("memory-group").filter({ hasText: cat })).toBeVisible();
    }

    const card = page.getByTestId("memory-card").first();
    await expect(card).toBeVisible();
    await expect(card.getByTestId("memory-source")).toBeVisible();
    await expect(card.getByTestId("switch-editable")).toBeVisible();
    await expect(card.getByTestId("switch-visible")).toBeVisible();
    await expect(card.getByTestId("switch-handover")).toBeVisible();

    await page.screenshot({ path: `${SHOT}/p1-memory.png`, fullPage: true });
  });

  test("AC-7.2.4: 交接页有左栏选人与原因、右栏勾选清单、底部预览与发起", async ({ page }) => {
    await page.goto("/handover");
    await expect(page.getByRole("heading", { name: "交接" }).first()).toBeVisible();

    await expect(page.getByTestId("handover-from")).toBeVisible();
    await expect(page.getByTestId("handover-to")).toBeVisible();
    await expect(page.getByTestId("handover-reason")).toBeVisible();
    await expect(page.getByTestId("handover-checklist")).toBeVisible();
    await expect(page.getByTestId("handover-preview-btn")).toBeVisible();
    await expect(page.getByTestId("handover-submit-btn")).toBeVisible();
    await expect(page.getByTestId("handover-steps")).toContainText("已发起");
    await expect(page.getByTestId("handover-steps")).toContainText("对方已确认");

    await page.screenshot({ path: `${SHOT}/p1-handover.png`, fullPage: true });
  });

  test("AC-7.2.5: 记录页有交接记录与跨人提问两个 tab", async ({ page }) => {
    await page.goto("/records");
    await expect(page.getByRole("heading", { name: "记录" }).first()).toBeVisible();

    await expect(page.getByTestId("tab-handover")).toBeVisible();
    await expect(page.getByTestId("tab-cross")).toBeVisible();

    await page.getByTestId("tab-cross").click();
    await expect(page.getByTestId("cross-panel")).toBeVisible();

    await page.screenshot({ path: `${SHOT}/p1-records.png`, fullPage: true });
  });

  test("AC-7.2.6: 切到没有任何资料的员工时，五页都给出空态文案而不是白屏", async ({ page }) => {
    // 李销售是种子数据里唯一名下 0 文件 0 条目的员工，用来验证空态
    await page.goto("/");
    const switcher = page.getByTestId("identity-switcher");
    // 员工列表是 useEffect 里异步取的，取到之前切换器只是个占位 div，点它不会展开
    await expect(switcher).toContainText("王销售");
    await switcher.click();
    await page.getByRole("option", { name: /李销售/ }).click();

    for (const path of ["/knowledge", "/memory", "/handover", "/records"]) {
      await page.goto(path);
      const body = await page.textContent("main");
      expect(body?.trim().length, `${path} 疑似白屏`).toBeGreaterThan(20);
      await expect(page.getByTestId("empty-state").first()).toBeVisible();
    }
  });
});
