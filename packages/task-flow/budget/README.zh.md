# @deepseek-ai/dsh-budget

[English](README.md) | 中文

任务预算台账（`ctx.budget`）：每任务一条显式持久记录，覆盖三个预算维度（token、时长、重跑）。记账时按维度对限额评估——达到 80% 在该预算 revision 上开一个可批量确认的预警 item；越过限额则把任务停入 `awaiting-decision`，由一个阻塞决策 item 承接，其解决后的 outcome 经 `applyBudgetDecision` 落地。限额永不默认：provision 必须给显式值。

## 配置

服务装配在任务 provider、attention 服务与 workbench journal 之后，自身无配置。

```yaml
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: attention
  name: '@deepseek-ai/dsh-attention'
- id: budget
  name: '@deepseek-ai/dsh-budget'
```

## 服务契约

- `provisionBudget(taskId, limits, actor, idempotencyKey)` —— 每任务一条台账；至少一个显式维度（`maxTokens`/`maxDurationMs`/`maxReruns`，正整数）；缺席的维度是无限制，不是默认值。重复 provision 以 `already-provisioned` 失败。记 `budget/provisioned`。
- `appendBudget(taskId, deltas, expectedRevision, actor, idempotencyKey)` —— 在存储 revision 上追加额度；台账 revision 递增且预警闩复位（新额度重新武装 80% 预警）。记 `budget/appended`。
- `recordUsage(taskId, usage, actor, idempotencyKey)` —— 累加显式支出，记 `budget/used`，再按维度：达到限额 `≥ 80%` 且本 revision 未预警过，开 `b-confirm` 的 `budget-warning` item 并记 `budget/warned`；越过限额，把任务停入 `markTaskAwaitingDecision`（仅从 `running`——已停任务上的后续 intake 记账但不重复停），每个越限维度开一个 `c-decision` 的 `budget-exceeded` item（`append-budget`/`pause`/`cancel`），记 `budget/exceeded`。
- `getBudget(taskId)` —— 读台账。
- `applyBudgetDecision(itemId, deltas, taskRevision, actor, idempotencyKey)` —— 落地一个已解决的 `budget-exceeded` 决策：`append-budget` 追加台账并恢复任务；`pause`/`cancel` 路由到任务命令。未解决或外来 item 显式失败。记 `budget/decision-applied`。

## 不变式

`./invariant` 伴生插件在权威变更流上检查台账阈值一致性：一条存储记录不得在单次写入中越过有限限额而超限决策未先行记入 journal。

## Model Experience

### 作为工作台 item 的预算阈值

#### 模型看到什么

不直接看到。预警与超限 item 渲染在工作台收件箱；模型对超限任务的感知只来自被暂停的调度（决策落地前不再有新 phase 提示词）。

#### Token 影响

无。台账与 item 都是存储域写入，不在模型请求路径上。

#### KV Cache 影响

无。本包不新增、删除或重排任何提示词前缀。

## Known Limitations and Deferred Work

- **无用量自动采集。** `recordUsage` 是显式入口；session/telemetry 用量源的挂接等 M0 校准确定记账口径后再做。
- **无静态估算。** PRD §10 要求先有按 revision 校准的估算，本包才可能出现预计成本表面。
