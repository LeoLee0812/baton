// 问答：先检索再生成，答案必须带出处。
//
// 两条不能破的规矩：
// 1. 检索为空就说「我的资料里没有」，⛔ 绝对不许凭模型记忆编造（AC-3.3.2）。
//    历史教训：即使强制预加载检索技能，模型依然会跳过检索、凭训练记忆自信编造，连人名都编得很像。
//    所以这里的做法不是「提示模型别编」，而是**检索为空时根本不调用模型**。
// 2. 跨人提问只允许一跳，且只能碰到对方 visible_to_colleagues=true 的记忆条目（AC-6.1.2 / 6.1.3）。
//    跨人走的是**专门的** bt_colleague_search，⛔ 不复用 bt_hybrid_search / bt_can_access_memory，
//    那两个是「交接授予」语义，两条路径混用就会造成越权可见。

import {
  BatonError,
  colleagueSearch,
  getEmployeeByCode,
  logAgentQuery,
  scopedQuery,
} from "./db";
import { embedBatch, type EmbedFn } from "./embed";
import type { CompleteFn } from "./extract";
import { yunwuComplete } from "./extract";

/** 检索不到时的固定话术。⛔ 这条不允许被模型改写。 */
export const NO_ANSWER = "我的资料里没有。";
/** 跳数上限：0=问自己，1=问同事。⛔ 不允许出现 2（防无限套娃） */
export const MAX_HOP = 1;

const SYSTEM_PROMPT = `你是一名员工的私人资料助手。

铁律（不可违背）：
- 只能依据【证据】里给出的内容回答，⛔ 绝对禁止凭记忆补充证据里没有的信息。
- 回答里必须引用出处（证据条目上标注的文件名与页码/章节）。
- 证据不足以回答时，直接说「我的资料里没有」，⛔ 不要猜、不要推断、不要举例说明。
- 用中文回答，简短直接，不超过 200 字。`;

export interface Citation {
  label: string;
  itemType: "chunk" | "memory";
  itemId: string;
  snippet: string;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  crossEmployee: boolean;
  targetName: string | null;
  hop: number;
  latencyMs: number;
}

export interface AskInput {
  employeeId: string;
  question: string;
  /** 指定要问的同事（employee_code）。不传则只问自己的资料。 */
  askColleagueCode?: string | null;
  /** 当前跳数。由跨人提问触发的调用会带 1 进来，此时禁止再跨人。 */
  hop?: number;
  embed?: EmbedFn;
  complete?: CompleteFn;
}

/**
 * 拼一条人能看懂、且指得回原文的出处标签。
 * ⚠️ 记忆条目的 source_label 本身就带文件名（抽取时拼进去的），
 * 这里再无脑拼一次就会出现「报价单.pdf · 报价单.pdf · 第 2 页」。
 */
export function citationLabel(h: {
  fileName: string | null;
  pageLabel: string | null;
  itemType: "chunk" | "memory";
}): string {
  const file = h.fileName?.trim() || "";
  const page = h.pageLabel?.trim() || "";
  if (page && file && page.includes(file)) return page;
  const joined = [file, page].filter(Boolean).join(" · ");
  if (joined) return joined;
  return h.itemType === "memory" ? "我的记忆条目" : "我的资料";
}

function buildUserPrompt(question: string, citations: Citation[]): string {
  return (
    `【问题】${question}\n\n【证据】` +
    citations.map((c, i) => `\n${i + 1}. （出处：${c.label}）${c.snippet}`).join("")
  );
}

export async function ask(input: AskInput): Promise<AskResult> {
  const started = Date.now();
  const embed = input.embed ?? embedBatch;
  const complete = input.complete ?? yunwuComplete;
  const hop = input.hop ?? 0;
  const question = input.question.trim();
  if (!question) throw new BatonError("问题不能为空");

  if (input.askColleagueCode && hop >= MAX_HOP) {
    // 一跳限制：由跨人提问触发的回答，⛔ 不得再次触发对第三人的提问（防无限套娃）
    throw new BatonError(
      `跨人提问只允许一跳（当前 hop=${hop}），⛔ 不允许继续向第三人套娃提问`,
    );
  }

  // embedding 打不通不算致命：退化为只走 pg_trgm 模糊那一路
  let vec: number[] | null = null;
  try {
    const [v] = await embed([question]);
    vec = v ?? null;
  } catch {
    vec = null;
  }

  let citations: Citation[] = [];
  let crossEmployee = false;
  let targetName: string | null = null;
  let targetId: string | null = null;

  if (input.askColleagueCode) {
    const target = await getEmployeeByCode(input.askColleagueCode);
    if (target.id === input.employeeId) throw new BatonError("不用问自己，直接查就行");
    crossEmployee = true;
    targetName = target.displayName;
    targetId = target.id;

    // ⚠️ 只扫对方 visible_to_colleagues=true 的记忆条目，别的一律碰不到
    const rows = await colleagueSearch(target.id, question, vec, 5);
    citations = rows.map((r) => ({
      label: r.pageLabel ?? `${target.displayName} 的记忆条目`,
      itemType: "memory" as const,
      itemId: r.itemId,
      snippet: `${r.title}：${r.snippet}`,
    }));
  } else {
    const hits = await scopedQuery(input.employeeId).search(question, vec, 6);
    citations = hits.map((h) => ({
      label: citationLabel(h),
      itemType: h.itemType,
      itemId: h.itemId,
      snippet: h.title ? `${h.title}：${h.snippet}` : h.snippet,
    }));
  }

  let answer: string;
  if (citations.length === 0) {
    // ⛔ 检索为空时**根本不调用模型**——这是防编造最硬的一道闸
    answer = crossEmployee
      ? `以下来自 ${targetName} 的 Agent：${NO_ANSWER}`
      : NO_ANSWER;
  } else {
    const raw = (await complete(SYSTEM_PROMPT, buildUserPrompt(question, citations))).trim();
    const withCite =
      raw +
      "\n\n出处：" +
      citations.map((c) => c.label).filter((v, i, a) => a.indexOf(v) === i).join("；");
    answer = crossEmployee ? `以下来自 ${targetName} 的 Agent：\n${withCite}` : withCite;
  }

  const latencyMs = Date.now() - started;
  await logAgentQuery({
    askingEmployeeId: input.employeeId,
    targetEmployeeId: targetId,
    queryText: question,
    answerText: answer,
    matchedMemoryIds: citations.filter((c) => c.itemType === "memory").map((c) => c.itemId),
    matchedChunkIds: citations.filter((c) => c.itemType === "chunk").map((c) => c.itemId),
    wasCrossEmployee: crossEmployee,
    hop: crossEmployee ? hop + 1 : hop,
    latencyMs,
  });

  return {
    answer,
    citations,
    crossEmployee,
    targetName,
    hop: crossEmployee ? hop + 1 : hop,
    latencyMs,
  };
}
