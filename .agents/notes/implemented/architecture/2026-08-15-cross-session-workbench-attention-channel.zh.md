# Agent Note: 跨会话工作台注意力通道

Status: implemented

[English](2026-08-15-cross-session-workbench-attention-channel.md) | 中文

## Problem

任务流程工作台需要一个进程级注意力收件箱，供浏览器 UI 跨会话读取和修改。goal 域 Remote 服务从首个 `Agent` 参数解析会话，跨会话收件箱不需要这一点；它需要普通 wire 读取、compare-and-set 命令，以及一个推送事件，让每个打开的标签页无需轮询即可再同步。

## Decision

`packages/task-flow/workbench-host`（`@deepseek-ai/dsh-workbench-host`）交付一个绑定到 `ctx.workbenchHost` 的 `WorkbenchHostService`。它是 `TypertRemoteService`，四个 `@Remote` 方法只收发普通 wire 值、不做会话查找，因此收件箱天然跨会话。

- `listSnapshot()` 全量读取收件箱，携带收件箱级 `snapshotVersion` 与逐条 `entityRevision`。
- `confirmBatch()` 一次提交解决所有仍处 open 且版本匹配的 B 类条目，每个目标汇报 `resolved | conflict | stale | withdrawn | already-resolved`，条目存在时附 `currentRevision`。部分提交即契约；失败的目标重试而非回滚。C 类条目永不批量。
- `resolveDecision()` 与 `invalidateItem()` 写入一条 C 类决策或一次上游失效。

每次提交把 `snapshotVersion` 递增一次，并携带变更行发出 `workbench/attention-updated`；同步监听器失败被容纳并记录日志，使损坏的观察者不会让已提交的收件箱变更看起来失败。该事件已列入 `@deepseek-ai/dsh-api-remotes` 白名单供网关转发，载荷带版本号，落后一次推送的客户端据此重取快照。

存储为内存态并由 `Config.seedItems` 播种；M4 attention 服务稍后在同一 Remote 面之后以持久实体替换它。`./invariant` 配套插件在该服务落地 append-only 契约前保持说明性的空安装器。服务、事件作用域与 wire 类型渲染到 `docs/subsystems/workbench.md`。

## Alternatives considered

- **全有或全无批量确认** 对比 **逐条部分提交**：一个目标失败的批量否则会回滚所有同批条目；逐条结果让多选确认提交所有仍匹配的条目，并精确汇报需要重试的行。
- **命名包 README 的目录豁免** 对比 **子系统页面**：投影无论如何都会渲染服务与事件，豁免因此是陈旧的；`workbench.md` 是 wire 类型唯一诚实的主页。
- **现在就用持久存储** 对比 **内存态、M1 再落 journal**：通道切片先验证 Remote 面与推送事件，再冻结 journal schema；交付未经验证的 append-only 契约会锁死错误的结构。

## Consequences

换来了一条真实、经过测试的跨会话通道（单元、不变式与 keyless 真实 Loader 冒烟测试），具备带版本号的快照、逐条冲突阶梯与转发的推送事件。代价：M4 attention 服务落地前重启即丢状态；批量为 first-write-wins、无服务端排队；推送事件携带变更行而非全量快照，重连再同步留给 M4 通道客户端。
