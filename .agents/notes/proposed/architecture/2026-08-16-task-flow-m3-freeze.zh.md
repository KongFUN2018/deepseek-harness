# Agent Note：Task-flow M3 冻结 — 多阶段 Recipe、持久澄清与复杂 Gate

状态：proposed

[English](2026-08-16-task-flow-m3-freeze.md) | 中文

## 问题

Task-flow 在开包前冻结里程碑契约。M1 冻结了单 executor 引擎闭包与提交—门检—通过链；M2 在不扩引擎闭包的前提下冻结了产物域。现在有两件事撞在一起。其一，M1 引擎已经按声明顺序推进阶段、本可跑通冻结的四阶段 Recipe，但它只有一个 executor 槽、且拒绝任何非 A 类 Gate 检查——所以已落地的「多阶段」其实是单 executor、仅 A 类。其二，已发布 README 与 M2 冻结都把 executor 注册表和 B/C Gate 写路径顺延到「M3」，但 M3 没有冻结契约：澄清实体、会话消息注入、Gate 结果的证据范围、awaiting 状态都是「有名无主」。不给 M3 一个冻结范围，每个包都会重新争论包名、引擎闭包边界与澄清恢复机制。

## 提案

M3 是阶段链里程碑：按阶段种类路由 executor 的多阶段 Recipe、可重启恢复的持久澄清、记录证据范围并进入 awaiting 状态的复杂 Gate。三个 host 包，无 client 包。

### 包冻结

- `packages/task-flow/recipe-multiphase`（`@deepseek-ai/dsh-recipe-multiphase`）承载按阶段种类的 executor 注册表及其聚合 `PhaseExecutor`。
- `packages/task-flow/clarification`（`@deepseek-ai/dsh-clarification`）承载 `ctx.clarifications`。
- `packages/task-flow/gate`（`@deepseek-ai/dsh-gate`）承载 `ctx.gate`。

### Recipe schema

`RecipePhaseSpec` 新增 `kind`——跨 Recipe 的阶段种类字符串，用于把阶段路由到 executor；`phaseId` 仍唯一标识 Recipe 内阶段，`kind` 不参与阶段顺序。

### 不扩引擎闭包的 executor 路由

`recipe-multiphase.registerExecutor(phaseKind, executor)` 维护按 kind 的表，并暴露一个聚合 `PhaseExecutor`，其 `execute` 按 `assignment.phase.kind` 分派；未注册的 kind 以 `no-executor` 失败。装配层把该单一 executor 注册进 recipe-engine-core 既有的单槽 `registerExecutor`。引擎闭包、单槽 API、`advancePhases`（顺序、前一阶段 passed 才开下一阶段）全部不变。

### 持久澄清

`ctx.clarifications`（`inject = ['storageDomain', 'workbenchJournal', 'tasks', 'session']`）在 `clarification` 域拥有 `ClarificationRequest` / `Question` / `Answer`。`createRequest(phaseRunId, questions, actor, idempotencyKey)` 创建请求；`answerPartial(questionId, expectedRevision, answer, actor, idempotencyKey)` 按 question revision 幂等保存。当所有 `required` 问题都有答案，服务把答案汇总作为 model-visible 用户消息追加到阶段 session log，记录持久化 event id，标记请求 `injected`，追加任务级 `ClarificationFact`，并经新任务命令把 PhaseRun 从 `awaiting-input` 推进重验。重启按 `injectedEventId` 重放注入判定——绝不依赖进程内 Promise。

### 复杂 Gate

`GateCheckResult` 新增 `uncoveredScope` 与 `evidenceRefs`；`recordGateCheck` 记录它们。A 类检查仍在引擎判定（确定性逻辑不变，现在补记录范围）；B/C 检查被识别、记录其 `uncoveredScope`，PhaseRun 进入 `awaiting-decision` 且不产生 pass/fail 裁决——决策收件箱属 M4 attention 服务。引擎的 `scopeOk` 不再拒绝 B/C Recipe，`runGate` 跳过 B/C，由 gate 服务经 M2 已认可的 `phase-run/updated` 组合驱动。

### 新任务命令

`markPhaseAwaitingInput` / `markPhaseAwaitingDecision` 把 PhaseRun 推入 awaiting 状态（守卫迁移表新增入边）；`resumePhaseFromAwaiting` 把它推回 `gate-running`。引擎已经在这两个状态驻留，因此完成流经既有 `phase-run/updated` 事件唤醒引擎。

## 备选方案

**在 M3 里建 B/C Gate 与 attention 收件箱。** 否决：attention 收件箱持久化与 `resolveDecision` 属 M4；M3 只进入 `awaiting-decision` 状态并记录证据范围，决策面留给 M4。

**引入阶段依赖 DAG 或并行阶段。** 否决：出口判据是可恢复的顺序阶段链，M1 的 `advancePhases` 已提供；DAG 是独立里程碑且当前无消费者。

**扩引擎闭包注入 clarification/gate。** 否决：M1 冻结禁止，且 M2 认可的「独立服务驱动任务命令、响应事件」组合已覆盖 awaiting 流。

**把按 kind 路由折进 recipe-engine-core。** 否决：那会为无谓的引擎需求重新打开已冻结的单槽 executor 契约；聚合 executor 让引擎不动、按 kind 路由在自己的包里演进。

**把澄清答案当作 agent follow-up。** 否决：follow-up 会唤醒 agent 并开启一个轮次；注入必须是 model-visible、可回放但非唤醒，因此是带持久化 event id 的 session log 写入，而非 inbox 排队。

## 验收标准

- 冻结的四阶段 Recipe 按顺序执行，每阶段经其 `kind` 路由；前一阶段 passed 才开下一阶段；重启不重跑任何已过阶段。
- 部分澄清后重启，已答问题不再问、未答问题仍在；汇总答案在会话恢复后作为 model-visible 用户消息回放。
- A 类检查记录 `uncoveredScope` 与 `evidenceRefs`；B/C 检查使 PhaseRun 驻留 `awaiting-decision` 且无 pass 裁决。
- 真实 Loader 组合在 M1/M2 栈之上装配三个 M3 包，M1/M2 语义（pause 静默、恢复不重跑已过阶段、stale 传播、编辑锁）仍绿。

## 风险

executor 注册表标签在 recipe README 里一直是 M2；本冻结把它改归 M3，功能在开包前仍未构建。session 消息注入 seam 按语义冻结（model-visible 用户消息 + 持久化 event id），但确切方法名延到实现——在选择该 seam 时不得把恢复契约弱化为「尽力而为」。`awaiting-decision` 状态在 M3 没有决策面，因此 B/C Gate 会让 PhaseRun 无限驻留直到 M4 落地；验收必须把「驻留 awaiting」视为决策前的合法终态，而非挂起。`kind` 是 Recipe payload 里未校验的自由字符串，因此声明了无人注册 kind 的 Recipe 必须在执行时以 `no-executor` 失败，而不是静默跑在默认 executor 下。