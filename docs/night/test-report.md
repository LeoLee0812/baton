# 测试报告

生成时间：2026-07-31 01:52
最后一次完整闸门：`bash scripts/gate.sh P7` → **通过**

---

## 一、总览

| 层 | 测试文件 | 用例 | 结果 | 环境 |
|---|---|---|---|---|
| unit | 9 | **41** | ✅ 全绿 | vitest node |
| component | 4 | **18** | ✅ 全绿 | vitest jsdom + testing-library |
| integration | 10 | **63** | ✅ 全绿 | vitest node，**真连 Supabase** |
| e2e | 5 | **17** | ✅ 全绿 | Playwright chromium |
| **合计** | **28** | **139** | **全绿** | |

E2E 另跑了一遍**生产构建模式**（`npm run e2e:prod`，先 `next build` 再 `next start`）：**17 passed**。
不是只在 dev server 上绿。

带 AC 编号的用例：**135 条**（每条测试标题都以 `AC-x.y.z:` 开头，方便反查规格）。

---

## 二、覆盖率

```
Statements   : 61.73% ( 768/1244 )   阈值 55  ✅
Branches     : 53.28% ( 389/730 )    阈值 50  ✅
Functions    : 66.14% ( 170/257 )    阈值 55  ✅
Lines        : 62.96% ( 675/1072 )   阈值 55  ✅
```

阈值取自 `scripts/coverage-baseline.json`，**全夜没有被调过**（反作弊脚本第 9 条专门盯这个）。

核心模块的实际覆盖：

| 文件 | 语句 | 分支 | 说明 |
|---|---|---|---|
| `lib/handover.ts` | 97.6% | 90.6% | 交接状态机——项目的心脏，覆盖得最厚 |
| `lib/chunk.ts` | 95.0% | 88.9% | 切片算法 |
| `lib/hub-auth.ts` | 95.3% | 92.6% | 密码门 |
| `lib/ask.ts` | 94.0% | 69.4% | 问答与跨人一跳 |
| `lib/upload.ts` | 96.4% | 88.9% | 上传校验 |
| `lib/extract.ts` | 84.0% | 55.0% | 抽取与 schema 校验 |
| `lib/db.ts` | 80.5% | 58.6% | 全站唯一数据库入口 |
| `lib/ingest.ts` | 70.0% | 55.3% | 摄取分步状态机 |

覆盖率低的三处，**都是刻意的**：

- `lib/embed.ts` **3.8%** —— 它只是一层 HTTP 封装。集成测试按 `02-TDD规程 §3` 的规定注入 fixture 向量，
  不打真实 embedding API；真实调用由线上验收覆盖（见第五节）。
- `lib/api.ts` **0%** —— route handler 的公共外壳。集成测试直接调 `lib/*` 的函数，
  route 这一层由 17 条 E2E 从浏览器端真跑覆盖。
- `lib/identity.ts` **25%** —— 大半是浏览器端代码（localStorage），由组件测试和 E2E 覆盖。

---

## 三、⛔ 没有 mock 的东西

这是这份报告最该被检查的一节。

| 东西 | 是否 mock | 说明 |
|---|---|---|
| **Supabase** | ❌ 没有 | 63 条集成测试全部真连 Leo-hub，真写真读真删（带 RUN_ID 前缀） |
| **文档解析** | ❌ 没有 | 真喂 fixture 文件：手写的 PDF 1.4（三页有文字层 + 三页空白）、jszip 造的 docx、exceljs 造的 xlsx |
| **浏览器** | ❌ 没有 | Playwright 真开 chromium，真过密码门，真上传文件 |
| LLM / embedding 的 HTTP 调用 | ✅ 有 | `02-TDD规程 §3` 明确允许的少数几项之一，用固定 fixture 向量 |

`scripts/anti-cheat-check.sh` 的第 13 条专门扫「集成测试里 `vi.mock('...supabase')`」，命中即非零退出。

### fixture 是怎么造的

`scripts/make-fixtures.mjs`：

- `sample.pdf` —— **手写的 PDF 1.4 字节流**（Catalog / Pages / Font / 每页一个内容流 + xref 表），
  三页都有真文字层。刻意把标记词 `HONGYUAN-JIANCAI-2026` 只放在第 2 页，
  检索测试就靠它验证「搜出来的出处确实是第 2 页」，而不是随便哪一页。
- `scanned.pdf` —— 同样结构但内容流为空，用于验扫描件检测（提取出来 0 字）。
- `sample.docx` —— jszip 打的真 OOXML 包（`[Content_Types].xml` + `_rels/.rels` + `word/document.xml`），带 h1/h2 层级。
- `sample.xlsx` —— exceljs 写的真 xlsx，两个 sheet。

---

## 四、几条值得单独说的测试

### AC-5.2.4：**没勾的内容，交接完成后接手人依然看不到**（负向）

`tests/integration/handover-scope.test.ts`。这条最容易被漏掉——大多数人只测「交了的能看到」。
构造：A 有 4 条记忆（2 条 `default=true`、2 条 `default=false`）+ 2 份文件，只交出 2 条记忆 + 1 份文件。
断言链：

1. **提交后、确认前**：接手人列表里没有、直查 403、**检索返回空数组**
2. **确认后**：勾了的能查到，且带 `来源：<前任> 交接，<日期>`
3. **确认后**：没勾的 → 列表里没有、直查 403、**只出现在未勾内容里的关键词一条都搜不到**
4. **owner_employee_id 前后完全不变**（从原主人视角读，若归属被搬走 A 自己反而会读不到）

### AC-3.1.1：中文客户名必须靠**模糊那一路**命中

`tests/integration/search.test.ts`。查询向量刻意用一个和目标 chunk **完全不相关**的 fixture 向量。
如果 pg_trgm 那一路没真生效，中文客户名就搜不出来，测试会真的红——不会被向量召回蒙混过去。

为此还修了 fixture 向量的实现：原来用 `Math.sin(seed*0.37 + i*0.011)`，
不同 seed 只是相位差、彼此高度相关（余弦可达 0.9+），任何"不相关"向量都能召回目标。
换成 LCG 伪随机后向量近似正交，这条测试才真正有意义（见 `deviations.md`）。

### AC-6.1.2：跨人提问碰不到对方没开开关的条目（负向）

`tests/integration/cross-agent.test.ts`。B 有两条记忆：一条 `visible_to_colleagues=true`（物流时效），
一条 `false`（私下返点）。A 跨人问「返点是多少」，断言答案里**一个「返点」字都没有**，
且所有引用的 snippet 里都不含它。

### AC-1.3.3：拿**真密钥值**去 grep 构建产物

`tests/integration/build-secret-leak.test.ts`。不是搜 `service_role` 这类关键词，
而是从 `.env.local` 取真实的 `YUNWU_API_KEY` / `HUB_AUTH_SECRET` / `HUB_SITE_PASSWORD` 的值，
递归扫 `.next/static` 下所有 js/css/json/map，命中即失败。

---

## 五、线上验收（不是本地测试，是真打生产环境）

这一节是本地测试之外的补充证据，命令和输出都是真的。

**1. 隔离在生产环境成立**

```
王销售搜「宏远建材」 → 3 条命中，带出处「华东区客户资料汇总.xlsx · Sheet1!2行」等
赵采购搜「宏远建材」 → {"hits":[],"query":"宏远建材","vectorUsed":true}
```

**2. 语义那一路是活的**（问一个字面上一个词都不重合的说法）

```
q=客户什么时候付钱给我们
→ 宏远建材-框架采购合同（2026）.docx · 第2章 价格与结算 > 2.3 付款方式
  向量分 0.461，模糊分 None（纯靠向量召回）
```

**3. 问答带出处**

```
q=复合地板最低能给到多少钱？
→ 根据资料，复合地板最低价为 180.4 元/㎡，条件是单笔满 800 ㎡
  （出处：宏远建材-2026年度报价单.pdf · 第 2 页）。若不满 800 ㎡，年框价为 186 元/㎡。再低需走审批。
```

**4. 跨人提问的边界**

```
赵采购 → 问王销售「泰兴装饰能不能走个人转账？」（这条王销售开了「同事可问到」）
→ 以下来自 王销售 的 Agent：泰兴装饰只走对公账户，不接受个人转账
  （出处：华东区客户资料汇总.xlsx · Sheet1!4行）  cross=True hop=1

赵采购 → 问王销售「复合地板的报价底线是多少？」（这条王销售**没开**）
→ 以下来自 王销售 的 Agent：我的资料里没有复合地板报价底线的具体数字。
```

第二条是关键：底线 186 这个数字确实在王销售库里，但那条记忆的 `visible_to_colleagues=false`，
所以跨人检索根本没把它捞出来——Agent 想编都没有素材。

**5. 服务器 Agent 层同题三答**（见 `vps-health.md` 第 6 节）

---

## 六、反作弊扫描

```
$ bash scripts/anti-cheat-check.sh
反作弊扫描完成，命中 0 条，详见 docs/night/anti-cheat-report.md
$ echo $?
0
```

扫描的 14 类手法：`.skip` / `.only` / `fit` / `fdescribe` / 恒真断言 / 弱断言占比 ≥60% /
try-catch 吞断言 / mock 掉被测模块本身 / 被注释掉的用例 / `process.env` 条件绕过 /
`.rejects.toBeDefined()` 掩盖错误类型 / E2E 只截图不断言 / 集成测试里 mock Supabase /
覆盖率阈值被下调 / 测试文件被删 / 构建产物泄漏密钥。

Playwright 配置里 `forbidOnly: true` —— 只要有一个 `.only`，整个 run 直接失败。

---

## 七、怎么自己复跑

```bash
cd ~/personal/baton
npm install
npm run gate            # typecheck + 三层测试 + 反作弊 + 生产构建 + 密钥泄漏扫描
npm run e2e             # 17 条端到端
npm run test:cov        # 覆盖率
bash scripts/ac-audit.sh   # AC 三方交叉核对
```

⚠️ 集成测试真连 Leo-hub，需要 `.env.local` 里的 Supabase 变量。
测试数据全部带 `t<时间戳36进制>_` 前缀，`afterAll` 按前缀清理，⛔ 不会碰到种子数据或别的项目的表。

⚠️ 如果你的机器要走代理才能出网：npm scripts 里已经带了 `NODE_USE_ENV_PROXY=1`。
Node 的 `fetch` 默认**不认** `HTTP_PROXY`，不开这个开关 embedding 会一路 `UND_ERR_CONNECT_TIMEOUT`。
