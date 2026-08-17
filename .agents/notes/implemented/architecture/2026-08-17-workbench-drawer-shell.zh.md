# Agent Note: 工作台抽屉取代三个侧栏底部的 task-flow 模态

状态：implemented

[English](2026-08-17-workbench-drawer-shell.md) | 中文

## 问题

task-flow 工作台最初以三个 `sidebar.footer.action` entry（任务看板、注意力收件箱、任务详情）各自从侧栏底部弹模态呈现。原型审查判定形态不对：三个零散入口、遮罩模态阻断会话、缺少人坐在工作台上的单一位置。drawer-v2 原型（单一悬浮入口 + 右侧无遮罩抽屉 + 三标签页）被采纳为重设计；M4 内容包的 controller 必须原样存活于迁移。

## 决策

- 新包 `client-ui-workbench-drawer` 占用 `shell.overlay`（ui-layout 的 frame 级浮动 list seat，此前无占用者），单一 entry：右下角悬浮胶囊（运行指示点 + 待处理 attention 徽标）+ 右侧抽屉——三个标签（任务 / 收件箱 / 详情）、每标签语义宽度（600/720/800px）、左缘拖拽 480–960px 内调宽、Esc/关闭收起、关闭重开保持状态（entry 存活期间组件保持挂载）。
- 抽屉 entry 声明三个内容 seat：`workbench.drawer.tasks` / `workbench.drawer.inbox` / `workbench.drawer.detail`（均 `single`/`root`）。三个 M4 包从 `sidebar.footer.action` 迁入这些 seat；seat 声明随抽屉 entry 拆除而级联塌掉（`slots.inject` 保证 HMR 安全）。
- 跨 entry 导航走 owner props，与 ui-workspace 的 directory-flow 回调同型：tasks seat 收到 `openDetail(taskId)`（打开任务行即把抽屉切到该任务详情标签）；detail seat 收到 owner 选中的 `taskId`，变化即重载（手动任务 ID 输入框移除；未选择渲染空态）。
- 徽标聚合（待处理 attention 数、活动任务数）落在新的 React-free `BadgeController`：启动、每次转发 `workbench/attention-updated` / `task/updated`、重连时重读 `workbenchHost.listSnapshot` 与 `tasks.listTasks`——纯投影、不做本地折叠，丢一条转发最多多一次快照读取。收件箱完整 controller（CAS 阶梯、增量重放、冲突计数）原样未动。
- 主题：所有模块 CSS 只引用 `--dsw-alias-*` 语义 token（含 `state-warn-*` 拼写；原型里的 `state-warning-*` 在 ui-theme 不存在），零字面色值——抽屉跟随明暗翻转与任何重定义 token 层的皮肤插件。
- 浏览器 e2e `apps/web/tests/workbench-attention.e2e.ts` 改为驱动抽屉：打开抽屉并切到收件箱标签。

## 验证

- 四包 jsdom 组件 + browser-half 套件全绿（抽屉 15 / 看板 11 / 收件箱 15 / 详情 12）：标签分派、宽度语义与拖拽钳制、Esc、徽标渲染、HMR 拆除 seat 声明、controller 接线。
- workbench-attention e2e 通道（抽屉驱动）在 `DSH_SNAPSHOT=replay` 下全绿；冲突 golden 按抽屉的 aria 树重录。
- `test:gui`、`test:web`（replay）、typecheck、lint、knip 与 verify-* 系列（cordis-config、package-invariants、readme-limitations、model-experience、translation-pairing、export-jsdoc）全绿；config-catalog 已重新生成。

## 备选方案

- **三 tab 合并进单一 client 包** vs **壳包 + seat 拆分**：合并会把收件箱的数据逻辑耦合进看板与详情；且 client 栈规则禁止内容包之间跨包 import。seat 拆分保持一 feature 一包、复用既有 controller。
- **抽屉 open/tab/width 放 store** vs **组件本地 state**：抽屉 entry 从不重挂载（`shell.overlay` entry 随 fiber 存活），本地 state 即能跨越关闭/重开，无需声明 store；规则 5 的 store 需求针对跨 entry 或跨重挂载共享的状态，两者均不适用。
- **徽标消费收件箱的 fold** vs **重读快照**：徽标是计数不是条目列表；折叠会为无人可见的收益复制收件箱 controller 的修订逻辑。当前量级下每次更新一次 RPC 可接受。
- **原型里的 `state-warning-*` token** vs **真实 `state-warn-*`**：ui-theme 定义的是 `warn` 而非 `warning`；原型拼写渲染不出颜色。所有模块 CSS 用真实别名。

## 影响

- `shell.overlay` 有了第一个占用者；未来的 frame 级浮动面（toast、徽标）按其加性 list 契约以 id 并列注册。
- `sidebar.footer.action` 重新只剩其出厂 entry；task-flow 不再贡献。未来需要侧栏底部入口的 task-flow UI 应改为 seat 进抽屉。
- 内容 seat 的 owner props 是唯一跨 entry 通道；内容包不得回摸抽屉状态（tab、宽度）——导航请求经回调从 owner 流向 occupant，与 ui-workspace 的 directory-flow 先例一致。
