// Playwright 配置：默认跑 dev server（快，用于红绿循环）；
// 阶段闸门和最终验收用 E2E_PROD=1 跑真实生产构建。
import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

const useProd = process.env.E2E_PROD === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./docs/night/e2e-artifacts",
  fullyParallel: false,
  forbidOnly: true, // .only 直接让整个 run 失败，这是反作弊硬闸
  retries: 1, // 只重试一次，抹平网络抖动；重试仍失败即真失败
  workers: 1,
  timeout: 60_000,
  reporter: [
    ["list"],
    ["json", { outputFile: "./docs/night/playwright-results.json" }],
    ["html", { outputFolder: "./docs/night/playwright-html", open: "never" }],
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15000,
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: useProd ? "npm run build && npm run start" : "npm run dev",
    url: "http://localhost:3000/login", // 用 /login 探活：它是唯一免登录页
    reuseExistingServer: !useProd,
    timeout: 240 * 1000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
