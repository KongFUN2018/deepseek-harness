# Agent Note：attention 增量流源自 journal 而非推送事件

Status: implemented

[English](2026-08-16-task-flow-attention-incremental-stream.md) | 中文

## 问题

M4 需要基于 cursor 的 attention 收件箱增量流，让恢复的客户端无需重读整个快照即可追赶。最明显的来源——`workbench/attention-updated` host 事件——只在 workbench host 执行自身命令后广播。gate item（每个 B/C check 一个）与 clarification item 由这些服务直接调用 `ctx.attention` 创建，因此以事件为键的流会静默漏掉这些生产者打开或关闭的每个 item。

## 决策

`packages/task-flow/workbench-host-stream`（`@deepseek-ai/dsh-workbench-host-stream`）改为从只追加的 workbench journal 派生流，而非推送事件。`listIncremental(cursor?)` 重放某序号之后的 journal fact，保留 kind 以 `attention/` 开头的那些，并把每个投影为 `{ cursor, previousCursor, eventId, entityKind: 'attention', entityId, entityRevision, operation, payload }`。`cursor` 是 journal 序号（排他下界；省略、非正或非有限重放全部）；页面返回每次启动的 `streamId` epoch 与新的 checkpoint 序号。`operation` 由 fact kind 收窄（`created`/`resolved`/`invalidated`），未知 attention kind 回退 `updated`。因为 journal 记录每次 attention 变更，流覆盖 workbench-host 命令、gate item、clarification item 全部；实时 `workbench/attention-updated` 事件仅作推送 carrier，gate 与 clarification 建出的 item 在下一次 `listIncremental` 读取中出现。

## 验证

- 8 个单元测试：空 journal、created/resolved/invalidated 投影、cursor 推进、非 attention 过滤、stream id 稳定、非正重放，以及未知 kind 与畸形 payload 的 `updated`/空 id 回退。
- 1 个真实 Loader e2e：建项后决项，断言投影出两个事件且 stream id 稳定。
- `src` 逐文件覆盖率 100%；oxlint、knip、typecheck、cordis-config、package-invariants、readme-limitations、model-experience、translation-pairing 全绿。

## 备选方案

- **事件键控内存日志** 对 **journal 派生流**：以 `workbench/attention-updated` 为键的事件会漏掉 gate/clarification 变更，且 host 重启后不持久，无法满足 epoch 变化后重取快照的契约。
- **让 gate/clarification 也广播** 对 **单一权威源**：教每个生产者发 `workbench/attention-updated` 会复制 journal 的 fact 流并有漂移风险；journal 已是每个生产者写入的单一只追加源。

## 后果

- `streamId` 是每次启动的 `randomUUID`；持有其他启动 cursor 的客户端检测到 epoch 变化后重取快照。
- journal 在 M4 永不截断，故 `listIncremental` 可从任意历史 cursor 重放；保留窗口与 `resnapshot-required` 随 journal 压缩一并延期。
- 流仅作读取管道：不产生任何模型可见或用户可见输出，也不为其新增转发事件。
