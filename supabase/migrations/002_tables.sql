-- 接棒 Baton · 002 七张表

-- ========== 1. 员工 ==========
create table public.bt_employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  display_name text not null,
  avatar_emoji text,
  title text,
  department text,
  role text not null default 'agent' check (role in ('agent','admin')),
  status text not null default 'active' check (status in ('active','offboarding','offboarded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.bt_employees is '接棒：员工主表，每个员工对应一份严格隔离的知识资料';
comment on column public.bt_employees.employee_code is '工号，前端身份切换用的短标识';
comment on column public.bt_employees.status is 'active=在职 / offboarding=交接中 / offboarded=已离职（资料只读并封存）';

create trigger trg_bt_employees_updated_at before update on public.bt_employees
  for each row execute function public.bt_set_updated_at();

-- ========== 2. 文件 ==========
create table public.bt_files (
  id uuid primary key default gen_random_uuid(),
  owner_employee_id uuid not null references public.bt_employees(id) on delete restrict,
  original_filename text not null,
  storage_provider text not null default 'vercel_blob'
    check (storage_provider in ('vercel_blob','supabase_storage','inline')),
  storage_url text,
  inline_content text,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  source_type text not null check (source_type in ('pdf','docx','xlsx','txt','md','other')),
  page_count int,
  checksum_sha256 text,
  parse_status text not null default 'pending'
    check (parse_status in ('pending','parsing','chunking','embedding','done','failed')),
  parse_error text,
  total_chunks int not null default 0,
  embedded_chunks int not null default 0,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.bt_files is '接棒：员工上传的原始文件，归属唯一员工';
comment on column public.bt_files.parse_status is '状态机：pending→parsing→chunking→embedding→done，失败转 failed';
comment on column public.bt_files.storage_provider is '原文件存储后端，三种降级方案都支持';
comment on column public.bt_files.inline_content is 'storage_provider=inline 时直接存内容（≤4MB 的降级路径；二进制走 base64）';

create trigger trg_bt_files_updated_at before update on public.bt_files
  for each row execute function public.bt_set_updated_at();

create index bt_files_owner_idx on public.bt_files (owner_employee_id);
create index bt_files_status_idx on public.bt_files (parse_status)
  where parse_status not in ('done','failed');

-- ========== 3. 切片 ==========
create table public.bt_chunks (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.bt_files(id) on delete cascade,
  owner_employee_id uuid not null references public.bt_employees(id) on delete restrict,
  chunk_index int not null,
  page_no int,
  page_label text not null,
  heading_path text,
  content text not null,
  content_norm text not null,
  token_count int,
  char_count int,
  embedding vector(1536),
  embedding_model text not null default 'text-embedding-3-small',
  embedding_status text not null default 'pending'
    check (embedding_status in ('pending','done','failed')),
  embedding_retry_count int not null default 0,
  created_at timestamptz not null default now(),
  -- 这条唯一约束保证「同一份文件重复处理不产生重复 chunk」（AC-2.3.3）
  unique (file_id, chunk_index)
);
comment on table public.bt_chunks is '接棒：文件切片，检索的最小召回单元，必须保留出处';
comment on column public.bt_chunks.page_label is '展示用出处文案，始终有值：PDF="第3页" / docx=章节路径 / xlsx="Sheet1!12-20行"';
comment on column public.bt_chunks.content_norm is '归一化文本（全角转半角、压缩空白），专供 pg_trgm 索引，不用于展示';
comment on column public.bt_chunks.owner_employee_id is '冗余存归属，避免每次检索都 join files';

create index bt_chunks_file_idx on public.bt_chunks (file_id);
create index bt_chunks_owner_idx on public.bt_chunks (owner_employee_id);
create index bt_chunks_pending_idx on public.bt_chunks (file_id, embedding_status)
  where embedding_status = 'pending';

-- ========== 4. 记忆条目（交接的标的物） ==========
create table public.bt_memories (
  id uuid primary key default gen_random_uuid(),
  owner_employee_id uuid not null references public.bt_employees(id) on delete restrict,
  category text not null check (category in
    ('客户约定','报价底线','供应商渠道','人际雷区','流程习惯')),
  title text not null,
  content text not null,
  source_file_id uuid references public.bt_files(id) on delete set null,
  source_chunk_id uuid references public.bt_chunks(id) on delete set null,
  source_label text,
  is_editable boolean not null default true,
  visible_to_colleagues boolean not null default false,
  include_in_handover_default boolean not null default true,
  archived_reason text,
  embedding vector(1536),
  embedding_model text not null default 'text-embedding-3-small',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.bt_memories is '接棒：记忆条目，交接的标的物。三个开关分别控制可编辑、跨人可见、交接默认包含';
comment on column public.bt_memories.visible_to_colleagues is 'true 时其他员工的 Agent 可跨人问到（仅问答，不转移归属）';
comment on column public.bt_memories.include_in_handover_default is '发起交接单时是否默认勾选（用户仍可增删）';
comment on column public.bt_memories.archived_reason is '员工离职且该条未交接时写入「已随账号封存」，⛔ 数据不删';

create trigger trg_bt_memories_updated_at before update on public.bt_memories
  for each row execute function public.bt_set_updated_at();

create index bt_memories_owner_idx on public.bt_memories (owner_employee_id);
create index bt_memories_cat_idx on public.bt_memories (owner_employee_id, category);
create index bt_memories_visible_idx on public.bt_memories (visible_to_colleagues)
  where visible_to_colleagues = true;

-- ========== 5. 交接单 ==========
create table public.bt_handovers (
  id uuid primary key default gen_random_uuid(),
  from_employee_id uuid not null references public.bt_employees(id) on delete restrict,
  to_employee_id uuid not null references public.bt_employees(id) on delete restrict,
  reason text not null default 'daily_sync' check (reason in ('offboard','role_change','daily_sync')),
  status text not null default 'draft'
    check (status in ('draft','submitted','viewed','completed','cancelled')),
  title text,
  note text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  viewed_at timestamptz,
  completed_at timestamptz,
  constraint bt_handovers_diff_employee check (from_employee_id <> to_employee_id)
);
comment on table public.bt_handovers is '接棒：交接单。一次交接 = 一个 from→to 的可见权授予事件，不搬走数据';
comment on column public.bt_handovers.status is 'draft→submitted→viewed→completed，对应页面上三步进度条';

create index bt_handovers_to_idx on public.bt_handovers (to_employee_id, status);
create index bt_handovers_from_idx on public.bt_handovers (from_employee_id, status);

-- ========== 6. 交接明细 ==========
create table public.bt_handover_items (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.bt_handovers(id) on delete cascade,
  item_type text not null check (item_type in ('memory','file')),
  memory_id uuid references public.bt_memories(id) on delete cascade,
  file_id uuid references public.bt_files(id) on delete cascade,
  source_note text,
  included_by text not null default 'default'
    check (included_by in ('default','manual_add')),
  granted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint bt_handover_items_type_consistency check (
    (item_type = 'memory' and memory_id is not null and file_id is null) or
    (item_type = 'file'   and file_id   is not null and memory_id is null)
  )
);
comment on table public.bt_handover_items is '接棒：交接明细。本表即可见权授予记录，原 owner 不变';
comment on column public.bt_handover_items.granted_at is '交接单 completed 时回填，代表可见权正式生效';

create index bt_handover_items_handover_idx on public.bt_handover_items (handover_id);
-- ⚠️ 这两个是**部分**唯一索引，Postgres 的 ON CONFLICT 匹配不到它们，
-- 所以应用层用「先查后插」而不是 upsert（见 lib/db.ts 的 addHandoverItems）。
create unique index bt_handover_items_memory_uk on public.bt_handover_items (handover_id, memory_id)
  where item_type = 'memory';
create unique index bt_handover_items_file_uk on public.bt_handover_items (handover_id, file_id)
  where item_type = 'file';
create index bt_handover_items_memory_idx on public.bt_handover_items (memory_id)
  where memory_id is not null;
create index bt_handover_items_file_idx on public.bt_handover_items (file_id)
  where file_id is not null;

-- ========== 7. 跨 Agent 提问日志 ==========
create table public.bt_agent_queries (
  id uuid primary key default gen_random_uuid(),
  asking_employee_id uuid not null references public.bt_employees(id) on delete restrict,
  target_employee_id uuid references public.bt_employees(id) on delete set null,
  query_text text not null,
  answer_text text,
  matched_memory_ids uuid[] not null default '{}',
  matched_chunk_ids uuid[] not null default '{}',
  was_cross_employee boolean not null default false,
  hop int not null default 0,
  latency_ms int,
  created_at timestamptz not null default now()
);
comment on table public.bt_agent_queries is '接棒：问答与跨人提问日志，记录谁问了谁、命中了什么';
comment on column public.bt_agent_queries.hop is '跳数：0=问自己，1=问同事。⛔ 不允许出现 2（防无限套娃）';

create index bt_agent_queries_asking_idx on public.bt_agent_queries (asking_employee_id, created_at desc);
create index bt_agent_queries_target_idx on public.bt_agent_queries (target_employee_id, created_at desc);
