# Spec 003: 检索与出处

- 状态：ACTIVE
- 所属阶段：P2
- 依赖：001、002
- 影响模块：`lib/search.ts`、`lib/rrf.ts`、`app/api/search/route.ts`、`app/api/ask/route.ts`、`supabase/migrations/*hybrid_search*`

## 1. 目标（一句话）

在员工自己的资料范围内做中文可用的混合检索（向量 + pg_trgm 模糊，RRF 融合），每条结果都带得住的出处，并且绝不越界到别人的资料。

## 2. 用户故事

作为一名销售，我想要搜"宏远建材"就能搜到合同里写这家客户的那一段，并且能看到它出自哪份文件第几页，以便我敢把这个答案发给客户。

## 3. 场景与验收准则

### 场景 3.1：混合检索

- **AC-3.1.1**：WHEN 用户在自己的知识库搜索一个中文客户名 THE SYSTEM SHALL 返回命中该客户名的 chunk，即使该词未被向量召回（即模糊匹配这一路必须真的生效）。
- **AC-3.1.2**：THE SYSTEM SHALL 用 RRF 融合向量与模糊两路结果，返回结果按融合分降序。
- **AC-3.1.3**：IF 查询词长度 < 3 个字符 THEN THE SYSTEM SHALL 降低模糊匹配阈值或并入子串匹配兜底，保证短查询不会返回空。
- **AC-3.1.4**：THE SYSTEM SHALL 使每条检索结果都带出处：文件名 + `page_label`，且可点击定位到该 chunk 原文。

### 场景 3.2：隔离与授权可见

- **AC-3.2.1**：WHEN 员工 A 检索 THE SYSTEM SHALL ⛔ 不返回员工 B 的任何 chunk（除非该文件已通过完成态交接授予 A）。
- **AC-3.2.2**：WHEN 一笔交接完成后 THE SYSTEM SHALL 使接手人能检索到被交接文件的 chunk，且结果上标注「来源：<前任> 交接，<日期>」。
- **AC-3.2.3**：IF 交接单状态不是 `completed` THEN THE SYSTEM SHALL ⛔ 不向接手人开放任何被勾选内容。

### 场景 3.3：问答

- **AC-3.3.1**：WHEN 调用 `/api/ask` THE SYSTEM SHALL 先检索再生成，且回答中必须包含至少一条出处引用。
- **AC-3.3.2**：IF 检索结果为空 THEN THE SYSTEM SHALL 回答「我的资料里没有」，⛔ 禁止凭模型记忆编造。
- **AC-3.3.3**：THE SYSTEM SHALL 把每次问答落一条 `bt_agent_queries` 记录（含命中的 chunk/memory id 与耗时）。

## 4. 非功能要求

- 性能：所有查库 route 设 `export const preferredRegion = 'hnd1'`（Leo-hub 在东京），减少跨区域延迟。
- 正确性：RRF 常数 k=60；候选池 candidate_pool 默认 50。
- 中文：Supabase 无 zhparser / pg_jieba，中文精确匹配只能靠 `pg_trgm`，⛔ 不许用 `to_tsvector('chinese')`。

## 5. 明确不做（Out of Scope）

- 不做 rerank 模型。
- 不做多轮对话上下文（`/api/ask` 单轮）。
- 不做 pgroonga。

## 6. 数据契约

- 函数：`bt_hybrid_search(query_text, query_embedding, target_employee_id, match_count, candidate_pool)`
- 函数：`bt_can_access_file(p_employee_id, p_file_id)`、`bt_can_access_memory(p_employee_id, p_memory_id)`
- API：`GET /api/search?q=&employee=`、`POST /api/ask { question, targetEmployeeCode? }`
- 表：`bt_agent_queries`

## 7. 测试映射表

| AC 编号 | 层级 | 测试文件 | 备注 |
|---|---|---|---|
| AC-3.1.1 | integration | tests/integration/search.test.ts | 中文客户名必须靠 trgm 那一路命中（fixture 向量刻意不相关） |
| AC-3.1.2 | unit + integration | tests/unit/rrf.test.ts、tests/integration/search.test.ts | RRF 融合公式 + 降序 |
| AC-3.1.3 | integration | tests/integration/search.test.ts | 2 字查询不返回空 |
| AC-3.1.4 | integration | tests/integration/search.test.ts | 每条结果带 fileName + pageLabel |
| AC-3.2.1 | integration | tests/integration/isolation.test.ts | 负向：A 搜不到 B |
| AC-3.2.2 | integration | tests/integration/handover-scope.test.ts | 完成后可搜到且带「来源：X 交接」 |
| AC-3.2.3 | integration | tests/integration/handover-scope.test.ts | submitted 态不开放 |
| AC-3.3.1 | integration | tests/integration/ask.test.ts | 回答含出处 |
| AC-3.3.2 | integration | tests/integration/ask.test.ts | 空检索 → 固定话术，不调用 LLM |
| AC-3.3.3 | integration | tests/integration/ask.test.ts | 落 bt_agent_queries |
