# Spec 008: 服务器 Agent 层（纯增量，可整体降级）

- 状态：DRAFT
- 所属阶段：P6
- 依赖：003
- 影响模块：东京 VPS（`tky`）上的**新增**文件与 unit，⛔ 不触碰任何现有服务

## 1. 目标（一句话）

在东京 VPS 上**增量**加一层「每个员工一个 Hermes profile」的 Agent 服务，让飞书私聊能问到各自的资料——前提是这台机器当时是健康的。

## 2. 用户故事

作为一名销售，我想要在飞书里私聊我自己的 Agent 问客户情况，以便不用打开网页也能查到自己的资料。

## 3. 场景与验收准则

### 场景 8.1：增量安全（最高优先级）

- **AC-8.1.1**：THE SYSTEM SHALL 在施工前后各做一次现有服务存活快照，且施工后 `feishu-bot`、`hermes-gateway`、`ashare-auto-git` 等原有服务状态与施工前一致。
- **AC-8.1.2**：THE SYSTEM SHALL ⛔ 不执行任何 `rm` / `systemctl stop|disable` / `pip uninstall` / 覆盖已有 `.env` 的操作。
- **AC-8.1.3**：THE SYSTEM SHALL 在任何新增操作前，先备份将被读取或影响的配置文件到带日期的副本。

### 场景 8.2：多 profile

- **AC-8.2.1**：THE SYSTEM SHALL 新建三个 Hermes profile（`emp_wang` / `emp_li` / `emp_zhao`），各自家目录独立。
- **AC-8.2.2**：WHEN 分别向三个 profile 提同一个问题 THE SYSTEM SHALL 使回答互不串台（各答各的资料）。
- **AC-8.2.3**：THE SYSTEM SHALL 为每个 profile 写入 SOUL 铁律：涉及客户/报价/合同/供应商/交接的问题必须先检索、回答必须带出处、检索不到就说「我的资料里没有」、⛔ 绝对禁止凭记忆编造。

### 场景 8.3：瘦服务与飞书

- **AC-8.3.1**：THE SYSTEM SHALL 提供一个只绑 `127.0.0.1` 的转发服务，按员工分队列（不同人并行、同一人串行）。
- **AC-8.3.2**：WHERE 飞书新应用凭据可用 THE SYSTEM SHALL 以长连接接入，且使用**独立的 App ID**（⛔ 不复用拉斐尔的应用）。
- **AC-8.3.3**：IF 飞书凭据不可用 THEN THE SYSTEM SHALL 跳过飞书接入，仅完成命令行验证，并在 blockers 中记录。

## 4. 非功能要求

- 安全红线：服务器安全 > 功能进度。健康门（1 分钟 load < 8 + 监控 10 分钟内有新行 + journald active）不过则整体降级为只读采证。
- SSH 卫生：一次连接跑一串命令，⛔ 禁止密集短连接（历史 kworker 风暴的触发条件）。
- 资源：新增 unit 必须带 `MemoryMax=2G` / `CPUQuota=100%`。

## 5. 明确不做（Out of Scope）

- 不改任何现有 systemd unit。
- 不修 `feishu-bot.service` 里明文 `DEEPSEEK_API_KEY` 的隐患（记 blocker，人类明天处理）。
- 不做 Hermes 本体升级 / 重装。

## 6. 数据契约

- 网页侧对外只暴露 `GET /api/search`（Agent 层反向 HTTP 调用），带员工作用域。
- VPS 侧新增文件路径全部以 `baton` 命名，与现有资产零重名。

## 7. 测试映射表

| AC 编号 | 层级 | 测试文件 | 备注 |
|---|---|---|---|
| AC-8.1.1 | 人工采证 | docs/night/vps-health.md | 施工前后两次快照对比 |
| AC-8.1.2 | 人工采证 | docs/night/vps-health.md | 命令清单可审计 |
| AC-8.1.3 | 人工采证 | docs/night/vps-health.md | 备份目录 ls 输出 |
| AC-8.2.1 | 人工采证 | docs/night/vps-health.md | profile 目录 ls |
| AC-8.2.2 | 人工采证 | docs/night/vps-health.md | 同题三答对比 |
| AC-8.2.3 | 人工采证 | docs/night/vps-health.md | SOUL 文件内容 |
| AC-8.3.1 | 人工采证 | docs/night/vps-health.md | `ss -tlnp` 只绑 127.0.0.1 |
| AC-8.3.2 | 人工采证 | docs/night/vps-health.md | 新 App ID 长连接 |
| AC-8.3.3 | 人工采证 | docs/night/blockers.md | 凭据不可用时的降级记录 |

> ⚠️ 本 spec 的验收**不是自动化测试**，而是服务器采证文件。这是刻意的：不允许为了跑测试而在生产服务器上引入任何新的运行时依赖。
