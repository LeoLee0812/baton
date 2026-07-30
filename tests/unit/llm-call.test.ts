// SPEC-003 / SPEC-004：LLM 调用的请求形状，以及出处标签的拼法。
//
// 这两条都是线上验收时真踩到的坑：
// 1. 抽取和问答共用一个 complete()，但抽取需要 JSON 模式、问答需要散文。
//    共用同一份写死的 response_format 时，/api/ask 直接返回了字符串 `{"type":"json_object"}`。
// 2. 记忆条目的 source_label 本身就带文件名，再和 fileName 拼一次就成了
//    「报价单.pdf · 报价单.pdf · 第 2 页」。
import { describe, it, expect, vi, afterEach } from "vitest";
import { yunwuComplete } from "@/lib/extract";
import { citationLabel } from "@/lib/ask";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubChat(content: string) {
  const spy = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  });
  vi.stubGlobal("fetch", spy);
  process.env.YUNWU_API_BASE ||= "https://example.invalid/v1";
  process.env.YUNWU_API_KEY ||= "test-key";
  return spy;
}

describe("SPEC-004 LLM 调用形状", () => {
  it("AC-4.1.3: 抽取路径必须开 JSON 模式，否则模型会返回一段带解释的散文", async () => {
    const spy = stubChat('{"memories":[]}');
    await yunwuComplete("system", "user", { json: true });

    const body = JSON.parse(spy.mock.calls[0][1].body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("AC-3.3.1: 问答路径**不能**开 JSON 模式，否则答案会变成一个 JSON 壳子", async () => {
    const spy = stubChat("宏远建材的账期是月结 60 天。");
    await yunwuComplete("system", "user");

    const body = JSON.parse(spy.mock.calls[0][1].body as string);
    expect(
      body.response_format,
      "问答开了 JSON 模式——线上实测会把答案变成 {\"type\":\"json_object\"}",
    ).toBeUndefined();
  });

  it("AC-3.3.1: 温度调低，避免同一份资料每次答得都不一样", async () => {
    const spy = stubChat("答案");
    await yunwuComplete("s", "u");
    const body = JSON.parse(spy.mock.calls[0][1].body as string);
    expect(body.temperature).toBeLessThanOrEqual(0.3);
  });
});

describe("SPEC-003 出处标签", () => {
  it("AC-3.1.4: 文件名已经在 pageLabel 里时不再重复拼一遍", () => {
    expect(
      citationLabel({
        fileName: "宏远建材-2026年度报价单.pdf",
        pageLabel: "宏远建材-2026年度报价单.pdf · 第 4 页",
        itemType: "memory",
      }),
    ).toBe("宏远建材-2026年度报价单.pdf · 第 4 页");
  });

  it("AC-3.1.4: 文件名不在 pageLabel 里时，拼成「文件名 · 出处」", () => {
    expect(
      citationLabel({
        fileName: "华东区客户资料汇总.xlsx",
        pageLabel: "Sheet1!2-9行",
        itemType: "chunk",
      }),
    ).toBe("华东区客户资料汇总.xlsx · Sheet1!2-9行");
  });

  it("AC-3.1.4: 缺文件名或缺出处时都要有可读兜底，⛔ 不许出现空标签", () => {
    expect(citationLabel({ fileName: null, pageLabel: "第 3 页", itemType: "chunk" })).toBe(
      "第 3 页",
    );
    expect(citationLabel({ fileName: "合同.docx", pageLabel: null, itemType: "chunk" })).toBe(
      "合同.docx",
    );
    expect(
      citationLabel({ fileName: null, pageLabel: null, itemType: "memory" }),
    ).toBe("我的记忆条目");
    expect(citationLabel({ fileName: null, pageLabel: null, itemType: "chunk" })).toBe(
      "我的资料",
    );
  });

  it("AC-3.1.4: 出处列表去重后再展示，同一页不会连着出现三次", () => {
    const labels = [
      citationLabel({ fileName: "a.pdf", pageLabel: "第 2 页", itemType: "chunk" }),
      citationLabel({ fileName: "a.pdf", pageLabel: "a.pdf · 第 2 页", itemType: "memory" }),
      citationLabel({ fileName: "a.pdf", pageLabel: "第 3 页", itemType: "chunk" }),
    ];
    const unique = labels.filter((v, i, arr) => arr.indexOf(v) === i);
    expect(unique).toEqual(["a.pdf · 第 2 页", "a.pdf · 第 3 页"]);
  });
});
