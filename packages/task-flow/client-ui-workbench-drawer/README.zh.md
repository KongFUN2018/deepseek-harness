# client-ui-workbench-drawer — web 任务流程工作台抽屉

[English](README.md) | 中文

任务流程工作台的浏览器半区：一个 `shell.overlay` entry 渲染右下角悬浮入口与右侧三标签抽屉，并声明三个内容 seat（`workbench.drawer.tasks` / `.inbox` / `.detail`）供任务流程内容包注册。取代此前三个零散的侧栏底部 Modal，收敛为单一无遮罩的操作台——会话保持可见、可交互。

## 界面

- 占用 `shell.overlay`（ui-layout 声明的 frame 级浮动 list seat），id 为 `workbench-drawer`。
- 入口是右下角悬浮胶囊：运行指示点（有任务处于活动状态时脉冲）+ 待处理 attention 数量徽标。
- 抽屉从右侧展开，三个标签——任务 / 收件箱 / 详情——各自经 render share 分派到对应 seat。每个标签有语义宽度（600/720/800px）；左缘拖拽可在 480–960px 内调宽，切换标签回到语义宽度。
- 无遮罩：Esc 或关闭按钮收起；entry 存活期间组件保持挂载，重开保持已选标签与用户宽度。
- 任务列表 seat 收到 `openDetail(taskId)` owner 回调，用于切到详情标签；详情 seat 收到选中的 `taskId`。

## 对象层

`src/client/badge.ts` 无 React：`BadgeController` 持有快照 store（`BadgeState`），维护入口的两个聚合值——待处理 attention 数与活动任务数。两者在启动、每次转发 `workbench/attention-updated` / `task/updated`、重连时从权威 Remote（`workbenchHost.listSnapshot`、`tasks.listTasks`）重读；计数是投影而非本地折叠，丢一条转发最多多一次快照读取。

## 主题

所有颜色走语义 `--dsw-alias-*` token（bg-layer / border-l* / label-* / state-* / interactive-bg-* / button-floating-*）：抽屉跟随明暗主题翻转；皮肤插件重定义 token 层即可重绘抽屉，无需本包配合。

## Model Experience

无。本包为人渲染入口聚合值与容器编排，不触及任何 prompt、消息、schema、流或工具结果；抽屉不发起任务变更。

#### KV Cache effect

无；本包从不组装或发送 provider 请求。

## Known Limitations and Deferred Work

- 标签宽度与边界是固定常量；按用户持久化宽度偏好待 settings-scope 决策。
- 徽标对每次转发更新整份快照重读而非增量折叠；当前条目量级可接受，attention 量级增长后重审。
