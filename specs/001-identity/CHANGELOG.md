# 变更日志

> 规格发现有误要调整时，⛔ 不许直接改字覆盖原文，必须在此追加一条。
> 每条变更必须早于对应代码 commit。

## [2026-07-31 00:05] AC-1.1.2 的 Cookie 域名实现细化（不改 AC 文字）

- 原文：WHEN 用户在 /login 提交正确密码 THE SYSTEM SHALL 返回 200 并下发 httpOnly、secure、domain=`.saveme505.help` 的会话 Cookie
- 实现：新增 `resolveCookieDomain(host, cookieDomain)`——host 是 `saveme505.help` 或其真子域时挂父域（线上行为完全符合 AC 原文）；
  否则（localhost / 127.0.0.1）不带 domain，退化为 host-only Cookie
- 原因：本地 dev 和 Playwright E2E 跑在 `localhost:3000`，若照样下发 `domain=.saveme505.help`，
  浏览器会因域名不匹配直接丢弃整条 Cookie → 本地登录永远不生效 → 所有页面级 E2E 都进不去
- 影响测试：AC-1.1.2 拆成两层验证——
  - unit（tests/unit/hub-auth.test.ts）断言 `resolveCookieDomain('baton.saveme505.help')` 返回 `.saveme505.help`，
    且 `evilsaveme505.help` 这种后缀相似域名不会被误判
  - e2e（tests/e2e/auth-gate.spec.ts）在 localhost 上断言 httpOnly / secure / path
- 性质：工程约束导致的必要调整。线上真实行为与 AC 原文一致，未放水。
