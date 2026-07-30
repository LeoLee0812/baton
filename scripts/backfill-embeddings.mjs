// 给种子数据补向量。
// seed.mjs 只灌文本（embedding_status='pending'），检索因此只有模糊那一路在跑；
// 补完向量之后，混合检索的两路才都是活的。
// 用法：npm run backfill
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_KEY,
  { auth: { persistSession: false } },
);
const BASE = process.env.YUNWU_API_BASE;
const KEY = process.env.YUNWU_API_KEY;
const MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

async function embed(texts) {
  const res = await fetch(`${BASE}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`embedding ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).data.map((d) => d.embedding);
}

async function run(table, select, textOf) {
  let done = 0;
  for (;;) {
    const { data, error } = await sb
      .from(table)
      .select(select)
      .is("embedding", null)
      .limit(40);
    if (error) throw new Error(`${table} 读取失败：${error.message}`);
    if (!data?.length) break;

    const vectors = await embed(data.map(textOf));
    for (let i = 0; i < data.length; i++) {
      const patch = { embedding: vectors[i] };
      if (table === "bt_chunks") patch.embedding_status = "done";
      const { error: e2 } = await sb.from(table).update(patch).eq("id", data[i].id);
      if (e2) throw new Error(`${table} 写入失败：${e2.message}`);
    }
    done += data.length;
    console.log(`${table}: 已补 ${done} 条`);
  }
  return done;
}

const c = await run("bt_chunks", "id, content", (r) => r.content);
const m = await run("bt_memories", "id, title, content", (r) => `${r.title}\n${r.content}`);

// 回填文件上的计数，让 UI 上的 x/y 显示是准的
const { data: files } = await sb.from("bt_files").select("id");
for (const f of files ?? []) {
  const { count } = await sb
    .from("bt_chunks")
    .select("id", { count: "exact", head: true })
    .eq("file_id", f.id)
    .eq("embedding_status", "done");
  await sb.from("bt_files").update({ embedded_chunks: count ?? 0 }).eq("id", f.id);
}
console.log(`\n完成：切片 ${c} 条 / 记忆条目 ${m} 条已补向量`);
