# @deepseek-ai/dsh-workbench-host

[English](README.md) | 中文

工作台注意力通道宿主服务：一个内存版、带版本号的注意力收件箱，用于先行验证宿主-客户端通道切片——快照读取、compare-and-set Remote 命令、`workbench/attention-updated` 转发推送事件——在 M1 任务引擎落地持久 journal 之前。

## Config

- `seedItems`（默认 `[]`）：启动时注入的注意力条目；id 必须唯一，kind 为 `b-confirm` 或 `c-decision`，title 非空。

## Service contract

`ctx.workbenchHost` 是绑定 `workbenchHost` wire 命名空间的 `TypertRemoteService`。四个 `@Remote` 方法只收发普通 wire 值（不做会话查找），因此收件箱天然跨会话：

- `listSnapshot()` —— 全量读取收件箱，携带 `snapshotVersion` 与逐条 `entityRevision`。
- `confirmBatch(request)` —— 一次提交解决所有仍处 open 且版本匹配的 B 类条目；每个目标各自汇报 `resolved | conflict | stale | withdrawn | already-resolved`，条目存在时附 `currentRevision`。部分提交即契约本身，不做回滚。
- `resolveDecision(request)` —— 单条 C 类条目写入，记录决策文本；C 类条目永不批量。
- `invalidateItem(request)` —— 上游失效触发器；之后对该条目的确认会汇报 `stale`。

每个产生提交的命令将 `snapshotVersion` 递增一次，并携带变更行发出 `workbench/attention-updated`；监听器失败被容纳并记录日志。

## Extension points

- `workbench/attention-updated` Cordis 事件（已列入 `@deepseek-ai/dsh-api-remotes` 白名单）是推送通道；Client 环境用 `ctx.remote.$on('workbench/attention-updated', …)` 订阅。
- M1 任务引擎将以持久 journal 替换内存存储，Remote 面保持不变。

## Model Experience

### 工作台注意力收件箱命令

#### What the model sees

Nothing. `ctx.workbenchHost` Remote 面仅服务浏览器工作台 UI；任何工具、prompt 分节或会话事件都不会把收件箱暴露给模型请求。

#### Token effect

None. 命令与快照走 RPC 载体，不在模型请求路径上。

#### KV Cache effect

None. 收件箱从不进入 prompt，本包不会增加、删除或重排任何前缀。

## Known Limitations and Deferred Work

- 存储为内存态并由 config 播种；重启即丢。M1 journal 成为权威存储后，`src/invariant.ts` 中暂挂的 append-only 不变式随之安装。
- 批量为逐条目 first-write-wins，无服务端排队；被拒绝的目标返回 `currentRevision` 供立即重试，而非持锁等待。
- 推送事件携带变更行而非全量快照；重连再同步（游标窗口、`resnapshot-required`）推迟到 M1 通道客户端，尚未上wire。
