-- 接棒 Baton · 004 可见权判断函数
-- 作用域 = 自己拥有的 ∪ 已通过 status='completed' 的交接单授予给自己的

create or replace function public.bt_can_access_file(p_employee_id uuid, p_file_id uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.bt_files f
                 where f.id = p_file_id and f.owner_employee_id = p_employee_id)
      or exists (select 1 from public.bt_handover_items hi
                 join public.bt_handovers h on h.id = hi.handover_id
                 where hi.item_type = 'file' and hi.file_id = p_file_id
                   and h.to_employee_id = p_employee_id and h.status = 'completed');
$$;

create or replace function public.bt_can_access_memory(p_employee_id uuid, p_memory_id uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.bt_memories m
                 where m.id = p_memory_id and m.owner_employee_id = p_employee_id)
      or exists (select 1 from public.bt_handover_items hi
                 join public.bt_handovers h on h.id = hi.handover_id
                 where hi.item_type = 'memory' and hi.memory_id = p_memory_id
                   and h.to_employee_id = p_employee_id and h.status = 'completed');
$$;

comment on function public.bt_can_access_memory(uuid, uuid) is
  '⚠️ 刻意不含 visible_to_colleagues：那个开关只在跨人提问路径（SPEC-006）生效，不能让同事在自己的知识库页直接看到别人的条目。两条路径必须分开——这是最容易写错、且会造成越权可见的一处。';
