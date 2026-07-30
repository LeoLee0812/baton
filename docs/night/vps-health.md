# 东京 VPS（tky）采证与 P6 施工记录

采证时间：2026-07-31 00:51 → 01:25（施工前后各一次快照）
机器：`agent-tky-01`，Ubuntu 24.04.4 LTS，8 核 / 62G 内存 / 450G 盘

---

## 1. 健康门（施工前，00:51）

施工包写的是「勘察时这台机器正在闹负载风暴，load 107 / CPU steal 94% / journald 崩了 3 次 / 监控脚本自己卡死」。
**开工前实测：风暴已经过去，三项健康门全部通过。**

| 门槛 | 要求 | 实测 | 结论 |
|---|---|---|---|
| 1 分钟 load average | < 8 | **0.29** | ✅ |
| `/root/monitor/sysmon.log` | 最近 10 分钟内有新行 | 00:50:01 有新行（当时 00:51） | ✅ |
| `systemd-journald` | active 且没在持续重启 | `active`，`NRestarts=3`（**是风暴期间那 3 次，施工全程没有增加**） | ✅ |

监控最近几行（施工前）：

```
[2026-07-31 00:40:01] ok cpu=1.2% steal=0.0% mem=4.6% swap=0.5% load=0.00/8 net_bad=00
[2026-07-31 00:45:01] ok cpu=1.5% steal=0.0% mem=4.5% swap=0.5% load=0.05/8 net_bad=00
[2026-07-31 00:50:01] ok cpu=0.9% steal=0.0% mem=4.6% swap=0.5% load=0.23/8 net_bad=00
```

CPU steal 已回到 0.0%（勘察时是 94.46%）。**健康门通过，因此按 `06-技术资料` §3 进入增量施工。**

⚠️ 全程遵守「一次 SSH 连接跑一串命令」——密集短连接正是历史 kworker 风暴的触发条件。整个 P6 一共开了 11 次 SSH 连接。

---

## 2. AC-8.1.1 · 施工前后服务存活快照对比 ⭐ 这条最重要

施工前快照存在 `/root/backup-baton-20260731-0055/`（`services-before.txt` 44 行 / `docker-before.txt` 9 行）。

**systemd 服务差异（施工后 diff 施工前）：**

```
> baton-agentd.service
```

**只多了一个我今晚新建的服务，一个都没少。**

**docker 容器差异：**

```
（无差异）
```

9 个容器（firecrawl 系列 5 个、new-api、llm-relay-postgres、llm-relay-redis、blissful_moser）全部原样存活。

**生产核心服务逐个复查（施工后）：**

| 服务 | 状态 |
|---|---|
| `hermes-gateway` | **active** |
| `feishu-bot`（拉斐尔） | **active** |
| `ollama` | **active** |
| `nginx` | **active** |
| `docker` | **active** |
| `redis-server` | **active** |
| `scribe-api` | **active** |
| `sing-box` | **active** |
| `fail2ban` | **active** |
| `n8n` | inactive |
| `grok-shim` | inactive / disabled |

⚠️ **`grok-shim` 和 `n8n` 在施工前就已经是停的**，不是我弄停的——证据：施工前快照 `services-before.txt` 里 `grep -c grok` = **0**，且 `systemctl is-enabled grok-shim` = `disabled`、`ActiveEnterTimestamp` 为空（从没启动过）。
施工包 §2.2 把 `grok-shim` 标成「🔴 生产核心，Hermes 大脑依赖」，与实际状态不符，**建议明早确认一下 Hermes 现在的大脑是不是已经换成 stepfun 了**（`profile show default` 显示 Model = `step-router-v1 (stepfun)`，确实不再走 grok）。

**资源（施工后）**：load 0.23 / 内存用 2.9G（共 62G）/ 磁盘 97G（共 450G，余 334G）。

---

## 3. AC-8.1.3 · 备份

施工前第一件事就是备份，目录 `/root/backup-baton-20260731-0055/`（`chmod 700`）：

```
hermes.env.bak             26316 字节   /root/.hermes/.env 的副本
hermes.config.yaml.bak      4921 字节   /root/.hermes/config.yaml 的副本
feishu-bot.service           615 字节   原样副本
hermes-gateway.service      1009 字节   原样副本
services-before.txt          911 字节   施工前运行中的 44 个服务
docker-before.txt            173 字节   施工前运行中的 9 个容器
```

---

## 4. AC-8.1.2 · 今晚在这台机器上做过的**全部**操作

**只新增，没有修改任何现有文件，没有停过任何服务。**

| 类型 | 路径 | 说明 |
|---|---|---|
| 新建目录 | `/root/backup-baton-20260731-0055/` | 备份 |
| 新建目录 | `/root/baton-agent/` | 检索脚本 + 瘦服务，700 权限 |
| 新建文件 | `/root/baton-agent/.env` | 只含接棒站地址与访问密码，600 权限 |
| 新建文件 | `/root/baton-agent/baton-kb.sh` | 按员工身份调 `/api/search` |
| 新建文件 | `/root/baton-agent/render.py` | 把检索 JSON 渲染成「出处 + 正文」 |
| 新建文件 | `/root/baton-agent/agentd.py` | 瘦转发服务（纯标准库） |
| 新建 profile | `/root/.hermes/profiles/emp_wang` | `hermes profile create --clone` |
| 新建 profile | `/root/.hermes/profiles/emp_li` | 同上 |
| 新建 profile | `/root/.hermes/profiles/emp_zhao` | 同上 |
| 新建 unit | `/etc/systemd/system/baton-agentd.service` | 带 `MemoryMax=1G` / `CPUQuota=50%` / `TasksMax=64` |
| 执行 | `systemctl daemon-reload` + `enable --now baton-agentd` | 只作用于新 unit |

**⛔ 全程没有执行过**：`rm` / `systemctl stop|disable|mask`（对任何现有服务）/ `pip uninstall` / `apt remove` / `kill` / 覆盖任何已存在的 `.env` / 修改任何现有 systemd unit。

`hermes profile create --clone` 是纯增量：它在 `profiles/` 下新建目录并从 default 复制一份 config / .env / SOUL.md / skills，**不动 default 本身**。施工后 `profile list` 里 `default` 的 Gateway 仍是 `running`。

---

## 5. AC-8.2.1 · 三个 Hermes profile

```
 Profile          Model                        Gateway      Alias
 ◆default         step-router-v1               running      —
  emp_li          step-router-v1               stopped      emp_li
  emp_wang        step-router-v1               stopped      emp_wang
  emp_zhao        step-router-v1               stopped      emp_zhao
```

各自家目录独立：`/root/.hermes/profiles/emp_{wang,li,zhao}/`，各有自己的 `config.yaml` / `.env` / `SOUL.md` / `sessions` / `memories`。

⚠️ 施工包 §2.3 说「`-p <profile>` 的确切语义没验证到，上一版方案里的命令未经实证」。
**实测结论**：Hermes 有一级子命令 `profile`（`list/use/create/delete/describe/show/alias/rename/export/import/install/update/info`），
切换 profile 靠 **`HERMES_HOME` 环境变量**指向 `profiles/<name>`，或用它自动生成的包装脚本 `/root/.local/bin/emp_wang`。
`profile create` 的真实参数是 `--clone` / `--clone-all` / `--clone-from` / `--no-alias` / `--no-skills` / `--description`。

---

## 6. AC-8.2.2 · 三个 profile 各答各的（⭐ 关键验证）

同一个问题「宏远建材的账期是多久？」分别问三个 profile：

**emp_wang（王销售，资料的主人）**
```
宏远建材的账期是月结 60 天。这是 2024 年单独谈下来的特例，同规模客户都是月结 30 天。

出处：
- 华东区客户资料汇总.xlsx · Sheet1!2行
- 宏远建材-2026年度报价单.pdf · 第 4 页
```

**emp_li（李销售，网页侧刚从王销售那里接过这条）**
```
宏远建材的账期是月结 60 天。这是 2024 年单独谈下来的特例，同规模客户都是月结 30 天。
> 出处：宏远建材-2026年度报价单.pdf 第 4 页（来源：王销售 交接，2026-07-30）
```

**emp_zhao（赵采购，与销售客户无关）**
```
我的资料里没有查到宏远建材的账期信息。
```

三点同时成立：
1. **不串台**——赵采购问不到销售侧的东西
2. **网页侧的交接链路一路传到了服务器 Agent 层**——李销售的答案里自动带出了「来源：王销售 交接，2026-07-30」，这条标注不是写死的，是 `/api/search` 根据 `bt_handover_items.granted_at` 算出来的
3. **回答都带真出处**（第 4 页确实就是账期那一页）

---

## 7. AC-8.2.3 · SOUL 铁律

三个 profile 的 `SOUL.md` 都被替换成了接棒的员工助手人设（1.6KB 左右，远低于注入上限），核心条款：

```markdown
## 铁律（不可违背）
1. 涉及任何客户、报价、合同、供应商、交接的问题，必须先执行检索：
   /root/baton-agent/baton-kb.sh <code> "<关键词>"
2. 回答必须带出处，原样引用检索结果里的「出处：文件名 · 第几页 / 章节 / 行区间」。
3. ⛔ 绝对禁止凭记忆编造。检索不到就说「我的资料里没有」，然后停下。
   你训练时见过的公司名、人名、价格，在这里一律不算数。
4. 检索结果里若带「来源：<前任> 交接，<日期>」，回答时必须一起说出来。
5. 你只看得见 <员工> 的资料。别人的资料你看不到，也不许猜。
```

第 6 节的三条实答就是这套铁律生效的证据：模型确实先跑了检索脚本，且赵采购那条老老实实说了「没有」而不是编一个账期出来。

---

## 8. AC-8.3.1 · 瘦服务 `baton-agentd`

```ini
# /etc/systemd/system/baton-agentd.service（全新 unit，⛔ 没改任何现有 unit）
ExecStart=/usr/bin/python3 /root/baton-agent/agentd.py
MemoryMax=1G
CPUQuota=50%
TasksMax=64
NoNewPrivileges=yes
Restart=on-failure
```

**只绑 127.0.0.1，⛔ 不暴露公网**（实测）：

```
LISTEN 0  5  127.0.0.1:8791  0.0.0.0:*  users:(("python3",pid=3335061,fd=3))
```

- 本机 `curl http://127.0.0.1:8791/health` → `{"ok": true, "service": "baton-agentd", "profiles": ["li","wang","zhao"]}`
- 从公网口 `curl http://66.42.32.208:8791/health` → **HTTP 000（连不上）**，符合预期

端口 8791 是**先看了 `ss -tlnp` 确认未被占用**才选的，⛔ 没有硬编码 8000-8100 段（那一段常被占）。

**按员工分队列（不同人并行、同一人串行）实测**：三个员工同时问同一个问题，

```
[zhao] 我的资料里没有复合地板年框价的相关记录。
[wang] 复合地板年框价是 186 元/㎡。 出处：宏远建材-2026年度报价单.pdf 第 2 页
[li]   宏远建材的复合地板年框价是 186 元/㎡；单笔满 800 ㎡可再让 3 个点，最低到 180.4 元/㎡，
       再往下需审批。 出处：宏远建材-2026年度报价单.pdf 第 2 页（来源：王销售 交接，2026-07-30）
三人并行总耗时：29 秒
```

29 秒 ≈ 单个 Agent 的响应时间，说明三个人确实是并行跑的（串行的话要 90 秒左右）。
同一人的并发请求会在锁上排队——Hermes 是有状态会话，同一 profile 并发会互相踩上下文，这是踩过的坑。

未知员工被拒：`{"ok": false, "error": "未知员工：hacker（可选 ['li','wang','zhao']）"}`

服务实际占用：`MemoryCurrent=10.4MB`（上限 1G）。

---

## 9. AC-8.3.2 / AC-8.3.3 · 飞书接入 → **SKIPPED**

飞书新应用必须在飞书开放平台后台**人工点击创建**才能拿到 App ID / App Secret，无人值守做不了。
按 AC-8.3.3 的明确规定跳过，只完成命令行与 HTTP 验证，并在 `blockers.md` 记了一条带完整操作步骤的待办。

⛔ **刻意没有复用拉斐尔（`feishu-bot.service`）的 App ID**——两个长连接用同一个应用会互相抢答。
（已确认：不同 App ID 的长连接各收各的事件，飞书按应用维度隔离事件订阅，所以拿到新凭据后照抄
`feishu-bot.service` 的结构**另起一份 unit** 即可，⛔ 不要改原文件。）

---

## 10. 顺手发现、但今晚**没动**的两件事

1. 🔴 **`feishu-bot.service` 把 `DEEPSEEK_API_KEY` 明文写在 `Environment=` 行上**（不是 `EnvironmentFile=`）。
   任何能跑 `systemctl cat feishu-bot` 的人都能看到明文。
   今晚没修——改 unit 要重启生产 bot。已记进 `blockers.md`。
2. `grok-shim` 已 disabled，但施工包把它列为「Hermes 大脑依赖的生产核心」。
   实际 Hermes default profile 的模型是 `step-router-v1 (stepfun)`，看起来大脑早就换过了。
   建议明早顺手把这条资料更新一下。
