# @deepseek-ai/dsh-attention

[English](README.md) | 中文

持久化注意力收件箱（`ctx.attention`）：每个 Gate 检查或独立任务决策对应一条持久化 `AttentionItem`。所有命令都是乐观并发——都携带 `expectedEntityRevision` 并逐项返回 outcome——因此陈旧（stale）、已撤销（withdrawn）、已决（resolved）或版本冲突（conflict）的条目绝不会被静默确认。条目定案时先写 journal 事实、再写投影，最后当其 Gate 的全部条目都已定案时把阶段运行恢复出 `awaiting-decision`。

## 配置

该服务无可调参数。它依赖存储域、工作台 journal 与任务服务；装配 bundle 时依次列出它们与本包。

```yaml
- id: storage-domain
  name: '@deepseek-ai/dsh-storage-domain'
- id: workbench-journal
  name: '@deepseek-ai/dsh-workbench-journal'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: attention
  name: '@deepseek-ai/dsh-attention'
```

## 服务契约

- `createItem(input, actor, idempotencyKey)` — 创建一条条目。`input` 为 `{ itemId, taskId, runId?, phaseRunId?, submissionId?, checkId?, kind, decisionKind, options }`；`itemId` 由调用方提供且稳定，`options` 非空。用相同调用方键重放返回已存条目；`itemId` 不同则以 `conflict` 失败。
- `resolveDecision(itemId, expectedEntityRevision, optionId, actor, idempotencyKey)` — 对一条条目做出决策。`optionId` 必须在条目的 `options` 内（否则 `invalid-argument`）；revision 不匹配返回 `conflict`、条目不存在返回 `withdrawn`、已决条目同选项返回 `resolved`、不同选项返回 `already-resolved`、已失效条目返回 `stale`。
- `confirmBatch(targets, actor, idempotencyKey)` — 一次批量确认 B 类条目；每个仍 open 且 revision 匹配的目标都会定案并逐项报告 outcome。C 类条目从不批量处理。
- `invalidateItem(itemId, expectedEntityRevision, reason, actor, idempotencyKey)` — 上游使一条 open 条目失效，使后续决策报告 `stale`。
- `getItem(itemId)` / `listOpen()` — 读取一条条目，或按打开顺序返回全部 open 条目。

实体位于 `attention` 域（`version: 1`）：以 `AttentionItemId` 为键的 `items` 表，以及 `item_keys` 创建幂等索引。`AttentionItem` 记录 `itemId`、`taskId`、可选的 `runId`/`phaseRunId`/`submissionId`/`checkId`、`kind`（`b-confirm` | `c-decision` | `clarification` | `recovery`）、`decisionKind`、可选的 `impactSnapshot`、`options`、`state`（`open`/`resolved`/`invalidated`/`stale`）、`entityRevision`、`openedAt`，以及可选的 `resolvedAt`/`resolvedBy`/`outcome`/`reversibleUntil`。

## 决策语义

`optionId` 是持久化命令字段。workbench-host 在该边界把其 wire 上的 `decision` 文本映射为 `optionId`；attention 本身只存储与校验 `optionId`。`impactSnapshot` 与 `reversibleUntil` 为可选字段，M4 没有任何写入方。阶段运行会停在 `awaiting-decision` 直到命名该运行的每条条目都已定案；`resumeIfAllSettled` 随后将其恢复。仍有一条 open 条目则运行继续停留。

## 不变式

`./invariant` 伴生在 `domain/changed` 流上校验引用完整性：item-key 条目必须指向已存条目。

## Model Experience

### 阶段链之后的决策轮次

#### 模型看到什么

本包不直接输出任何内容。收件箱是持久化状态；决策轮次及其提示词属 M4 的 attention-inbox UI 包，它把 open 条目呈现为工具结果，并把所选决策文本映射为 `optionId`。

#### Token 影响

无。命令只写持久化条目与状态迁移，从不输出文本。

#### KV Cache 影响

无。本包不新增、删除或重排任何 prompt 前缀。

## Known Limitations and Deferred Work

- **无决策呈现。** 把 open 条目呈现给模型并把所选决策文本映射为 `optionId` 的能力在 M4 的 `ui-attention-inbox` 包中交付。
- **仅 B 类批量。** `confirmBatch` 只批量 B 类条目；C 类决策总是一次一条命令。
- **可选字段在 M4 保持为空。** `impactSnapshot`（回退影响预览）与 `reversibleUntil`（回退截止时间）在 M4 没有写入方。
