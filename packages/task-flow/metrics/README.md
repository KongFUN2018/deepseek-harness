# dsh-metrics — workbench metrics

English | [中文](README.zh.md)

The M6 workbench KPI projection (live tasks, open gate/ask items, current
deliverable versions, throughput, gate pass rates) and per-task measures
(phase durations, reruns, decisions, budget spend). Pure read — derived from
the entity projections and the journal on every call.

## Usage

```ts
const kpi = await ctx.remote.metrics.metrics()
const task = await ctx.remote.metrics.taskMetrics(taskId)
```

## Model Experience

None, as this package aggregates durable task facts for a human to review and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- The throughput window is fixed at 7 days; a configurable window is future
  work (deployment-varying choice, not a hardcoded tunable).
- `rerunCount` counts rewind applications plus retried submissions (a phase
  run appearing more than once in `submission/recorded`); it does not read
  the budget ledger's rerun dimension.
- The gate pass rate defaults absent-kind verdicts to the A class.
