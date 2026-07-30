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

## [2026-07-31 01:40] bt_hybrid_search / bt_colleague_search 增加相关性下限（新增约束，不削弱任何 AC）

- 新增参数 `min_vec_score real default 0.2`，向量那一路只保留余弦相似度 ≥ 0.2 的候选
- 原因：pgvector 的 KNN **永远**返回最近的 N 条，不管多不相关。不设下限的话，
  「量子纠缠火锅底料」这种库里根本没有的问题也会召回一堆噪声，
  于是 AC-3.3.2 要求的「检索结果为空就回答『我的资料里没有』」永远触发不了——
  模型只能拿着噪声去编，正好是 AC-3.3.2 明令禁止的。
- 0.2 对 text-embedding-3-small 是保守下限：真正相关的中文段落一般 0.35~0.65，完全无关的 0.05~0.15
- 顺带删掉旧的 5 参数重载（PostgREST 报 "Could not choose the best candidate function"）
- 性质：为了让 AC-3.3.2 能被诚实地满足而**加强**约束，不是放水

## [2026-07-31 01:35] 测试夹具 fixtureVector 从 sin 波改为 LCG 伪随机

- 原实现：`Math.sin(seed * 0.37 + i * 0.011)`
- 问题：不同 seed 只是相位差，向量彼此高度相关（余弦相似度可达 0.9+），
  于是「刻意不相关的查询向量」也能把目标 chunk 向量召回来，
  AC-3.1.1「模糊那一路必须真的生效」就被向量路蒙混过关了——测试形同虚设
- 改为 LCG 伪随机，向量近似正交（余弦 ≈ 0），逼得出真结论
- 性质：修一处会让测试失去意义的夹具缺陷
