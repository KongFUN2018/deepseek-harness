# client-ui-clarifications — 网络澄清队列

[English](README.md) | 中文

工作台澄清队列的浏览器半边：一个 `workbench.drawer.clarifications` 入口，填充工作台抽屉的澄清队列标签页（线稿「澄清队列」）。该队列通过生成的 `workbenchHost` Remote 呈现**只读**的 open 澄清注意力条目清单，折叠转发的 `workbench/attention-updated` 事件，并在重连时重新同步。它不发确认/决策动词——澄清条目是只读的，故每行只携带身份、状态与领域信息。

## 呈现面

- 以唯一占用者身份占位 `workbench.drawer.clarifications`（client-ui-workbench-drawer 的 shell.overlay entry 声明）。
- 只渲染 kind 为 `clarification` 且 status 为 `open` 的条目（宿主快照本就只返回 open 条目；控制器再显式过滤）。每行显示条目的来源摘要（`title`，投射 `checkId ?? decisionKind`）、条目 id、状态与 compare-and-set 修订——即 wire 视图实际携带的字段。加载中、空态与失败态呈现各自的文案。

## 对象层

`src/client/clarifications.ts` 无 React：`ClarificationsController` 持有一个快照 store（`ClarificationsState`），通过 `remote.workbenchHost.listSnapshot()` 加载，过滤为 open 澄清行。转发的 `workbench/attention-updated` 事件按修订门控折叠：状态翻转为非 open 的行被驱逐，队列未持有的 id 触发重新同步，重连时从权威快照重新同步。组件只通过 inject hooks 区读取 store 快照。

## 模型体验

无：本包为人类只读渲染宿主计算的注意力投影，不触碰任何提示、消息、schema、流或工具结果。

#### KV 缓存影响

无；本包从不组装或发送提供方请求。

## 已知限制与后续工作

- wire 条目视图（`AttentionItemView`）除 `title` 摘要外不携带 `taskId` 等嵌入，也不携带时间戳；因此每行显示来源摘要、条目 id、状态与修订，而非创建/更新时间。
- 该队列刻意只读：澄清的处理发生在 attention-inbox 的决策面，而非此处。
