# Spec 004: 记忆条目

- 状态：ACTIVE
- 所属阶段：P3
- 依赖：002、003
- 影响模块：`lib/extract.ts`、`app/api/memory/route.ts`、`app/api/memory/[id]/route.ts`、`app/api/memory/extract/route.ts`、`app/(console)/memory/*`

## 1. 目标（一句话）

把文档里"值得交接的结论"抽成一条条可读、可改、可开关的记忆条目，每条都指得回原文。

## 2. 用户故事

作为一名要离职的销售，我想要系统把我资料里的关键约定自动整理成条目，以便我只需要审一遍、改几个字，就能把它们交给接手的同事。

## 3. 场景与验收准则

### 场景 4.1：抽取

- **AC-4.1.1**：WHEN 对一份已入库文件执行「抽取」 THE SYSTEM SHALL 产出若干 `bt_memories` 记录，每条带 `source_file_id` 与 `source_chunk_id`。
- **AC-4.1.2**：THE SYSTEM SHALL 把每条记忆归入五类之一：`客户约定 / 报价底线 / 供应商渠道 / 人际雷区 / 流程习惯`。
- **AC-4.1.3**：IF LLM 返回的结构不符合预期 schema THEN THE SYSTEM SHALL 拒绝写库并记录错误，⛔ 不许写入半成品数据。
- **AC-4.1.4**：THE SYSTEM SHALL 使重复抽取同一文件不产生重复条目（按 `source_chunk_id` + 标题去重）。

### 场景 4.2：编辑与开关

- **AC-4.2.1**：WHEN 用户就地编辑一条记忆的正文并保存 THE SYSTEM SHALL 持久化新内容并更新 `updated_at`。
- **AC-4.2.2**：THE SYSTEM SHALL 为每条记忆提供三个独立开关：`is_editable`、`visible_to_colleagues`、`include_in_handover_default`，切换后立即持久化。
- **AC-4.2.3**：IF `is_editable = false` THEN THE SYSTEM SHALL 使该条目在 UI 上不可编辑，且服务端拒绝其更新请求（前后端都要拦）。
- **AC-4.2.4**：THE SYSTEM SHALL 在记忆条目页支持按类型筛选。

## 4. 非功能要求

- 正确性：抽取结果先过 zod schema 校验，任何一条不合规就整批拒绝写库并返回可读错误。
- 成本：抽取按 chunk 分批送 LLM，单批不超过 6 片。
- 安全：`is_editable=false` 的拦截必须在服务端也存在（前端只拦是不够的）。

## 5. 明确不做（Out of Scope）

- 不做记忆条目的版本历史 / 回滚。
- 不做条目之间的关联图谱。
- 不做人工新建条目（只从文档抽取 + 编辑）。

## 6. 数据契约

- 表：`bt_memories`
- API：`GET /api/memory?employee=&category=`、`PATCH /api/memory/[id]`、`POST /api/memory/extract { fileId }`
- zod：`ExtractedMemory { category: 五类枚举, title: string(1..60), content: string(1..600), sourceChunkIndex: number }`

## 7. 测试映射表

| AC 编号 | 层级 | 测试文件 | 备注 |
|---|---|---|---|
| AC-4.1.1 | integration | tests/integration/extract.test.ts | LLM 用 fixture 响应，写库真跑 |
| AC-4.1.2 | integration | tests/integration/extract.test.ts | category 落在五类内 |
| AC-4.1.3 | unit | tests/unit/extract-schema.test.ts | 非法结构 → 抛具体错误，不写库 |
| AC-4.1.4 | integration | tests/integration/extract.test.ts | 抽两次条数不翻倍 |
| AC-4.2.1 | integration | tests/integration/memory-edit.test.ts | 内容持久化 + updated_at 变新 |
| AC-4.2.2 | component | tests/components/memory-card.test.tsx | 三个开关独立触发回调 |
| AC-4.2.3 | integration | tests/integration/memory-edit.test.ts | 服务端拒绝（抛具体错误） |
| AC-4.2.4 | component | tests/components/memory-filter.test.tsx | 按类型筛选 |
