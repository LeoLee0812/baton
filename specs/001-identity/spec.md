# Spec 001: 身份与访问

- 状态：ACTIVE
- 所属阶段：P1
- 依赖：无
- 影响模块：`proxy.ts`、`lib/hub-auth.ts`、`app/api/login/route.ts`、`app/login/page.tsx`、`lib/db.ts`、`lib/identity.ts`、`components/identity-switcher.tsx`

## 1. 目标（一句话）

用统一密码门挡住整个站点，并在站内提供员工身份切换，使每个员工只能看见自己名下（或已被完成态交接授予）的数据。

## 2. 用户故事

作为小公司的管理者，我想要一个只有拿到访问密码的人才能进的后台，并且能在演示时切换成不同员工的视角，以便直观验证"每个人的资料互相看不见"这件事真的成立。

## 3. 场景与验收准则

### 场景 1.1：密码门

- **AC-1.1.1**：IF 请求未携带有效会话 Cookie THEN THE SYSTEM SHALL 将除 `/login`、`/api/login`、`/api/health`、静态资源以外的所有路径 302/307 重定向到 `/login`，并把原路径写进 `?next=` 参数。
- **AC-1.1.2**：WHEN 用户在 `/login` 提交正确密码 THE SYSTEM SHALL 返回 200 并下发 httpOnly、secure、domain=`.saveme505.help` 的会话 Cookie。
- **AC-1.1.3**：IF 密码错误 THEN THE SYSTEM SHALL 返回 401 且响应体不包含正确密码的任何片段。
- **AC-1.1.4**：IF 服务端未配置 `HUB_SITE_PASSWORD` 或 `HUB_AUTH_SECRET` THEN THE SYSTEM SHALL 拦截全部请求（绝不裸奔），`/api/login` 返回 503。

### 场景 1.2：员工身份

- **AC-1.2.1**：THE SYSTEM SHALL 在侧边栏提供身份切换器，可在种子员工（王销售 / 李销售 / 赵采购）之间切换。
- **AC-1.2.2**：WHEN 当前身份切换 THE SYSTEM SHALL 使后续所有页面与 API 请求都以新身份的 `employee_id` 为作用域。
- **AC-1.2.3**：THE SYSTEM SHALL 把当前身份持久化（Cookie 或 localStorage），刷新页面后保持不变。

### 场景 1.3：数据隔离（安全底线）

- **AC-1.3.1**：WHEN 以员工 A 的身份调用任意知识类 API THE SYSTEM SHALL 只返回 A 拥有的、或已通过完成态交接授予给 A 的数据。
- **AC-1.3.2**：IF 请求中显式传入他人的 `employee_id` 且当前身份无权访问 THEN THE SYSTEM SHALL 返回 403 而非返回数据。
- **AC-1.3.3**：THE SYSTEM SHALL 保证浏览器端构建产物中不包含任何 Supabase 写权限密钥（构建后 grep `.next/static` 命中数为 0）。
- **AC-1.3.4**：THE SYSTEM SHALL 使所有 `bt_` 表的数据访问都经由 `lib/db.ts` 导出的函数，源码中除该文件外不出现 `.from('bt_` 字样（可用 grep 断言）。

## 4. 非功能要求

- 安全：会话令牌为 HMAC-SHA256 签名，30 天过期；密码错误时服务端 sleep 600ms 拖慢暴力破解。
- 安全：本项目使用 Supabase publishable key（无 service_role key，见 `docs/night/decisions.md` D1），**隔离 100% 由应用层 `scopedQuery` 保证**，RLS 不提供隔离能力。此边界必须写进 README。
- 性能：密码门校验在 proxy 层完成，单次开销 < 5ms（纯 Web Crypto HMAC，无网络调用）。
- 可观测性：无（本 spec 不引入额外日志）。

## 5. 明确不做（Out of Scope）

- 不做真实的多租户账号体系（无注册、无密码找回、无 OAuth）。身份切换器是**演示用的视角切换**，不是认证。
- 不做基于角色的细粒度权限（admin/agent 字段留了，但今晚不做差异化行为）。

## 6. 数据契约

- 表：`bt_employees`
- API：`POST /api/login`、`DELETE /api/login`、`GET /api/employees`
- 身份传递：请求头 `x-baton-employee`（employee_code）或 Cookie `bt_employee`
- 单一入口：`lib/db.ts` 导出 `scopedQuery(employeeId)`、`assertCanAccessFile`、`assertCanAccessMemory`

## 7. 测试映射表

| AC 编号 | 层级 | 测试文件 | 备注 |
|---|---|---|---|
| AC-1.1.1 | e2e | tests/e2e/auth-gate.spec.ts | 断言 302/307 到 /login 且带 ?next= |
| AC-1.1.2 | e2e + unit | tests/e2e/auth-gate.spec.ts、tests/unit/hub-auth.test.ts | Cookie 属性 + `resolveCookieDomain()` 域名选择 |
| AC-1.1.3 | e2e | tests/e2e/auth-gate.spec.ts | 401 且响应体不含密码片段 |
| AC-1.1.4 | unit | tests/unit/hub-auth.test.ts | 未配置 env 时 verifyToken 恒 false |
| AC-1.2.1 | component | tests/components/identity-switcher.test.tsx | 三个员工都可选 |
| AC-1.2.2 | component | tests/components/identity-switcher.test.tsx | 切换触发 onChange 带新 code |
| AC-1.2.3 | component | tests/components/identity-switcher.test.tsx | 写入 localStorage |
| AC-1.3.1 | integration | tests/integration/isolation.test.ts | A 查不到 B 的 file/memory/chunk |
| AC-1.3.2 | integration | tests/integration/isolation.test.ts | 显式传他人 id → 403 |
| AC-1.3.3 | integration | tests/integration/build-secret-leak.test.ts | grep .next/static 命中数为 0 |
| AC-1.3.4 | unit | tests/unit/db-single-entry.test.ts | 源码 grep `.from('bt_` 只允许出现在 lib/db.ts |
