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

## ⚠️ #3 · 飞书新应用凭据拿不到，服务器 Agent 层还差最后一跳
- 时间：2026-07-31 01:25（P6）
- 关联 AC：AC-8.3.2（标 SKIPPED，这是 AC-8.3.3 明确允许的降级）
- 现象：新建飞书应用必须在飞书开放平台后台人工点击，无人值守拿不到 App ID / App Secret
- 已尝试：确认 tky 上有 `lark-cli`，但它只能用已有凭据消费事件，不能创建应用
- 结论：外部依赖问题（需要人在后台点几下），不是实现问题
- 影响范围：三个 Agent 目前只能通过 `POST http://127.0.0.1:8791/ask` 问到，飞书私聊那一跳还没通
- 明早怎么处理（10 分钟能做完）：
  1. 飞书开放平台 → 创建企业自建应用「接棒 Baton」→ 拿 App ID / App Secret
     ⛔ **必须是新应用**，不要复用拉斐尔的——两个长连接用同一个 App ID 会互相抢答
  2. 把凭据写进 `/root/baton-agent/.env`（那个文件已经是 600 权限）
  3. 照抄 `/etc/systemd/system/feishu-bot.service` 的结构**另起一份** `baton-feishu.service`
     （`lark-cli event consume im.message.receive_v1 --as bot | <bridge脚本>`），
     bridge 脚本把消息转成 `POST http://127.0.0.1:8791/ask`
     ⛔ 不要改 `feishu-bot.service` 本身
  4. 应用权限至少要 `im:message`、`im:message:send_as_bot`

## ⚠️ #4 · tky 上 feishu-bot.service 把 DEEPSEEK_API_KEY 明文写在 unit 里
- 时间：2026-07-31 01:20（P6 采证时顺手发现，⛔ 今晚没动它）
- 关联 AC：无（不是 Baton 的 AC，是顺手发现的安全隐患）
- 现象：`/etc/systemd/system/feishu-bot.service` 用 `Environment=DEEPSEEK_API_KEY=...` 明文写死，
  不是 `EnvironmentFile=`。任何能跑 `systemctl cat feishu-bot` 的人都能看到明文
- 已尝试：**刻意没修**——改 unit 需要重启生产 bot（拉斐尔），今晚的红线是不碰现有服务
- 影响范围：拉斐尔的 DeepSeek key 暴露给任何能读该 unit 的人
- 明早怎么处理：把 key 挪进一个 600 权限的 EnvironmentFile，改 unit 后 `daemon-reload` + `restart feishu-bot`，
  然后去 DeepSeek 后台轮换一次这把 key

## ℹ️ #5 · 施工包里关于 grok-shim 的描述与实际不符
- 时间：2026-07-31 00:56
- 现象：施工包 `06` §2.2 把 `grok-shim.service` 列为「🔴 生产核心，Hermes 大脑依赖」，
  实测它 `disabled` 且 `ActiveEnterTimestamp` 为空（从没启动过）；施工前快照里也没有它
- 结论：不是我弄停的（有施工前快照为证）。Hermes default profile 的模型已经是 `step-router-v1 (stepfun)`，
  大脑看起来早就从 grok 换走了
- 明早怎么处理：确认一下，顺手把这条资料更新掉，免得下次误判
