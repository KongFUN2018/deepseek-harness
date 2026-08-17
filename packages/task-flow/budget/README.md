# @deepseek-ai/dsh-budget

English | [中文](README.zh.md)

Task budget ledger (`ctx.budget`): one explicit durable record per task over the three budget dimensions (tokens, duration, reruns). Recording usage evaluates each dimension against its limit — 80% raises one batch-confirmable warning item per budget revision, and crossing the limit parks the task in `awaiting-decision` behind a blocking decision item whose resolved outcome lands through `applyBudgetDecision`. Limits are never defaulted: provisioning requires explicit values.

## Configuration

The service mounts after the task provider, the attention service, and the workbench journal, and needs no configuration of its own.

```yaml
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: attention
  name: '@deepseek-ai/dsh-attention'
- id: budget
  name: '@deepseek-ai/dsh-budget'
```

## Service contract

- `provisionBudget(taskId, limits, actor, idempotencyKey)` — one ledger per task; at least one explicit dimension (`maxTokens`/`maxDurationMs`/`maxReruns`, positive integers); an absent dimension is unlimited, never defaulted. Re-provisioning fails `already-provisioned`. Journals `budget/provisioned`.
- `appendBudget(taskId, deltas, expectedRevision, actor, idempotencyKey)` — raise limits on the stored revision; the ledger revision increments and the warning latch resets (a new budget re-arms the 80% warning). Journals `budget/appended`.
- `recordUsage(taskId, usage, actor, idempotencyKey)` — accumulate explicit spend, journal `budget/used`, then per dimension: at `≥ 80%` of the limit and not yet warned at this revision, open a `b-confirm` `budget-warning` item and journal `budget/warned`; beyond the limit, park the task (`markTaskAwaitingDecision`, only from `running` — a later intake on a parked task journals but does not re-park) and open one `c-decision` `budget-exceeded` item per crossed dimension (`append-budget`/`pause`/`cancel`), journaling `budget/exceeded`.
- `getBudget(taskId)` — read the ledger.
- `applyBudgetDecision(itemId, deltas, taskRevision, actor, idempotencyKey)` — land one resolved `budget-exceeded` decision: `append-budget` grows the ledger and resumes the task; `pause`/`cancel` route to the task commands. An unresolved or foreign item fails loud. Journals `budget/decision-applied`.

## Invariant

The `./invariant` companion checks ledger-threshold consistency on the authoritative change stream: a stored record may never spend beyond a finite limit in a single write without the exceeded decision being journaled first.

## Model Experience

### Budget thresholds as workbench items

#### What the model sees

Nothing directly. The `budget-warning` and `budget-exceeded` items render in the workbench inbox; a model experiences an over-limit task only as the paused schedule — after `markTaskAwaitingDecision` parks it, no new phase prompts run until `applyBudgetDecision` lands.

#### Token effect

None. The ledger and items are storage-domain writes outside the model request path.

#### KV Cache effect

None. No prompt prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **No usage auto-collection.** `recordUsage` is the explicit intake; wiring session/telemetry usage sources waits for the M0 calibration to fix the accounting basis.
- **No static estimates.** PRD §10 requires calibrated per-revision estimates before any projected-cost surface exists here.
