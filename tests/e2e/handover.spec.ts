// SPEC-005 端到端：在真浏览器里走完整条交接链路。
// 勾一半 → 发起 → 切身份到接手人 → 确认 → 接手人查得到勾的、查不到没勾的。
// 这一条是明早人类会亲手复现的路径，所以它必须在真 UI 上跑通，而不是只在 API 层。
import { test, expect } from "./fixtures";

const SHOT = "docs/night/screenshots";

async function switchTo(page: import("@playwright/test").Page, name: RegExp) {
  const switcher = page.getByTestId("identity-switcher");
  await expect(switcher).not.toContainText("加载身份中");
  await switcher.click();
  // 交接页上的原生 <select> 也有 option，必须限定在身份切换器的 listbox 里选
  await page.getByRole("listbox", { name: "切换身份" }).getByRole("option", { name }).click();
  await expect(switcher).toContainText(name);
}

test.describe("SPEC-005 交接闭环", () => {
  test("AC-5.2.5 / AC-5.2.2 / AC-5.2.4: 勾一半→发起→对方确认→勾的能查到、没勾的查不到", async ({
    page,
  }) => {
    // ---------- 1. 王销售发起 ----------
    await page.goto("/handover");
    await switchTo(page, /王销售/);
    await page.goto("/handover");

    const steps = page.getByTestId("handover-steps");
    await expect(steps).toContainText("已发起");
    await expect(steps).toContainText("对方已确认");

    // 交给李销售
    await page.getByTestId("handover-to").selectOption("li");

    // 勾选清单是 useEffect 异步取的，先等它渲染出来再数
    const items = page.getByTestId("checklist-item");
    await expect(items.first()).toBeVisible({ timeout: 20000 });
    await expect
      .poll(() => items.count(), { timeout: 20000 })
      .toBeGreaterThan(3);
    const total = await items.count();
    expect(total, "王销售名下应该有可交接的记忆条目").toBeGreaterThan(3);

    // 只留前一半的勾选：把后一半全部取消
    const keep = Math.floor(total / 2);
    for (let i = keep; i < total; i++) {
      const cb = items.nth(i).getByRole("checkbox");
      if (await cb.isChecked()) await cb.click();
    }
    const checkedNow = await items.locator("input:checked, [data-checked]").count();
    void checkedNow;

    // 记下「勾了的第一条」和「没勾的最后一条」的标题，后面用来验可见性
    const pickedTitle = (await items.nth(0).locator("p").first().innerText()).trim();
    const droppedTitle = (await items.nth(total - 1).locator("p").first().innerText()).trim();
    expect(pickedTitle).not.toBe(droppedTitle);

    await page.screenshot({ path: `${SHOT}/p4-handover-select.png`, fullPage: true });

    await page.getByTestId("handover-submit-btn").click();
    await expect(page.getByTestId("handover-preview")).toBeVisible({ timeout: 20000 });
    await expect(steps.getByText("已发起")).toBeVisible();

    // ---------- 2. 提交后、确认前：单子在接手人的待确认列表里，状态还是「已发起」 ----------
    // ⚠️ 这里刻意不断言「接手人看不到 pickedTitle」：E2E 跑在共享的种子数据上，
    // 跑过一次之后授予就永久留在库里了，同一条断言第二次跑必然假失败。
    // 「未确认前接手人一条都看不到」这条硬约束由 tests/integration/handover-scope.test.ts 守着——
    // 那里每次用全新的 RUN_ID 员工，数据是干净的，断言才有意义。
    await page.goto("/records");
    const pending = page.getByTestId("handover-record-row").first();
    await expect(pending).toBeVisible({ timeout: 20000 });
    await expect(pending).toContainText("已发起");

    // ---------- 3. 接手人确认 ----------
    await switchTo(page, /李销售/);
    await page.goto("/handover");
    const inbox = page.getByTestId("inbox-item").first();
    await expect(inbox).toBeVisible({ timeout: 20000 });
    await expect(inbox).toContainText("王销售");
    await inbox.getByTestId("inbox-confirm").click();

    // ⚠️ 断言的是三步进度条**真的全部点亮**（data-done="true"），
    // 而不是「页面上出现了『对方已确认』这几个字」——后者是个静态标签，恒真，等于没断言。
    const steps3 = page.getByTestId("handover-step");
    await expect(steps3).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(steps3.nth(i), `第 ${i + 1} 步没有点亮`).toHaveAttribute(
        "data-done",
        "true",
        { timeout: 20000 },
      );
    }

    // 把历史遗留的待确认项也一并确认掉，让截图是一个干净的终态
    // （每跑一次 E2E 会新建一张单，不清的话待确认列表会越积越多）
    for (let i = 0; i < 10; i++) {
      const pendingItem = page.getByTestId("inbox-item").first();
      if ((await page.getByTestId("inbox-item").count()) === 0) break;
      await pendingItem.getByTestId("inbox-confirm").click();
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: `${SHOT}/p4-handover-done.png`, fullPage: true });

    // ---------- 4. 确认后：勾的看得到，没勾的看不到 ----------
    await page.goto("/memory");
    // 交接来的条目会带「王销售 交接」角标，等它出现再读文本，避免读到还在加载的中间态
    await expect(page.getByText("王销售 交接").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("memory-card").first()).toBeVisible();
    const afterText = (await page.textContent("main")) ?? "";

    expect(afterText, "确认后接手人仍看不到被交接的条目").toContain(pickedTitle);
    expect(afterText, "❗未勾选的条目泄漏给了接手人").not.toContain(droppedTitle);

    // ---------- 5. 记录页留下完整一行 ----------
    await page.goto("/records");
    const row = page.getByTestId("handover-record-row").first();
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row).toContainText("王销售");
    await expect(row).toContainText("李销售");
    await expect(row).toContainText("已确认");
    await page.screenshot({ path: `${SHOT}/p4-records.png`, fullPage: true });
  });
});
