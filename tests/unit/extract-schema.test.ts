// SPEC-004 AC-4.1.3：LLM 返回的结构必须先过 schema，不合规就整批拒绝写库。
// 这条是防「半成品数据」的最后一道闸——LLM 偶尔会漏字段、编分类、返回一段散文。
import { describe, it, expect } from "vitest";
import { ExtractSchemaError, parseExtraction } from "@/lib/extract";
import { MEMORY_CATEGORIES } from "@/lib/types";

const ok = {
  memories: [
    {
      category: "客户约定",
      title: "宏远账期月结 60 天",
      content: "这是 2024 年单独谈下来的特例，其他同规模客户都是月结 30 天。",
      sourceChunkIndex: 3,
    },
  ],
};

describe("SPEC-004 抽取结果 schema", () => {
  it("AC-4.1.2: 合规结果被接受，且分类必须落在五类之内", () => {
    const r = parseExtraction(JSON.stringify(ok));
    expect(r).toHaveLength(1);
    expect(MEMORY_CATEGORIES).toContain(r[0].category);
    expect(r[0].sourceChunkIndex).toBe(3);
  });

  it("AC-4.1.3: 分类不在五类之内 → 抛 ExtractSchemaError，⛔ 不写库", () => {
    const bad = { memories: [{ ...ok.memories[0], category: "我编的分类" }] };
    expect(() => parseExtraction(JSON.stringify(bad))).toThrow(ExtractSchemaError);
    expect(() => parseExtraction(JSON.stringify(bad))).toThrow(/分类/);
  });

  it("AC-4.1.3: 缺字段 / 字段类型不对 → 抛 ExtractSchemaError", () => {
    expect(() =>
      parseExtraction(JSON.stringify({ memories: [{ category: "客户约定", title: "只有标题" }] })),
    ).toThrow(ExtractSchemaError);
    expect(() =>
      parseExtraction(
        JSON.stringify({ memories: [{ ...ok.memories[0], sourceChunkIndex: "第三片" }] }),
      ),
    ).toThrow(ExtractSchemaError);
  });

  it("AC-4.1.3: 根本不是 JSON（模型返回散文）→ 抛 ExtractSchemaError 而不是崩", () => {
    expect(() => parseExtraction("好的，我帮你整理了以下几条：\n1. ……")).toThrow(
      ExtractSchemaError,
    );
    expect(() => parseExtraction("")).toThrow(ExtractSchemaError);
  });

  it("AC-4.1.3: 只要有一条不合规，整批拒绝——⛔ 不许挑合规的那几条偷偷写进去", () => {
    const mixed = {
      memories: [ok.memories[0], { ...ok.memories[0], category: "瞎编的" }],
    };
    expect(() => parseExtraction(JSON.stringify(mixed))).toThrow(ExtractSchemaError);
  });

  it("AC-4.1.3: 空标题 / 超长标题 / 空正文都要被拦下", () => {
    for (const patch of [{ title: "" }, { title: "标".repeat(80) }, { content: "" }]) {
      expect(() =>
        parseExtraction(JSON.stringify({ memories: [{ ...ok.memories[0], ...patch }] })),
      ).toThrow(ExtractSchemaError);
    }
  });

  it("AC-4.1.3: 能从 ```json 代码块里把 JSON 抠出来（模型很爱这么包一层）", () => {
    const wrapped = "```json\n" + JSON.stringify(ok) + "\n```";
    expect(parseExtraction(wrapped)).toHaveLength(1);
  });
});
