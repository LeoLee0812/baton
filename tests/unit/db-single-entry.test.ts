// SPEC-001 AC-1.3.4 的守卫测试：所有 bt_ 表访问必须收敛到 lib/db.ts 这一个入口。
// 这条测试不测业务行为，它守的是「跨人数据泄漏」这个项目最核心的风险面。
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

/** 用 git ls-files 拿受版本控制的源码，避开 node_modules / .next */
function trackedSources(): string[] {
  const out = execFileSync("git", ["ls-files", "*.ts", "*.tsx"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return out
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("SPEC-001 数据访问单一入口", () => {
  it("AC-1.3.4: 源码中 .from('bt_ 只允许出现在 lib/db.ts", () => {
    const files = trackedSources();
    const offenders: string[] = [];

    for (const rel of files) {
      if (rel === "lib/db.ts") continue;
      const content = execFileSync("cat", [rel], { cwd: ROOT, encoding: "utf8" });
      // 同时覆盖单引号和双引号两种写法
      if (/\.from\(\s*['"]bt_/.test(content)) offenders.push(rel);
    }

    expect(offenders).toEqual([]);
  });

  it("AC-1.3.3: 源码中不出现 NEXT_PUBLIC_ 前缀的服务端密钥变量名", () => {
    const files = trackedSources();
    const offenders: string[] = [];

    for (const rel of files) {
      const content = execFileSync("cat", [rel], { cwd: ROOT, encoding: "utf8" });
      if (/NEXT_PUBLIC_[A-Z_]*(SERVICE_ROLE|SECRET|YUNWU|BLOB)/.test(content)) {
        offenders.push(rel);
      }
    }

    expect(offenders).toEqual([]);
  });
});
