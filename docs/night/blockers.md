# Blocker 记录（按严重度排序）

## ⚠️ #1 · 拿不到 Supabase service_role key，数据库层没有隔离兜底
- 时间：2026-07-30 23:26（P0 决策 D1）
- 关联 AC：AC-1.3.1 / AC-1.3.2 / AC-3.2.1
- 现象：本机 `~/personal/*/.env.local`、`~/Desktop/配置信息/`、Vercel 现有项目环境变量三处全查，都没有 service_role / secret key
- 已尝试：
  1. `grep -rl "SERVICE_ROLE|service_role|sb_secret_" ~/personal/*/.env.local` → 唯一命中的 brainknowledge-web 里那行是注释掉的空值
  2. `grep -ril "service_role|sb_secret" ~/Desktop/配置信息/` → 0 命中
  3. `vercel env ls production`（english-daily）→ 14 个变量里没有
- 结论：外部依赖问题（密钥需人类从 Supabase 控制台取），不是实现问题
- 影响范围：`bt_` 表沿用 Leo-hub 现有风格 `using(true)` 全开 RLS。**员工隔离 100% 靠应用层 `scopedQuery`**。任何拿到 publishable key 的人可直连 PostgREST 读全部 `bt_` 数据
- 明早怎么处理：Supabase 控制台 → Leo-hub → Project Settings → API → 复制 service_role key → 加进 Vercel 环境变量 `SUPABASE_SERVICE_ROLE_KEY`（⛔ 不要加 NEXT_PUBLIC_ 前缀），然后把 `bt_` 表的 `using(true)` policy 收紧为默认拒绝

## ⚠️ #2 · 云雾 API key 是从 english-daily 借的，不是 baton 专属
- 时间：2026-07-30 23:26（P0 决策 D3）
- 关联 AC：AC-2.3.2 / AC-4.1.1
- 现象：云雾现在是一个项目一把 key，新建需要人工登录后台，今晚做不了
- 已尝试：复用 `~/personal/english-daily/.env.local` 的 `YUNWU_API_KEY` 跑通（只写进本地 .env.local 和 Vercel env，不进 git）
- 结论：外部依赖问题
- 影响范围：baton 和 english-daily 共用配额，用量统计混在一起
- 明早怎么处理：云雾后台建一把 `baton` 专属 key，`vercel env rm YUNWU_API_KEY` 后重新 add，再 push 触发重新部署
