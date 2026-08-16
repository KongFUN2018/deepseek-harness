# Agent Note：Task-flow M4 冻结——持久 attention 收件箱与决策命令

Status: proposed

[English](2026-08-16-task-flow-m4-freeze.md) | 中文

## Problem

Task-flow 在开包前冻结里程碑契约。M3 落地了复杂 Gate：B/C check 把其阶段运行停靠在 `awaiting-decision`，但没有包拥有解除停靠的决策。M1 的 workbench host 已在内存收件箱上暴露 `listSnapshot` / `confirmBatch` / `resolveDecision` / `invalidateItem`，而 M1/M3 冻结都把持久收件箱与 `resolveDecision` 推迟到 M4。两个事实相撞：其一，停靠的运行没有持久决策项，收件箱只是进程内的 seed 列表，重启即失且无法解释多标签页冲突；其二，总体设计 §3.4 以 `optionId` 命令面命名 `resolveDecision`，但 M1 wire 词汇用自由 `decision` 文本——持久命令与 wire 面必须一起钉死，否则二者漂移。开 M4 而无冻结范围，会让实体 schema、命令结果阶梯与引擎重验边界逐包重议。

## Proposal

M4 是注意力里程碑：持久 `AttentionItem` 实体、带乐观并发的决策命令、以及以该实体为后端的 workbench 收件箱。四个包；既有 `workbench-host` 原地重建，不重发。

### 包冻结

- `packages/task-flow/attention`（`@deepseek-ai/dsh-attention`）落地 `ctx.attention` 与 `attention` 域。
- `packages/task-flow/workbench-host-stream`（`@deepseek-ai/dsh-workbench-host-stream`）落地版本化 snapshot + 增量 envelope 客户端面。
- `packages/task-flow/client-ui-attention-inbox`（`@deepseek-ai/dsh-client-ui-attention-inbox`）落地收件箱 UI。
- `packages/task-flow/client-ui-task-detail`（`@deepseek-ai/dsh-client-ui-task-detail`）落地任务详情 UI。

### AttentionItem 实体

每个 gate check 或每个独立任务决策对应一个持久项，以品牌 `itemId` 为键，携带 `taskId`、可选 run/phase-run/submission/check 引用、呈现 `kind`（`b-confirm` / `c-decision` / `clarification` / `recovery`）、业务 `decisionKind`、`options`、用于 compare-and-set 的 `entityRevision`，以及生命周期字段。状态为 `open → resolved`（决策）、`open → invalidated`（上游失效）、`resolved → stale`（影响传播）。

### ctx.attention 命令面

`createItem`（按键幂等）、`listOpen`、`getItem`、`resolveDecision(itemId, expectedEntityRevision, optionId, actor, idempotencyKey)`、`confirmBatch(targets, actor, idempotencyKey)`（返回逐项 `resolved` / `conflict` / `stale` / `withdrawn` / `already-resolved`），以及 `invalidateItem`。每条命令在一个任务写链中校验 open/stale/版本、追加 journal、更新项，再通知引擎。C 项绝不进入批量；任何 stale、withdrawn、已处理或版本冲突项不得被静默确认。

### workbench host 重建与服务联动

`workbench-host` 保留四个 Remote wire 类型但委托 `ctx.attention`；其 M1 `decision` 文本映射为 `optionId`。gate 服务在把运行停靠 `awaiting-decision` 前，为每个 B/C check 建一个项（`options = check.humanAction`）。clarification 服务为每个请求建一个 `kind='clarification'` 项，并在必答回填后关闭。解除一个 gate 全部项的决策经 `resumePhaseFromAwaiting` 恢复运行；引擎闭包不变。

## Alternatives considered

**保持内存收件箱只加 UI。** 否决：出口判据是「多标签页冲突可解释、无静默确认」，需要收件箱在重启后仍存的持久 revision 才能提供。

**把 attention 实体折进 workbench-host。** 否决：通道 wire 面与持久域独立演进；总体设计已把 `attention`（域）与 workbench host API 分开。

**B/C 共用一个 resolve 命令。** 否决：C 决策逐项携带 `optionId`；B 确认是必须返回逐项结果的乐观批量，故两者分开。

**扩引擎闭包注入 attention。** 否决：M1 冻结禁止，且完成经既有 `resumePhaseFromAwaiting` 任务命令与 `phase-run/updated` 组合唤醒引擎。

## Acceptance criteria

- B/C gate check 建持久 `AttentionItem`；收件箱重启后重建，绝不依赖进程内 map。
- 带旧 revision 的 `resolveDecision` 返回 `conflict`/`stale`/`already-resolved`，绝不静默解决；解除一个 gate 全部项后从 `awaiting-decision` 重跑 Gate。
- 含 open、stale、已处理项的批量返回逐项结果，且只确认 open 且 revision 匹配的项。
- 两个标签页同时确认同一项只解决一次；落败方收到冲突并刷新。
- clarification 请求建 `kind='clarification'` 项，必答回填后关闭。
- 真实 Loader 组合跑通 M1/M2/M3 栈加 attention，早前语义（暂停静默、恢复不重跑、stale 传播、澄清回填、Gate 证据范围）仍绿。

## Risks

M1 wire `decision` 文本与持久 `optionId` 是同一值的两个名字；workbench-host 委托必须是二者唯一交汇处，否则 wire 与域漂移。`impactSnapshot` 与 `reversibleUntil` 为 M5 rewind 声明但 M4 无写入者，故必须保持可选、绝不断言已填充。混合 B/C gate 的引擎重验归属（attention 解决后 resume 还是引擎重查）留到开包时定；语义——B 可先确认、仅当每个 B 与 C 项都解决才通过——已冻结且不得弱化。
