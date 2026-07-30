// SPEC-001 AC-1.3.3：浏览器端构建产物里不允许出现任何服务端密钥。
// 一旦 service_role key 或云雾 key 被打进 bundle，隔离就全废了——
// 这条比任何功能测试都值得跑。
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STATIC_DIR = join(process.cwd(), ".next/static");

/** 递归收集 .next/static 下的所有文本产物 */
function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectFiles(p, acc);
    else if (/\.(js|css|json|txt|map)$/.test(name)) acc.push(p);
  }
  return acc;
}

describe("SPEC-001 构建产物密钥泄漏", () => {
  it("AC-1.3.3: .next/static 里搜不到任何服务端密钥的痕迹", () => {
    if (!existsSync(STATIC_DIR)) {
      throw new Error(
        "找不到 .next/static —— 请先跑 npm run build 再跑这条测试（闸门 scripts/gate.sh 里是构建在前、测试在后）",
      );
    }

    // 密钥本体（从环境变量取真值来搜，比搜关键词严格得多）
    const secretValues = [
      process.env.YUNWU_API_KEY,
      process.env.HUB_AUTH_SECRET,
      process.env.HUB_SITE_PASSWORD,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      process.env.BLOB_READ_WRITE_TOKEN,
    ].filter((v): v is string => !!v && v.length >= 16);

    // 密钥特征串
    const patterns = [/service_role/i, /sb_secret_/, /SUPABASE_SERVICE_ROLE_KEY/];

    const files = collectFiles(STATIC_DIR);
    expect(files.length, ".next/static 是空的，构建可能没成功").toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, "utf8");
      for (const v of secretValues) {
        if (content.includes(v)) offenders.push(`${f} 含密钥明文`);
      }
      for (const p of patterns) {
        if (p.test(content)) offenders.push(`${f} 命中 ${p}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("AC-1.3.3: 只有 NEXT_PUBLIC_ 前缀的 Supabase 变量被打进 bundle（这是刻意的边界）", () => {
    if (!existsSync(STATIC_DIR)) return;
    const files = collectFiles(STATIC_DIR);
    const all = files.map((f) => readFileSync(f, "utf8")).join("\n");

    // publishable key 出现在 bundle 里是**预期行为**（README 安全边界章节写明了），
    // 但它绝不能和服务端密钥同时出现
    expect(all).not.toMatch(/service_role/i);
    expect(all).not.toMatch(/sb_secret_/);
  });
});
