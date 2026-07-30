# Spec 007: 后台界面（浅色干净风）

- 状态：ACTIVE
- 所属阶段：P1
- 依赖：001
- 影响模块：`app/(console)/layout.tsx`、`app/(console)/page.tsx`、`app/(console)/knowledge/page.tsx`、`app/(console)/memory/page.tsx`、`app/(console)/handover/page.tsx`、`app/(console)/records/page.tsx`、`components/*`、`app/globals.css`

## 1. 目标（一句话）

做一个五页的浅色干净后台：像一个真能卖给小公司的 SaaS，不白屏、不糊、不炫技。

## 2. 用户故事

作为一个小公司老板，我想要打开后台就看懂"公司有几个人、每人多少资料、这个月交接了几次"，以便我相信这套东西是能落地用的。

## 3. 场景与验收准则

### 场景 7.1：布局

- **AC-7.1.1**：THE SYSTEM SHALL 提供左侧栏 + 右内容区布局，侧边栏含公司名、身份切换器、五个菜单项。
- **AC-7.1.2**：THE SYSTEM SHALL 使页面背景为浅灰（`#f6f7f9` 或等价 token）、卡片为纯白，二者不相同（可用 E2E 读取 computed style 断言）。
- **AC-7.1.3**：THE SYSTEM SHALL 在 1280px 宽度下不出现横向滚动条。

### 场景 7.2：五个页面

- **AC-7.2.1**：总览页 THE SYSTEM SHALL 展示四个数字卡片（员工数 / 文件总数 / 记忆条目总数 / 本月交接次数）、员工卡片墙、右侧动态时间线。
- **AC-7.2.2**：知识库页 THE SYSTEM SHALL 上半为拖拽上传区、下半为文件表格；点击一行在抽屉中展开该文件的全部 chunk，每片标注出处。
- **AC-7.2.3**：记忆条目页 THE SYSTEM SHALL 按五类分组展示卡片，每卡含结论、出处小字、三个开关。
- **AC-7.2.4**：交接页 THE SYSTEM SHALL 左栏选人与原因、右栏可折叠的勾选清单、底部预览与发起按钮。
- **AC-7.2.5**：记录页 THE SYSTEM SHALL 提供两个 tab：交接记录、跨人提问记录。
- **AC-7.2.6**：THE SYSTEM SHALL 使五个页面在数据为空时都有明确的空态提示（⛔ 不许白屏）。

### 场景 7.3：可靠性

- **AC-7.3.1**：IF 任一 API 返回错误 THEN THE SYSTEM SHALL 以 Sonner toast 展示可读的中文错误，⛔ 不许静默失败。
- **AC-7.3.2**：THE SYSTEM SHALL 使所有列表页在加载中显示骨架屏或加载态。

## 4. 非功能要求

- 视觉：单一强调色 indigo `#6366f1`；圆角统一 `0.625rem`；表格行高 ≥ 44px；中文字体栈含 `"PingFang SC"`。
- 视觉：⛔ 不用深色科技风 / 霓虹 / 玻璃拟态 / 大面积渐变。
- 交互：交接页允许克制动效（勾选飞入右栏 `bt-fly-in`、确认成功 `bt-pop`）。

## 5. 明确不做（Out of Scope）

- 不做深色模式（本项目刻意只做浅色）。
- 不做移动端适配（后台按 ≥1280px 设计）。
- 不做国际化。

## 6. 数据契约

- 页面全部在 route group `app/(console)/` 下，共享侧边栏 layout。
- 客户端通过 `/api/*` 取数，⛔ 客户端组件不得直接 import supabase client。

## 7. 测试映射表

| AC 编号 | 层级 | 测试文件 | 备注 |
|---|---|---|---|
| AC-7.1.1 | e2e | tests/e2e/console-layout.spec.ts | 侧边栏五个菜单项 + 公司名 + 切换器 |
| AC-7.1.2 | e2e | tests/e2e/console-layout.spec.ts | computed style：body ≠ card 背景色 |
| AC-7.1.3 | e2e | tests/e2e/console-layout.spec.ts | scrollWidth ≤ clientWidth |
| AC-7.2.1 | e2e | tests/e2e/five-pages.spec.ts | 四个数字卡 + 员工墙 + 时间线 |
| AC-7.2.2 | e2e | tests/e2e/five-pages.spec.ts | 上传区 + 文件表格 + 抽屉 chunk 出处 |
| AC-7.2.3 | e2e | tests/e2e/five-pages.spec.ts | 五类分组 + 三开关 |
| AC-7.2.4 | e2e | tests/e2e/five-pages.spec.ts | 左选人 / 右清单 / 底部预览发起 |
| AC-7.2.5 | e2e | tests/e2e/five-pages.spec.ts | 两个 tab |
| AC-7.2.6 | component | tests/components/empty-state.test.tsx | 空数据渲染空态文案 |
| AC-7.3.1 | component | tests/components/api-error-toast.test.tsx | 错误触发 toast |
| AC-7.3.2 | component | tests/components/empty-state.test.tsx | loading 时渲染骨架屏 |
