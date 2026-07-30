# 变更日志

> 规格发现有误要调整时，⛔ 不许直接改字覆盖原文，必须在此追加一条。
> 每条变更必须早于对应代码 commit。

## [2026-07-31 00:12] bt_hybrid_search 实现细节调整（不改任何 AC）

1. **原文**（技术资料 04 §4）：`fused` 里对 uuid 列直接 `max(file_id)`
   **改为**：`max(file_id::text)::uuid`
   **原因**：Postgres 没有 `max(uuid)` 聚合函数，原 SQL 执行报 `42883: function max(uuid) does not exist`
   **性质**：技术资料里的 SQL bug，必须修才能建函数

2. **原文**：`alter function ... set pg_trgm.similarity_threshold = 0.1`（用于 AC-3.1.3 短查询兜底）
   **改为**：在 `where` 里显式写 `similarity(...) > 0.1`，并并入 `like '%kw%'` 子串兜底
   **原因**：Supabase 托管版执行报 `42501: permission denied to set parameter "pg_trgm.similarity_threshold"`（需超级用户）
   **影响测试**：AC-3.1.3 的断言不变（短查询不返回空），只是实现路径换了
   **性质**：托管环境约束导致的必要调整（非为了让测试变绿而放水）

3. `bt_hybrid_search` 的 memory 一路补上 `title` 的相似度参与打分与召回；
   原文只看 `content`，会导致「客户名只出现在标题里」的条目搜不到。
