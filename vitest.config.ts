// Vitest 配置：三个 project 分环境跑——node 跑纯逻辑，jsdom 跑组件，integration 真连 Supabase
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./") } },
  test: {
    globals: true,
    reporters: ["default", "json", "junit"],
    outputFile: {
      json: "./docs/night/vitest-results.json",
      junit: "./docs/night/vitest-junit.xml",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./docs/night/coverage",
      // 阈值只卡核心目录。全局阈值故意设得低，避免为了刷数字去写垃圾测试。
      thresholds: {
        lines: 55,
        branches: 50,
        functions: 55,
        statements: 55,
      },
      include: ["lib/**/*.ts", "app/api/**/*.ts", "components/**/*.tsx"],
      exclude: [
        "node_modules/**",
        ".next/**",
        "tests/**",
        "scripts/**",
        "**/*.config.ts",
        "**/*.d.ts",
        "app/**/layout.tsx",
        "app/**/loading.tsx",
        "components/ui/**", // shadcn 生成的组件不计入，不是我们的代码
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "jsdom",
          setupFiles: ["./tests/setup/jsdom.ts"],
          include: ["tests/components/**/*.test.tsx"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          setupFiles: ["./tests/setup/integration.ts"],
          include: ["tests/integration/**/*.test.ts"],
          fileParallelism: false, // 真连库，串行跑，避免测试数据互相污染
          testTimeout: 60000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
