-- 接棒 Baton · 005 混合检索与跨人检索
--
-- 三处必须记住的设计：
-- 1. Postgres 没有 max(uuid) 聚合，uuid 列要先转 text 再聚合回来
-- 2. 托管版不允许 `alter function ... set pg_trgm.similarity_threshold`（需超级用户），
--    阈值只能写在 where 里；短查询（<3 字）凑不出足够 trigram，所以并入 like 子串兜底（AC-3.1.3）
-- 3. min_vec_score 相关性下限：pgvector 的 KNN **永远**返回最近 N 条，不管多不相关。
--    不设下限的话「我的资料里没有」永远说不出口，模型只能拿噪声去编（AC-3.3.2 明令禁止）

create or replace function public.bt_hybrid_search(
  query_text text,
  query_embedding vector(1536),
  target_employee_id uuid,
  match_count int default 10,
  candidate_pool int default 50,
  min_vec_score real default 0.2
)
returns table (
  item_type text, item_id uuid, file_id uuid,
  page_no int, page_label text, heading_path text,
  title text, snippet text, owner_employee_id uuid,
  vec_score real, trgm_score real, rrf_score double precision
)
language sql stable as $$
with
chunk_vec as (
  select * from (
    select c.id as item_id, c.file_id, c.page_no, c.page_label, c.heading_path,
           null::text as title, c.content as snippet, c.owner_employee_id,
           (1 - (c.embedding <=> query_embedding))::real as score,
           row_number() over (order by c.embedding <=> query_embedding) as rnk
    from public.bt_chunks c
    where query_embedding is not null and c.embedding is not null
      and (c.owner_employee_id = target_employee_id
        or exists (select 1 from public.bt_handover_items hi
                   join public.bt_handovers h on h.id = hi.handover_id
                   where hi.item_type = 'file' and hi.file_id = c.file_id
                     and h.to_employee_id = target_employee_id and h.status = 'completed'))
    order by c.embedding <=> query_embedding
    limit candidate_pool
  ) t where t.score >= min_vec_score
),
chunk_trgm as (
  select c.id as item_id, c.file_id, c.page_no, c.page_label, c.heading_path,
         null::text as title, c.content as snippet, c.owner_employee_id,
         similarity(c.content_norm, query_text) as score,
         row_number() over (order by similarity(c.content_norm, query_text) desc,
                                     c.chunk_index asc) as rnk
  from public.bt_chunks c
  where (similarity(c.content_norm, query_text) > 0.1
         or c.content_norm like '%' || lower(query_text) || '%')
    and (c.owner_employee_id = target_employee_id
      or exists (select 1 from public.bt_handover_items hi
                 join public.bt_handovers h on h.id = hi.handover_id
                 where hi.item_type = 'file' and hi.file_id = c.file_id
                   and h.to_employee_id = target_employee_id and h.status = 'completed'))
  order by similarity(c.content_norm, query_text) desc
  limit candidate_pool
),
memory_vec as (
  select * from (
    select m.id as item_id, m.source_file_id as file_id, null::int as page_no,
           m.source_label as page_label, null::text as heading_path,
           m.title, m.content as snippet, m.owner_employee_id,
           (1 - (m.embedding <=> query_embedding))::real as score,
           row_number() over (order by m.embedding <=> query_embedding) as rnk
    from public.bt_memories m
    where query_embedding is not null and m.embedding is not null
      and (m.owner_employee_id = target_employee_id
        or exists (select 1 from public.bt_handover_items hi
                   join public.bt_handovers h on h.id = hi.handover_id
                   where hi.item_type = 'memory' and hi.memory_id = m.id
                     and h.to_employee_id = target_employee_id and h.status = 'completed'))
    order by m.embedding <=> query_embedding
    limit candidate_pool
  ) t where t.score >= min_vec_score
),
memory_trgm as (
  select m.id as item_id, m.source_file_id as file_id, null::int as page_no,
         m.source_label as page_label, null::text as heading_path,
         m.title, m.content as snippet, m.owner_employee_id,
         greatest(similarity(m.content, query_text), similarity(m.title, query_text)) as score,
         row_number() over (order by greatest(similarity(m.content, query_text),
                                              similarity(m.title, query_text)) desc,
                                     m.created_at asc) as rnk
  from public.bt_memories m
  where (similarity(m.content, query_text) > 0.1
         or similarity(m.title, query_text) > 0.1
         or m.content like '%' || query_text || '%'
         or m.title like '%' || query_text || '%')
    and (m.owner_employee_id = target_employee_id
      or exists (select 1 from public.bt_handover_items hi
                 join public.bt_handovers h on h.id = hi.handover_id
                 where hi.item_type = 'memory' and hi.memory_id = m.id
                   and h.to_employee_id = target_employee_id and h.status = 'completed'))
  order by greatest(similarity(m.content, query_text), similarity(m.title, query_text)) desc
  limit candidate_pool
),
unioned as (
  select 'chunk'::text as item_type, item_id, file_id, page_no, page_label, heading_path,
         title, snippet, owner_employee_id, score::real, rnk, 'vec'::text as method from chunk_vec
  union all
  select 'chunk'::text, item_id, file_id, page_no, page_label, heading_path,
         title, snippet, owner_employee_id, score::real, rnk, 'trgm'::text from chunk_trgm
  union all
  select 'memory'::text, item_id, file_id, page_no, page_label, heading_path,
         title, snippet, owner_employee_id, score::real, rnk, 'vec'::text from memory_vec
  union all
  select 'memory'::text, item_id, file_id, page_no, page_label, heading_path,
         title, snippet, owner_employee_id, score::real, rnk, 'trgm'::text from memory_trgm
),
fused as (
  select item_type, item_id,
         max(file_id::text)::uuid as file_id,
         max(page_no) as page_no,
         max(page_label) as page_label,
         max(heading_path) as heading_path,
         max(title) as title,
         max(snippet) as snippet,
         max(owner_employee_id::text)::uuid as owner_employee_id,
         max(score) filter (where method = 'vec')  as vec_score,
         max(score) filter (where method = 'trgm') as trgm_score,
         -- RRF：k=60 是业界常用默认值
         sum(1.0 / (60 + rnk)) as rrf_score
  from unioned
  group by item_type, item_id
)
select item_type, item_id, file_id, page_no, page_label, heading_path, title, snippet,
       owner_employee_id, vec_score::real, trgm_score::real, rrf_score
from fused
order by rrf_score desc
limit match_count;
$$;

alter function public.bt_hybrid_search(text, vector, uuid, int, int, real) set hnsw.ef_search = 40;

-- 跨人提问专用：只扫目标员工 visible_to_colleagues = true 的记忆条目。
-- ⛔ 刻意与 bt_hybrid_search / bt_can_access_memory 完全分开——
-- 那两个是「交接授予」语义，混用就会造成越权可见（SPEC-006 AC-6.1.2）。
create or replace function public.bt_colleague_search(
  query_text text,
  query_embedding vector(1536),
  target_employee_id uuid,
  match_count int default 5,
  min_score real default 0.2
)
returns table (
  item_id uuid, title text, snippet text, page_label text,
  owner_employee_id uuid, score real
)
language sql stable as $$
  select * from (
    select m.id, m.title, m.content, m.source_label, m.owner_employee_id,
           greatest(
             similarity(m.content, query_text),
             similarity(m.title, query_text),
             case when query_embedding is not null and m.embedding is not null
                  then (1 - (m.embedding <=> query_embedding))::real else 0::real end,
             case when m.content like '%' || query_text || '%'
                    or m.title like '%' || query_text || '%'
                  then 0.9::real else 0::real end
           ) as score
    from public.bt_memories m
    where m.owner_employee_id = target_employee_id
      and m.visible_to_colleagues = true
  ) t
  where t.score >= min_score
  order by t.score desc
  limit match_count;
$$;
