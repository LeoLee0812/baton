# 规格总览

> 编号三位，全夜不复用、不改号。进入 TDD 循环后 AC 内容冻结，要改必须走各自的 `CHANGELOG.md`。

| 编号 | 名称 | 阶段 | AC 数 | 状态 |
|---|---|---|---|---|
| 001 | 身份与访问 | P1 | 11 | ACTIVE |
| 002 | 知识库摄取 | P2 | 13 | ACTIVE |
| 003 | 检索与出处 | P2 | 10 | ACTIVE |
| 004 | 记忆条目 | P3 | 8 | ACTIVE |
| 005 | 交接 | P4 | 13 | ACTIVE |
| 006 | 跨 Agent 提问 | P4 | 6 | ACTIVE |
| 007 | 后台界面 | P1 | 11 | ACTIVE |
| 008 | 服务器 Agent 层 | P6 | 9 | DRAFT |

**AC 总数：81**

## AC 编号规则

`AC-<spec_id>.<场景号>.<准则号>`，例：`AC-5.2.1` = 交接规格、第 2 个场景、第 1 条准则。

双向可追溯：
- `spec.md` 每条 AC 带编号
- 测试标题以编号开头：`it('AC-5.2.1: ...', ...)`
- `docs/night/progress.log` 每条记录带编号
- `docs/night/ac-matrix.md` 由 `scripts/make-ac-matrix.sh` 从 progress.log 生成

**没有编号的测试 = 不算数。没有测试覆盖的 AC = 未完成。**
