# client-ui-attention-inbox — 网页决策收件箱

[English](README.md) | 中文

工作台注意力通道的浏览器半边：一个 `sidebar.footer.action` 入口，其触发打开决策收件箱面板。收件箱通过生成的 `workbenchHost` Remote 呈现待决注意力项，折叠转发的 `workbench/attention-updated` 事件，在重连时重放 `workbenchHostStream` 增量，并以每行的 compare-and-set 修订发起批量确认与单决策动词。未决结果（冲突、过时、已撤回、已处理，或无效选项）从不被静默移除——其数量被展示并重新同步列表。

## 呈现面

- 占用 `sidebar.footer.action`（ui-sidebar 声明，可加列表槽），id 为 `attention-inbox`。
- 面板以模态打开。B 类（`b-confirm`）行可勾选并批量确认；C 类（`c-decision`）行带决策输入与提交动词；澄清/恢复行只读呈现。

## 对象层

`src/client/inbox.ts` 无 React：`AttentionInboxController` 持有一个快照 store（`InboxState`），通过 `remote.workbenchHost.listSnapshot()` 加 `remote.workbenchHostStream.listIncremental(0)` 的 epoch/cursor 加载，按修订门控折叠转发的 `workbench/attention-updated` 事件，并通过 Remote 发起 `confirmBatch` / `resolveDecision`。重连（`connection/reset`）从记录的 cursor 重放增量，在 epoch 变化或存在待决事件时重新同步；失败或冲突的命令从权威快照重新同步。

## 模型体验

无：本包为人类渲染宿主计算出的注意力投影，不触碰任何提示、消息、schema、流或工具结果。确认/决策动词只路由注意力变更；条目状态从不进入提示或会话日志。

#### KV 缓存影响

无；本包从不组装或发送提供方请求。

## 已知限制与后续工作

- wire 条目视图（`AttentionItemView`）不携带选项，因此 C 类决策是自由文本输入，由宿主按 `item.options` 校验；选项列表本身不渲染。呈现选项需等待 wire 拓宽。
- 记录的 actor 是固定的 `workbench-inbox` 标记；客户端没有可转发的用户身份。
- 冲突或失败会重新同步整个列表而非逐行修补；逐行乐观折叠等待同一后续。
