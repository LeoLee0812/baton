# Spec 005: 交接（项目的心脏）

- 状态：ACTIVE
- 所属阶段：P4
- 依赖：001、003、004
- 影响模块：`lib/handover.ts`、`app/api/handover/*`、`app/(console)/handover/*`、`app/(console)/records/*`

## 1. 目标（一句话）

把「一个人手上的资料交给另一个人」变成一次可勾选、可预览、需对方确认、且全程留痕的授予事件——**授予可见权，绝不搬走数据**。

## 2. 用户故事

作为要换岗的销售，我想要勾选我愿意交出去的条目和文件、让接手人确认后才生效，以便我既完成了交接，又不会把不该给的东西一起漏出去。

## 3. 场景与验收准则

### 场景 5.1：发起

- **AC-5.1.1**：WHEN 用户选择「从 A 交给 B」并选择原因（离职/换岗/日常同步） THE SYSTEM SHALL 创建一张 `status='draft'` 的交接单。
- **AC-5.1.2**：IF A 与 B 是同一人 THEN THE SYSTEM SHALL 拒绝创建。
- **AC-5.1.3**：THE SYSTEM SHALL 默认勾选 A 名下所有 `include_in_handover_default = true` 的记忆条目，用户可逐条增删。
- **AC-5.1.4**：THE SYSTEM SHALL 允许在同一张交接单里勾选原始文件（`item_type='file'`）。
- **AC-5.1.5**：WHEN 用户点击「交接预览」 THE SYSTEM SHALL 生成一份「接手人会看到什么」的摘要，列出条目数、文件数、按类型分组。

### 场景 5.2：确认与生效

- **AC-5.2.1**：WHEN 发起方提交 THE SYSTEM SHALL 把交接单置为 `submitted` 并记录 `submitted_at`，此时接手人**尚不能**访问任何内容。
- **AC-5.2.2**：WHEN 接手人确认 THE SYSTEM SHALL 把交接单置为 `completed`、回填 `completed_at` 与每条明细的 `granted_at`，此后接手人可访问被勾选内容。
- **AC-5.2.3**：THE SYSTEM SHALL ⛔ 不修改被交接内容的 `owner_employee_id`（交接是授予可见权，不是搬走数据，原始归属必须留痕）。
- **AC-5.2.4**：WHEN 交接完成 THE SYSTEM SHALL 使**未被勾选**的内容对接手人依然不可见（这条要有专门的负向测试）。
- **AC-5.2.5**：THE SYSTEM SHALL 在交接页以三步进度展示状态：已发起 → 对方已查看 → 对方已确认。

### 场景 5.3：记录与封存

- **AC-5.3.1**：THE SYSTEM SHALL 在记录页展示每笔交接：谁、何时、交了哪些、交给谁、对方何时确认。
- **AC-5.3.2**：WHEN 一名员工 `status` 变为 `offboarded` THE SYSTEM SHALL 把其未交接内容标记为「已随账号封存」并在记录页展示，⛔ 不删除数据。
- **AC-5.3.3**：THE SYSTEM SHALL 使交接记录不可编辑（只增不改）。

## 4. 非功能要求

- 安全：授予判断只认 `status='completed'` 的交接单，其余状态一律视为无授予。
- 审计：`bt_handover_items` 本身即授予记录，`granted_at` 是生效时刻的凭证。
- 数据安全：任何情况下都不执行 `update bt_memories set owner_employee_id = ...`。

## 5. 明确不做（Out of Scope）

- 不做交接的撤销 / 收回可见权（cancelled 状态留了但今晚只用于草稿作废）。
- 不做多级审批。
- 不做交接到多人（一张单一个接手人）。

## 6. 数据契约

- 表：`bt_handovers`、`bt_handover_items`
- API：
  - `POST /api/handover` `{ fromCode, toCode, reason }` → 创建 draft（自动带入默认勾选）
  - `GET /api/handover?employee=` → 我发起的 / 待我确认的
  - `GET /api/handover/[id]` → 详情 + 明细 + 预览摘要
  - `PATCH /api/handover/[id]/items` `{ add: [], remove: [] }`
  - `POST /api/handover/[id]/submit`
  - `POST /api/handover/[id]/view`（接手人打开即记 viewed）
  - `POST /api/handover/[id]/confirm`

## 7. 测试映射表

| AC 编号 | 层级 | 测试文件 | 备注 |
|---|---|---|---|
| AC-5.1.1 | integration | tests/integration/handover-flow.test.ts | 建单为 draft |
| AC-5.1.2 | integration | tests/integration/handover-flow.test.ts | 同一人 → 抛具体错误 |
| AC-5.1.3 | integration | tests/integration/handover-flow.test.ts | 默认勾选数 = default=true 的条目数 |
| AC-5.1.4 | integration | tests/integration/handover-flow.test.ts | 可加 file 明细 |
| AC-5.1.5 | integration | tests/integration/handover-flow.test.ts | 预览摘要按类型分组计数 |
| AC-5.2.1 | integration | tests/integration/handover-scope.test.ts | submitted 后接手人仍查不到 |
| AC-5.2.2 | integration | tests/integration/handover-scope.test.ts | confirmed 后 granted_at 有值且可访问 |
| AC-5.2.3 | integration | tests/integration/handover-scope.test.ts | owner_employee_id 前后不变 |
| AC-5.2.4 | integration | tests/integration/handover-scope.test.ts | **负向**：未勾选的仍不可见 |
| AC-5.2.5 | e2e | tests/e2e/handover.spec.ts | 三步进度条文案 |
| AC-5.3.1 | integration | tests/integration/handover-flow.test.ts | 记录查询返回完整字段 |
| AC-5.3.2 | integration | tests/integration/handover-flow.test.ts | offboarded 后未交接内容标封存，数据仍在 |
| AC-5.3.3 | integration | tests/integration/handover-flow.test.ts | completed 单再改明细 → 抛具体错误 |
