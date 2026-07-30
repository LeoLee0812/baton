# Spec 006: 跨 Agent 提问

- 状态：ACTIVE
- 所属阶段：P4
- 依赖：003、004
- 影响模块：`lib/ask.ts`、`app/api/ask/route.ts`、`app/(console)/records/*`

## 1. 目标（一句话）

让我的 Agent 在自己资料里查不到时，去问同事的 Agent——但只能问到对方明确开放的那部分，且只允许一跳。

## 2. 用户故事

作为一名销售，我想要在自己资料里查不到某个供应商时直接问采购同事的 Agent，以便不用打断真人也能拿到答案，同时对方能控制自己开放了哪些内容。

## 3. 场景与验收准则

### 场景 6.1：问同事

- **AC-6.1.1**：WHEN 员工 A 的问答在自己库中检索为空 THE SYSTEM SHALL 允许向指定同事 B 发起一次跨人提问。
- **AC-6.1.2**：THE SYSTEM SHALL 只在 B 的 `visible_to_colleagues = true` 的记忆范围内作答，⛔ 不得触及 B 的其他内容。
- **AC-6.1.3**：THE SYSTEM SHALL 只允许**一跳**：由跨人提问触发的回答，⛔ 不得再次触发对第三人的提问（防无限套娃）。
- **AC-6.1.4**：WHEN 跨人提问返回结果 THE SYSTEM SHALL 在答案中明确标注「以下来自 <同事> 的 Agent」。
- **AC-6.1.5**：THE SYSTEM SHALL 为每次跨人提问落一条 `bt_agent_queries` 记录，`was_cross_employee = true`。

### 场景 6.2：记录

- **AC-6.2.1**：THE SYSTEM SHALL 在记录页的「跨人提问」tab 展示：谁问了谁、什么时候、问了什么、拿到了什么、依据是哪条。

## 4. 非功能要求

- 安全：跨人检索走**专门的函数**（只扫 `visible_to_colleagues=true` 的 memories），⛔ 不复用 `bt_can_access_memory`（后者是交接授予语义，两条路径必须分开）。
- 防滥用：`hop` 字段硬性限制 ≤ 1，`hop >= 1` 时任何跨人分支都被拒绝。

## 5. 明确不做（Out of Scope）

- 不做跨人访问原始文件 / chunk（只开放记忆条目）。
- 不做同事的授权审批流（开关即授权）。
- 不做多跳链式提问。

## 6. 数据契约

- 表：`bt_agent_queries`（`was_cross_employee`、`hop`、`target_employee_id`）
- API：`POST /api/ask { question, employeeCode, askColleagueCode? }`
- 返回：`{ answer, citations: [{label, source}], crossEmployee: boolean, targetName?, hop }`

## 7. 测试映射表

| AC 编号 | 层级 | 测试文件 | 备注 |
|---|---|---|---|
| AC-6.1.1 | integration | tests/integration/cross-agent.test.ts | 自己空 → 允许跨人 |
| AC-6.1.2 | integration | tests/integration/cross-agent.test.ts | **负向**：visible=false 的条目问不到 |
| AC-6.1.3 | integration | tests/integration/cross-agent.test.ts | hop=1 时再跨人 → 抛具体错误 |
| AC-6.1.4 | integration | tests/integration/cross-agent.test.ts | 答案含「以下来自 X 的 Agent」 |
| AC-6.1.5 | integration | tests/integration/cross-agent.test.ts | 日志 was_cross_employee=true |
| AC-6.2.1 | integration | tests/integration/cross-agent.test.ts | 记录查询返回问答双方与依据 |
