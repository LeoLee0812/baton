-- 接棒 Baton · 003 检索索引与 RLS

-- 向量：数据量 <10 万用 HNSW（不用 IVFFlat——后者要按行数调 lists，数据变化后还要重建）
create index bt_chunks_embedding_hnsw on public.bt_chunks
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index bt_memories_embedding_hnsw on public.bt_memories
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);

-- 中文模糊匹配：pg_trgm GIN。
-- ⚠️ Supabase 托管版没有 zhparser / pg_jieba，`to_tsvector('chinese', …)` 这条路走不通，
-- 中文精确匹配只能靠 trigram。
create index bt_chunks_trgm on public.bt_chunks using gin (content_norm gin_trgm_ops);
create index bt_memories_trgm on public.bt_memories using gin (content gin_trgm_ops);

-- ============================================================
-- RLS
--
-- ⚠️⚠️ 下面这组 policy 是 `using(true)` —— **开了 RLS 但放行一切**，不提供任何隔离能力。
--
-- 为什么这么写：本项目只有 publishable key，没有 service_role key。
-- 不建 policy 的话，publishable key 连读都读不到，站点直接不可用。
--
-- 真正的员工隔离 100% 在应用层做（lib/db.ts 的 scopedQuery），
-- 并由 tests/unit/db-single-entry.test.ts 用 grep 守着（AC-1.3.4）。
--
-- 生产环境应该换成：拿到 service_role key → 删掉下面这些 policy
-- （不给 anon/authenticated 建任何 policy = 默认全部拒绝）→ 服务端用 service key 访问。
-- 详见 README 的「安全边界」章节。
-- ============================================================
alter table public.bt_employees      enable row level security;
alter table public.bt_files          enable row level security;
alter table public.bt_chunks         enable row level security;
alter table public.bt_memories       enable row level security;
alter table public.bt_handovers      enable row level security;
alter table public.bt_handover_items enable row level security;
alter table public.bt_agent_queries  enable row level security;

create policy bt_employees_all      on public.bt_employees      for all to public using (true) with check (true);
create policy bt_files_all          on public.bt_files          for all to public using (true) with check (true);
create policy bt_chunks_all         on public.bt_chunks         for all to public using (true) with check (true);
create policy bt_memories_all       on public.bt_memories       for all to public using (true) with check (true);
create policy bt_handovers_all      on public.bt_handovers      for all to public using (true) with check (true);
create policy bt_handover_items_all on public.bt_handover_items for all to public using (true) with check (true);
create policy bt_agent_queries_all  on public.bt_agent_queries  for all to public using (true) with check (true);
