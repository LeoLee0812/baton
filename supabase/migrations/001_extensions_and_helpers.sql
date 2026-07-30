-- 接棒 Baton · 001 扩展与公共函数
-- ⛔ 本目录下所有对象一律 bt_ 前缀，不要动任何非 bt_ 前缀的东西。

create extension if not exists vector;   -- pgvector：向量检索
create extension if not exists pg_trgm;  -- trigram：中文模糊匹配（托管版没有 zhparser/pg_jieba）

-- 维护 updated_at 的公共触发器函数
create or replace function public.bt_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
