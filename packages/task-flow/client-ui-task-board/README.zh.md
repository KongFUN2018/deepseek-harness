# client-ui-task-board — Web 任务看板

[English](README.md) | 中文

任务流工作台的浏览器半部：一个 `workbench.drawer.tasks` 入口，填充工作台抽屉的任务标签页。看板是 M1 最小面——任务行实时状态、版本号与 暂停/继续/取消 动词——数据来自生成的 `tasks` Remote 与转发的 `task/updated` 事件。

## 界面

- 以唯一占用者身份占位 `workbench.drawer.tasks`（client-ui-workbench-drawer 的 shell.overlay entry 声明）。
- 任务行含状态圆点、任务 id、状态词与比较并交换版本号；打开一行触发 seat 的 `openDetail(taskId)` owner 回调，把抽屉切到该任务的详情标签页。

## 对象层

`src/client/board.ts` 不含 React：`TaskBoardController` 持有快照存储（`TaskBoardState`），经 `remote.tasks.listTasks()` 加载，按版本门控折叠转发的 `task/updated`（新行加入、更高版本替换、过期或重复投递丢弃），动词携带行版本与全新幂等键发出。重连（`connection/reset`）或动词失败后从 Remote 重取——宿主投影是唯一事实源，客户端折叠不是。

## 模型体验（Model Experience）

无（None, as）：本包面向人类渲染宿主计算的任务投影，不触及任何提示词、消息、schema、流或工具结果。动词按钮只路由任务生命周期变更；任务状态不进入提示词或会话日志。

#### KV 缓存影响

无；本包从不组装或发送模型请求。

## 已知限制与后续工作

- M1 范围只展示任务列表；run/phase-run 详情视图（task-run/updated、phase-run/updated 已在转发白名单）等待 task-detail 包。
- 动词失败仅显示单条瞬态错误行；按行 pending 状态同样留给后续。
- 列表不显示阶段/门禁详情；那部分在抽屉的详情标签页（client-ui-task-detail）。
