# 架构决策记录（P0 定，全夜不改）

记录时间：2026-07-30 23:37:53

## D1 · Supabase 访问密钥与 RLS 方案

- **结论：方案 B**（publishable key + `using(true)` RLS，隔离 100% 靠应用层）
- **证据**（命令与输出）：
  - `grep -rl "SERVICE_ROLE|service_role|sb_secret_" ~/personal/*/.env.local` → 只命中 `brainknowledge-web/.env.local`
  - 进一步核查该文件：`SUPABASE_SERVICE_ROLE_KEY` 那一行是**注释掉的空值**（`awk` 测得值长度 = 0）
  - `grep -ril "service_role|sb_secret" ~/Desktop/配置信息/` → **0 命中**
  - `vercel env ls production`（english-daily）→ 14 个变量，**无任何 service_role / secret key**
- **影响**：
  - 数据库层不提供隔离能力，任何拿到 publishable key 的人都能直连 PostgREST 读全部 `bt_` 数据
  - 因此 `lib/db.ts` 的 `scopedQuery(employeeId)` 单一入口是**唯一**的隔离防线，必须有守卫测试（AC-1.3.4）
  - README 必须有「安全边界」章节明写这一点，blockers.md 记一条待人类补 service key

## D2 · 原始文件存储

- **结论：Vercel Blob 客户端直传为主，Supabase Storage / inline 为降级**
- **证据**：DDL 已设计 `storage_provider` + `storage_url` 两列，三种后端都能表达；Vercel 函数请求体上限 4.5MB，大文件必须绕过函数
- **影响**：
  - `vercel blob create-store` 跑之前**必须** `cp .env.local .env.local.bak`（历史教训：这条命令覆写过 .env.local）
  - 本地开发收不到 `onUploadCompleted` 回调（Blob 回调不到 localhost），建档改为前端拿到 blob.url 后**显式**调 `POST /api/files`
  - 若拿不到 `BLOB_READ_WRITE_TOKEN`，降级为 `storage_provider='inline'`（≤4MB，文本直接入库，不存原文件），此时 AC-5.1.4「原始文件一起交接」按可见权授予仍成立，只是没有可下载的原文件

## D3 · embedding key

- **结论：复用 english-daily 的云雾 key（`https://yunwu.ai/v1` + `text-embedding-3-small`）**
- **证据**：`~/personal/english-daily/.env.local` 有 `YUNWU_API_KEY`（长度 51）与 `YUNWU_API_BASE`；云雾后台建新 key 需人工登录，今晚做不了
- **影响**：
  - key 只写进本项目的 `.env.local`（已 gitignore）和 Vercel 环境变量，⛔ 不进 git
  - blockers 记一条：待人类在云雾后台建 `baton` 专属 key 并在 Vercel 替换
  - 若 embedding 调不通，降级为只做 pg_trgm 模糊检索，chunk 照常入库（`embedding_status='failed'`，允许补跑）
