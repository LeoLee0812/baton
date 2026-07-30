// SPEC-006：跨 Agent 提问。
// 核心边界：只能问到对方 visible_to_colleagues=true 的记忆条目，且**只允许一跳**。
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { listAgentQueries } from "@/lib/db";
import { ask, MAX_HOP, NO_ANSWER } from "@/lib/ask";
import {
  cleanupTestData,
  createTestChunk,
  createTestEmployee,
  createTestFile,
  createTestMemory,
  fixtureVector,
} from "../helpers/db";

let A: { id: string; code: string; displayName: string };
let B: { id: string; code: string; displayName: string };

// 不打真实 LLM/embedding：complete 直接把检索到的证据回读出来，
// 这样断言的是「检索到了什么、答案里有没有出处」，而不是模型的措辞。
const fakeEmbed = async (t: string[]) => t.map(() => fixtureVector(31337));
const echoComplete = async (_sys: string, user: string) => {
  const m = user.match(/【证据】([\s\S]*)$/);
  return `根据资料：${(m ? m[1] : "").slice(0, 300)}`;
};
const deps = { embed: fakeEmbed, complete: echoComplete };

beforeAll(async () => {
  A = await createTestEmployee("提问方");
  B = await createTestEmployee("被问方");

  const fa = await createTestFile(A.id, "自己的资料.txt");
  await createTestChunk(fa.id, A.id, 0, "我自己资料里写着：屏山家居的对接人是韦经理。", {
    embedding: fixtureVector(1),
  });

  // B 开了「同事可问到」的条目
  await createTestMemory(B.id, "开放的条目", "翎羽物流的华南线时效稳定，可以放心用。", {
    category: "供应商渠道",
    visibleToColleagues: true,
    embedding: fixtureVector(2),
  });
  // B 没开开关的条目——⛔ 跨人提问绝对不能碰到它
  await createTestMemory(B.id, "私密的条目", "翎羽物流私下给我们的返点是 4 个点。", {
    category: "人际雷区",
    visibleToColleagues: false,
    embedding: fixtureVector(3),
  });
}, 90000);

afterAll(async () => {
  await cleanupTestData();
}, 60000);

describe("SPEC-006 跨 Agent 提问", () => {
  it("AC-3.3.1 / AC-3.3.3: 问自己的资料——先检索再生成，答案带出处，且落一条日志", async () => {
    const r = await ask({ employeeId: A.id, question: "屏山家居的对接人是谁", ...deps });

    expect(r.crossEmployee).toBe(false);
    expect(r.hop).toBe(0);
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.answer).toContain("韦经理");

    const logs = await listAgentQueries(A.id);
    const log = logs.find((l) => l.queryText.includes("屏山家居"));
    expect(log, "问答没有落日志").toBeDefined();
    expect(log!.wasCrossEmployee).toBe(false);
    expect(log!.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("AC-3.3.2: 自己资料里没有、也没指定问谁时，明确说「我的资料里没有」，⛔ 不编", async () => {
    const r = await ask({ employeeId: A.id, question: "量子纠缠火锅底料的配方", ...deps });
    expect(r.answer).toBe(NO_ANSWER);
    expect(r.citations).toEqual([]);
    expect(r.crossEmployee).toBe(false);
  });

  it("AC-6.1.1 / AC-6.1.4 / AC-6.1.5: 指定问同事时，答案标注来源且日志记 was_cross_employee", async () => {
    const r = await ask({
      employeeId: A.id,
      question: "翎羽物流华南线怎么样",
      askColleagueCode: B.code,
      ...deps,
    });

    expect(r.crossEmployee).toBe(true);
    expect(r.hop).toBe(1);
    expect(r.targetName).toBe(B.displayName);
    expect(r.answer).toContain(`以下来自 ${B.displayName} 的 Agent`);
    expect(r.answer).toContain("华南线时效稳定");

    const logs = await listAgentQueries(A.id, true);
    const log = logs.find((l) => l.queryText.includes("翎羽物流"));
    expect(log).toBeDefined();
    expect(log!.wasCrossEmployee).toBe(true);
    expect(log!.hop).toBe(1);
    expect(log!.targetEmployeeId).toBe(B.id);
  });

  it("AC-6.1.2: **负向**——同事没开开关的条目，跨人提问一个字都拿不到", async () => {
    const r = await ask({
      employeeId: A.id,
      question: "翎羽物流的返点是多少",
      askColleagueCode: B.code,
      ...deps,
    });

    expect(r.answer, "拿到了同事没开放的内容").not.toContain("返点");
    expect(r.answer).not.toContain("4 个点");
    for (const c of r.citations) {
      expect(c.snippet ?? "").not.toContain("返点");
    }
  });

  it("AC-6.1.3: 只允许一跳——hop 已经是 1 时再跨人直接被拒", async () => {
    expect(MAX_HOP).toBe(1);
    await expect(
      ask({
        employeeId: A.id,
        question: "再问一层",
        askColleagueCode: B.code,
        hop: 1,
        ...deps,
      }),
    ).rejects.toThrow(/一跳|套娃/);
  });

  it("AC-6.1.1: 问一个不存在的同事，报可读错误而不是静默返回空", async () => {
    await expect(
      ask({ employeeId: A.id, question: "随便问问", askColleagueCode: "根本没这个人", ...deps }),
    ).rejects.toThrow(/员工不存在/);
  });

  it("AC-6.2.1: 跨人提问记录能查到「谁问了谁、问了什么、拿到了什么」", async () => {
    const logs = await listAgentQueries(A.id, true);
    expect(logs.length).toBeGreaterThan(0);
    const l = logs[0];
    expect(l.askingName).toBe(A.displayName);
    expect(l.targetName).toBe(B.displayName);
    expect(l.queryText.length).toBeGreaterThan(0);
    expect(l.answerText).toBeTruthy();
  });
});
