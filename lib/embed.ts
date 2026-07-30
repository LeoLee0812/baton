// embedding 批量调用（云雾中转，OpenAI 兼容）。
// 指数退避 + 全抖动；失败的 chunk 留 embedding_status 让后续补跑，⛔ 不卡死整份文件。

export const EMBED_BATCH_SIZE = 40;

export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const base = process.env.YUNWU_API_BASE;
  const key = process.env.YUNWU_API_KEY;
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  if (!base || !key) throw new Error("embedding 未配置：缺少 YUNWU_API_BASE / YUNWU_API_KEY");

  let lastErr: unknown;
  for (let attempt = 0; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`${base}/embeddings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: texts }),
      });
      // 429 / 5xx 是可重试的；4xx 是我们自己的问题，重试没意义
      if (res.status === 429 || res.status >= 500) throw new Error(`embedding ${res.status}`);
      if (!res.ok) {
        const t = await res.text();
        throw Object.assign(new Error(`embedding ${res.status}: ${t.slice(0, 200)}`), {
          retryable: false,
        });
      }
      const data = (await res.json()) as { data: { embedding: number[] }[] };
      return data.data.map((d) => d.embedding);
    } catch (e) {
      lastErr = e;
      if ((e as { retryable?: boolean }).retryable === false || attempt === 5) break;
      // 全抖动退避：random(0, min(500 * 2^n, 15000))
      await new Promise((r) => setTimeout(r, Math.random() * Math.min(500 * 2 ** attempt, 15000)));
    }
  }
  throw lastErr;
}
