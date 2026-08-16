# client-ui-task-detail — 网页任务流详情

[English](README.md) | 中文

任务流详情面的浏览器半边：一个 `sidebar.footer.action` 入口，其触发打开按需的单任务详情面板。面板通过生成的 `tasks` Remote 读取任务投影（`getTask`），再读取其当前运行的阶段运行（`listPhaseRuns`）与每个活动提交的门禁结论（`listGateResults`）。

## 呈现面

- 占用 `sidebar.footer.action`（ui-sidebar 声明，可加列表槽），id 为 `task-detail`。
- 面板以模态打开，带任务 ID 输入与加载动词；加载后的任务显示其状态与修订、阶段运行，以及带通过/未通过标记的门禁结论。

## 对象层

`src/client/detail.ts` 无 React：`TaskDetailController` 持有一个快照 store（`TaskDetailState`），通过 tasks Remote 按需加载。任务缺失落入 `not-found` 错误；读取失败记录错误码。宿主投影是唯一权威；加载之间不缓存任何内容。

## 模型体验

无：本包为人类渲染宿主计算出的任务投影，不触碰任何提示、消息、schema、流或工具结果。加载动词只读取任务投影；任务状态从不进入提示或会话日志。

#### KV 缓存影响

无；本包从不组装或发送提供方请求。

## 已知限制与后续工作

- 面板是手动读取器：没有实时 `task/updated` 折叠，也没有跨会话列表；这些在 task-board 包中。
- 门禁结论只呈现通过/未通过；详情文本与证据引用等待更丰富的投影。
