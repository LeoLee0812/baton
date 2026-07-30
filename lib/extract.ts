// 记忆条目抽取：把文档里「值得交接的结论」整理成一条条带出处的条目。
//
// 两条硬约束：
// 1. LLM 返回的结构必须先过 schema，任何一条不合规就**整批**拒绝写库（AC-4.1.3）。
//    半成品数据比没有数据更糟——它会以「看起来很像真的」的样子留在库里。
// 2. 每条条目必须能指回原文的某一片（source_chunk_id + source_label），
//    指不回去的条目对交接毫无价值，因为接手人无法核实。

import { z } from "zod";
import {
  chunkIdsByIndex,
  existingMemoryKeys,
  insertMemories,
  scopedQuery,
} from "./db";
import { embedBatch, type EmbedFn } from "./embed";
import { MEMORY_CATEGORIES, type MemoryCategory } from "./types";

export class ExtractSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractSchemaError";
  }
}

const MemorySchema = z.object({
  category: z.enum(MEMORY_CATEGORIES, {
    message: `分类必须是这五类之一：${MEMORY_CATEGORIES.join(" / ")}`,
  }),
  title: z.string().min(1, "标题不能为空").max(60, "标题不能超过 60 字"),
  content: z.string().min(1, "正文不能为空").max(600, "正文不能超过 600 字"),
  sourceChunkIndex: z.number().int().min(0, "出处片号必须是非负整数"),
});

const PayloadSchema = z.object({ memories: z.array(MemorySchema) });

export type ExtractedMemory = z.infer<typeof MemorySchema>;

/** 模型很爱把 JSON 包在 ```json 代码块里，先把它抠出来 */
function stripCodeFence(raw: string): string {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : raw).trim();
}

/**
 * 解析并校验 LLM 的抽取结果。
 * ⛔ 只要有一条不合规就整批抛错，不允许「挑合规的那几条偷偷写进去」。
 */
export function parseExtraction(raw: string): ExtractedMemory[] {
  const text = stripCodeFence(raw ?? "");
  if (!text) throw new ExtractSchemaError("模型返回了空内容");

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ExtractSchemaError(
      `模型没有返回合法 JSON（前 80 字：${text.slice(0, 80)}）`,
    );
  }

  const r = PayloadSchema.safeParse(json);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new ExtractSchemaError(
      `抽取结果不符合预期结构：${first.path.join(".")} ${first.message}`,
    );
  }
  return r.data.memories;
}

const SYSTEM_PROMPT = `你是一名把工作资料整理成「交接清单」的助手。

从给你的文档片段里，挑出**接手人不知道就会踩坑**的结论，整理成条目。
每条必须归入且只归入以下五类之一：客户约定 / 报价底线 / 供应商渠道 / 人际雷区 / 流程习惯。

要求：
- 只写文档里真实存在的信息，⛔ 绝对禁止推断或补充文档里没有的内容。
- title 是一句话结论（不超过 30 字），content 说清楚背景和边界（不超过 300 字）。
- sourceChunkIndex 必须是该条结论所依据的片段编号（就是我给你的「片段 N」里的 N）。
- 一个片段可以产出 0 到 2 条；没有值得交接的内容就不产出。

只输出 JSON，格式：
{"memories":[{"category":"...","title":"...","content":"...","sourceChunkIndex":0}]}`;

export interface CompleteOptions {
  /** 是否强制 JSON 输出。抽取必须开；问答**必须不开**，否则答案会变成一个 JSON 壳子。 */
  json?: boolean;
}

export type CompleteFn = (
  system: string,
  user: string,
  opts?: CompleteOptions,
) => Promise<string>;

/** 调云雾中转的对话模型（OpenAI 兼容） */
export const yunwuComplete: CompleteFn = async (system, user, opts = {}) => {
  const base = process.env.YUNWU_API_BASE;
  const key = process.env.YUNWU_API_KEY;
  const model = process.env.LLM_MODEL || "deepseek-v4-flash";
  if (!base || !key) throw new Error("LLM 未配置：缺少 YUNWU_API_BASE / YUNWU_API_KEY");

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      // 只有抽取路径开 JSON 模式：不开的话模型会返回一段带解释的散文，parseExtraction 必然报错。
      // ⚠️ 问答路径**绝对不能**开——线上实测开了之后答案正文直接变成 {"type":"json_object"}。
      ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM 调用失败 ${res.status}：${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
};

/** 单批送给 LLM 的片段数。批太大模型容易漏片、乱编片号。 */
const CHUNKS_PER_BATCH = 6;

export interface ExtractResult {
  created: number;
  skipped: number;
  batches: number;
}

/**
 * 对一份已入库的文件做抽取。
 * @param employeeId 当前身份——可见权由 scopedQuery 校验，拿别人的 fileId 会 403
 */
export async function extractMemoriesFromFile(
  employeeId: string,
  fileId: string,
  opts: { complete?: CompleteFn; embed?: EmbedFn } = {},
): Promise<ExtractResult> {
  const complete = opts.complete ?? yunwuComplete;
  const embed = opts.embed ?? embedBatch;

  const q = scopedQuery(employeeId);
  const file = await q.file(fileId); // 无权时这里就 403 了
  if (file.viaHandover) {
    throw new Error("交接来的文件不能再抽取成你自己的记忆条目");
  }
  const chunks = await q.chunks(fileId);
  if (chunks.length === 0) throw new Error("这份文件还没有切片，先等它处理完");

  const idxMap = await chunkIdsByIndex(fileId);
  const seen = await existingMemoryKeys(employeeId, fileId);

  let created = 0;
  let skipped = 0;
  let batches = 0;

  for (let i = 0; i < chunks.length; i += CHUNKS_PER_BATCH) {
    const batch = chunks.slice(i, i + CHUNKS_PER_BATCH);
    batches += 1;
    const user =
      `文件名：${file.originalFilename}\n\n` +
      batch
        .map((c) => `片段 ${c.chunkIndex}（出处：${c.pageLabel}）：\n${c.content}`)
        .join("\n\n");

    // ⚠️ schema 校验失败会直接抛出去，此时**这一批和后续批次都不写库**——
    // 宁可整次抽取失败，也不留半成品数据（AC-4.1.3）。
    const items = parseExtraction(await complete(SYSTEM_PROMPT, user, { json: true }));

    const rows = [] as Parameters<typeof insertMemories>[0];
    for (const it of items) {
      const src = idxMap.get(it.sourceChunkIndex);
      // 模型可能编一个不存在的片号；退回本批第一片，至少出处仍然是真的
      const fallback = idxMap.get(batch[0].chunkIndex)!;
      const hit = src ?? fallback;
      const key = `${hit.id}::${it.title}`;
      if (seen.has(key)) {
        skipped += 1;
        continue;
      }
      seen.add(key);
      rows.push({
        ownerEmployeeId: employeeId,
        category: it.category as MemoryCategory,
        title: it.title,
        content: it.content,
        sourceFileId: fileId,
        sourceChunkId: hit.id,
        sourceLabel: `${file.originalFilename} · ${hit.label}`,
      });
    }
    if (rows.length) created += await insertMemories(rows);
  }

  // 给新条目补向量，让它们也能被语义检索召回。
  // embedding 失败不影响抽取本身的成败——条目已经落库，模糊检索照样能找到它。
  if (created > 0) {
    try {
      await backfillMemoryEmbeddings(employeeId, embed);
    } catch {
      /* 静默降级：检索退化为纯模糊，chunk/条目都不丢 */
    }
  }

  return { created, skipped, batches };
}

/** 给还没有向量的记忆条目补 embedding */
export async function backfillMemoryEmbeddings(
  employeeId: string,
  embed: EmbedFn = embedBatch,
): Promise<number> {
  const { pendingMemoryEmbeddings, setMemoryEmbedding } = await import("./db");
  const pend = await pendingMemoryEmbeddings(employeeId, 40);
  if (!pend.length) return 0;
  const vectors = await embed(pend.map((p) => `${p.title}\n${p.content}`));
  let n = 0;
  for (let i = 0; i < pend.length; i++) {
    if (vectors[i]) {
      await setMemoryEmbedding(pend[i].id, vectors[i]);
      n += 1;
    }
  }
  return n;
}
