# Spec 002: 知识库摄取

- 状态：ACTIVE
- 所属阶段：P2
- 依赖：001
- 影响模块：`lib/parse/*.ts`、`lib/chunk.ts`、`lib/normalize.ts`、`lib/embed.ts`、`lib/ingest.ts`、`app/api/files/route.ts`、`app/api/files/[id]/step/route.ts`、`app/api/blob/upload/route.ts`

## 1. 目标（一句话）

让员工把 PDF / docx / xlsx / txt / md 拖进来，系统真解析、真切片、真向量化、真入库，并在过程中把每一步的状态如实展示出来。

## 2. 用户故事

作为一名销售，我想要把手上的报价单和合同直接拖进自己的知识库，以便我的 Agent 能基于这些真实材料回答问题，而不是凭空编。

## 3. 场景与验收准则

### 场景 2.1：上传

- **AC-2.1.1**：WHEN 用户把文件拖入上传区 THE SYSTEM SHALL 创建一条 `bt_files` 记录，`parse_status='pending'`，并把原文件存入对象存储。
- **AC-2.1.2**：IF 文件类型不在 `pdf/docx/xlsx/txt/md` 之内 THEN THE SYSTEM SHALL 拒绝上传并在 UI 显示可读的中文错误。
- **AC-2.1.3**：IF 单文件超过 20MB THEN THE SYSTEM SHALL 拒绝并提示上限。
- **AC-2.1.4**：THE SYSTEM SHALL 在上传过程中显示进度，并在状态变化时更新状态文案：`待处理 → 解析中 → 切片 N 片 → 向量化中 → 已入库`。

### 场景 2.2：解析与切片

- **AC-2.2.1**：WHEN 解析一份 PDF THE SYSTEM SHALL 为每个 chunk 记录真实 `page_no`，且 chunk 原则上不跨页。
- **AC-2.2.2**：WHEN 解析一份 docx THE SYSTEM SHALL 记录 `heading_path`（章节路径）作为出处，`page_no` 允许为空但 `page_label` 必须有值。
- **AC-2.2.3**：WHEN 解析一份 xlsx THE SYSTEM SHALL 以 `Sheet名!行区间` 作为 `page_label`，且每个 chunk 内包含表头行。
- **AC-2.2.4**：THE SYSTEM SHALL 使每个 chunk 的字符数落在 300–1000 之间（末片可短），相邻 chunk 重叠约 15%。
- **AC-2.2.5**：IF PDF 解析后提取到的文本总字符数 < 50 THEN THE SYSTEM SHALL 判定为扫描件，把 `parse_status` 置为 `failed`、`parse_error` 写明「疑似扫描件，暂不支持 OCR」，并在 UI 上以警告态展示（⛔ 不许静默成功）。

### 场景 2.3：向量化与状态机

- **AC-2.3.1**：THE SYSTEM SHALL 使文件状态严格按 `pending → parsing → chunking → embedding → done` 单向流转，失败时转入 `failed` 并保留 `parse_error`。
- **AC-2.3.2**：IF embedding 接口调用失败 THEN THE SYSTEM SHALL 保留该 chunk 的 `embedding IS NULL` 并允许后续补跑，⛔ 不许丢弃 chunk。
- **AC-2.3.3**：WHEN 同一份文件被重复处理 THE SYSTEM SHALL 不产生重复 chunk（靠 `(file_id, chunk_index)` 唯一约束保证）。
- **AC-2.3.4**：THE SYSTEM SHALL 使单次 API 调用的处理量可控（分批），单次调用不超过 Vercel 函数超时限制。

## 4. 非功能要求

- 性能：单次 `/api/files/[id]/step` 调用最多处理 40 条 chunk 的 embedding，保证单次远小于 300s 函数上限。
- 可靠性：断点续传天然成立——每次只取 `embedding_status='pending'` 的 chunk。
- 可观测性：`bt_files.parse_error` 保留失败原因原文；`total_chunks` / `embedded_chunks` 反映真实进度。

## 5. 明确不做（Out of Scope）

- 不做 OCR（扫描件直接报错态）。
- 不做 pptx / csv / 图片。
- 不做 Cron 兜底续跑（Hobby 每天只能跑 1 次），改为文件列表页的「继续处理」按钮。

## 6. 数据契约

- 表：`bt_files`、`bt_chunks`
- API：`POST /api/blob/upload`（签令牌）、`POST /api/files`（建档）、`GET /api/files`（列表）、`POST /api/files/[id]/step`（推进一步）、`GET /api/files/[id]/chunks`
- zod：`CreateFileInput { url, filename, mimeType, size, sourceType, storageProvider }`

## 7. 测试映射表

| AC 编号 | 层级 | 测试文件 | 备注 |
|---|---|---|---|
| AC-2.1.1 | integration | tests/integration/ingest-state.test.ts | 建档后 parse_status='pending' |
| AC-2.1.2 | unit | tests/unit/upload-validate.test.ts | 类型白名单 |
| AC-2.1.3 | unit | tests/unit/upload-validate.test.ts | 20MB 上限 |
| AC-2.1.4 | unit | tests/unit/upload-validate.test.ts | 状态→中文文案映射 |
| AC-2.2.1 | integration | tests/integration/parse-pdf.test.ts | 真喂 fixture PDF，断言 page_no |
| AC-2.2.2 | integration | tests/integration/parse-docx.test.ts | heading_path 有值 |
| AC-2.2.3 | integration | tests/integration/parse-xlsx.test.ts | page_label 形如 `Sheet1!2-9行`，chunk 含表头 |
| AC-2.2.4 | unit | tests/unit/chunk.test.ts | 长度区间 + 重叠比例 |
| AC-2.2.5 | integration | tests/integration/parse-pdf.test.ts | 空白 PDF → likelyScanned |
| AC-2.3.1 | integration | tests/integration/ingest-state.test.ts | 状态机单向流转 |
| AC-2.3.2 | integration | tests/integration/ingest-state.test.ts | embedding 失败后 chunk 仍在 |
| AC-2.3.3 | integration | tests/integration/ingest-state.test.ts | 重复处理不产生重复 chunk |
| AC-2.3.4 | unit | tests/unit/ingest-batch.test.ts | 批大小上限 |
