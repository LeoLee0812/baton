// SPEC-002 / SPEC-003 端到端：在真浏览器里真传一份文件，看着它跑完状态机，
// 再搜一个**只出现在第 2 页**的词，验证结果上标的出处确实是第 2 页。
// 这条同时产出 p2-upload-progress.png 与 p2-search-source.png 两张验收截图。
import { test, expect } from "./fixtures";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const SHOT = "docs/night/screenshots";
// 只出现在 fixture PDF 第 2 页的标记词
const MARKER = "HONGYUAN-JIANCAI-2026";

/**
 * 这条 E2E 会往种子库里真传文件。跑完清掉自己造的那几份，
 * 免得王销售的文件列表每跑一次就多几行（截图也会越来越乱）。
 * ⛔ 删除条件严格限定在本测试自己的 `e2e-` 文件名前缀上，绝不无条件删。
 */
test.afterAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  if (!url || !key) return;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await sb.from("bt_files").select("id").like("original_filename", "e2e-%");
  const ids = (data ?? []).map((f) => f.id as string);
  if (!ids.length) return;
  await sb.from("bt_chunks").delete().in("file_id", ids);
  await sb.from("bt_files").delete().in("id", ids);
});

test.describe("SPEC-002/003 上传解析入库与出处", () => {
  test("AC-2.1.4 / AC-2.2.1 / AC-3.1.4: 真传一份 PDF → 状态流转到已入库 → 搜第 2 页的词，出处标的就是第 2 页", async ({
    page,
  }) => {
    await page.goto("/knowledge");
    await expect(page.getByTestId("identity-switcher")).not.toContainText("加载身份中");
    await expect(page.getByTestId("dropzone")).toBeVisible();

    // 每次跑用不同文件名，避免和上一次的残留混淆
    const stamp = Date.now().toString(36);
    const filename = `e2e-${stamp}.pdf`;
    const buf = readFileSync(join(process.cwd(), "tests/fixtures/sample.pdf"));

    await page.locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType: "application/pdf",
      buffer: buf,
    });

    // 上传中：进度区出现，文案是状态机里的中文
    const dropzone = page.getByTestId("dropzone");
    await expect(dropzone).toContainText(filename, { timeout: 20000 });
    await page.screenshot({ path: `${SHOT}/p2-upload-progress.png`, fullPage: true });

    // 等它跑完整条状态机：文件表格里出现这一行且状态是「已入库」
    const row = page.getByTestId("file-row").filter({ hasText: filename });
    await expect(row).toBeVisible({ timeout: 90000 });
    await expect(row).toContainText("已入库", { timeout: 120000 });
    // 三页各一片
    await expect(row).toContainText("3/3");

    // 点开抽屉：每片都标着它在原文的第几页
    await row.click();
    const drawer = page.getByTestId("chunk-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId("chunk-item")).toHaveCount(3);
    await expect(drawer.getByTestId("chunk-source").nth(1)).toContainText("第 2 页");
    await page.keyboard.press("Escape");

    // 搜只出现在第 2 页的词
    await page.getByTestId("search-input").fill(MARKER);
    await page.getByTestId("search-btn").click();

    const results = page.getByTestId("search-results");
    await expect(results).toBeVisible({ timeout: 30000 });
    const hit = page.getByTestId("search-hit").first();
    await expect(hit).toBeVisible();
    await expect(hit.getByTestId("hit-source")).toContainText("第 2 页");
    await expect(hit).toContainText(MARKER);

    await page.screenshot({ path: `${SHOT}/p2-search-source.png`, fullPage: true });
  });

  test("AC-2.2.5: 传一份没有文字层的 PDF，UI 上以失败态明确报出「疑似扫描件」，⛔ 不静默成功", async ({
    page,
  }) => {
    await page.goto("/knowledge");
    await expect(page.getByTestId("dropzone")).toBeVisible();

    const stamp = Date.now().toString(36);
    const filename = `e2e-scanned-${stamp}.pdf`;
    await page.locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType: "application/pdf",
      buffer: readFileSync(join(process.cwd(), "tests/fixtures/scanned.pdf")),
    });

    const row = page.getByTestId("file-row").filter({ hasText: filename });
    await expect(row).toBeVisible({ timeout: 90000 });
    await expect(row).toContainText("处理失败", { timeout: 90000 });

    // 点开抽屉能看到具体原因，而不是一个语焉不详的红点
    await row.click();
    const drawer = page.getByTestId("chunk-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("扫描件");
    await expect(drawer).toContainText("OCR");
    await page.screenshot({ path: `${SHOT}/p2-scanned-failed.png`, fullPage: true });
  });

  test("AC-2.1.2: 拖一个不支持的类型进来，前端立刻用中文说清为什么不收", async ({ page }) => {
    await page.goto("/knowledge");
    await expect(page.getByTestId("dropzone")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "木马.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("MZ"),
    });

    const toast = page.locator("[data-sonner-toast]").first();
    await expect(toast).toBeVisible({ timeout: 15000 });
    await expect(toast).toContainText("不支持的文件类型");
    await expect(toast).toContainText(".pdf");
    // 没有产生任何文件行
    await expect(page.getByTestId("file-row").filter({ hasText: "木马" })).toHaveCount(0);
  });
});
