# @deepseek-ai/dsh-workbench-host-stream

[English](README.md) | 中文

attention 增量流 host 服务（`ctx.workbenchHostStream`）：基于 workbench journal 的 attention fact，提供按 cursor 排序的变更流。客户端先读 workbench host 的 `listSnapshot`，再以 `cursor`（journal 序号）用 `listIncremental` 推进。每个事件携带 journal event id 用于去重、提交后的 entity revision 用于乐观并发；页面携带每次启动生成的 `streamId` epoch，持有其他启动 cursor 的客户端可据此丢弃并重取快照。

## 配置

服务无可调参数。它需要 workbench journal；bundle 同时列出两者。

```yaml
- id: workbench-journal
  name: '@deepseek-ai/dsh-workbench-journal'
- id: workbench-host-stream
  name: '@deepseek-ai/dsh-workbench-host-stream'
```

## 服务契约

- `listIncremental(cursor?)` — 读取某 journal cursor 之后的 attention 变更事件及新 cursor。`cursor` 是排他的 journal 下界；省略、非正或非有限值重放整条流。返回 `{ streamId, cursor, events }`。

每个事件为 `{ cursor, previousCursor, eventId, entityKind: 'attention', entityId, entityRevision, operation, payload }`。`operation` 由 fact kind 收窄（`created` | `resolved` | `invalidated`），未知 attention kind 回退为 `updated`。`entityId` 是 fact 变更的 item id。流源自只追加的 journal，因此每次 attention 变更——workbench-host 命令、gate item、clarification item——都按序出现。

## 不变式

`./invariant` companion 为空：本服务不写自有持久数据，只投影 journal fact，其完整性已由 workbench-journal 与 attention 的不变式检查。

## Model Experience

### 增量变更流

#### 模型所见

本包不直接产生模型可见内容。流是 host 面读取管道；M4 attention-inbox UI 在 `workbench/attention-updated` 推送事件后消费它以刷新 open item。

#### Token 影响

无。读取只返回 wire 值，从不产生文本。

#### KV Cache 影响

无。本包不添加、移除或重排任何 prompt 前缀。

## Known Limitations and Deferred Work

- **推送复用现有事件。** 流在读取时投影 fact；实时通知仍复用 workbench host 在其自身命令后广播的 `workbench/attention-updated` host 事件。gate 与 clarification 建出的 item 虽不由这些生产者广播该事件，但会在下一次 `listIncremental` 读取中出现。
- **无保留窗口。** journal 在 M4 只追加、永不截断，故 `listIncremental` 总能从任意历史 cursor 重放；窗口与 resnapshot 边界随 journal 压缩一并延期。
