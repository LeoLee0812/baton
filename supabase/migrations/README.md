# 数据库迁移

按文件名序号依次执行即可。所有对象一律 `bt_` 前缀——这个 Supabase 实例上还跑着别的项目，
⛔ 任何时候都不要动非 `bt_` 前缀的表、函数、策略。

| 序号 | 内容 |
|---|---|
| 001 | 扩展（vector / pg_trgm）与 updated_at 触发器函数 |
| 002 | 七张表：员工 / 文件 / 切片 / 记忆条目 / 交接单 / 交接明细 / 提问日志 |
| 003 | 索引（HNSW 向量 + GIN trigram）与 RLS |
| 004 | 可见权判断函数 `bt_can_access_file` / `bt_can_access_memory` |
| 005 | 混合检索 `bt_hybrid_search` + 跨人检索 `bt_colleague_search` |

⚠️ 005 里的两个函数带 `min_vec_score` / `min_score` 相关性下限参数。
没有这个下限的话，pgvector 的 KNN 会**永远**返回最近的 N 条（不管多不相关），
于是「我的资料里没有」这句话永远说不出口——见 `specs/003-retrieval/CHANGELOG.md`。
