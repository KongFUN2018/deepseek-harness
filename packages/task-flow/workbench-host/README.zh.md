# @deepseek-ai/dsh-workbench-host

[English](README.md) | 中文

工作台注意力通道宿主服务：M4 持久注意力收件箱（`ctx.attention`）之上的客户端安全投影。快照读取把 open 注意力条目投影为 wire 视图；确认、决策、失效委托给注意力服务的乐观并发命令，因此 stale、withdrawn、resolved 或版本冲突的条目永远不会被静默确认。`workbench/attention-updated` 事件仍在提交变更后广播，快照版本取日志检查点 seq。

## 服务契约

`ctx.workbenchHost` 是绑定在 `workbenchHost` wire 命名空间上的 `TypertRemoteService`。四个 `@Remote` 方法只接收纯 wire 值（不做会话查询），因此收件箱天然跨会话：

- `listSnapshot()` —— 全量 open 收件箱读取，含 `snapshotVersion`（日志检查点 seq）与逐项 `entityRevision`。仅投影 open 条目；resolved 与 invalidated 条目移出收件箱。
- `confirmBatch(request)` —— 单趟解析每个仍 open 且 revision 匹配的 B 类条目；每个 target 返回 `resolved | conflict | stale | withdrawn | already-resolved`，条目存在时附 `currentRevision`。部分提交是契约，不是回滚。
- `resolveDecision(request)` —— 单条 C 类决策写入，记录决策文本；文本映射为条目上的 `optionId`，不在 options 内的文本抛 invalid-argument 错误而非静默确认。C 类从不批量。
- `invalidateItem(request)` —— 上游失效传播触发；之后对该条目的确认返回 `stale`。

每次提交的变更广播 `workbench/attention-updated` 并携带变更行；监听器失败被包含并记录日志。

## 扩展点

- `workbench/attention-updated` Cordis 事件（在 `@deepseek-ai/dsh-api-remotes` 中 allowlist）是推送通道；消费者在 Client 环境用 `ctx.remote.$on('workbench/attention-updated', ...)` 订阅。
- `ctx.attention` 是持久权威；宿主服务只做投影与委托，因此新的 attention kind 或状态会通过共享 wire 词汇在此浮现。

## 模型体验

### 工作台注意力收件箱命令

#### 模型看到什么

什么也看不到。`ctx.workbenchHost` Remote 面只服务浏览器工作台 UI；没有工具、提示段或会话事件把收件箱暴露给模型请求。

#### Token 影响

无。命令与快照走 RPC 载体，不在模型请求路径内。

#### KV Cache 影响

无。收件箱从不进入提示，因此本包不会增删或重排任何前缀。

## 已知限制与延后工作

- 快照仅投影 open 条目；已决策文本不随快照携带，因为条目已离开收件箱。wire `decision` 字段保留给 M4 通道客户端，它改由推送事件追踪已决 C 类条目。
- 批量按条目首写获胜，无服务端排队；被拒绝的 target 返回 `currentRevision` 供立即重试，而非持锁。
- 推送事件只携带变更行而非整份快照；断线重连重同步（游标窗口、`resnapshot-required`）延后到 M4 通道客户端，尚未上 wire。
