# @deepseek-ai/dsh-impact-propagation

English | [中文](README.zh.md)

Task-flow impact application (`ctx.impactPropagation`): applies a persisted deliverable `ImpactSnapshot` to the task plane. The upstream edit flow calls it after `invalidateDownstream` — the affected phase runs move to `stale`, and the recorded gate verdicts their submissions produced are annotated stale so they no longer support a pass.

## Configuration

The service mounts after the deliverable service and the task provider and needs no configuration of its own.

```yaml
- id: deliverable-local
  name: '@deepseek-ai/dsh-deliverable-local'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: impact-propagation
  name: '@deepseek-ai/dsh-impact-propagation'
```

## Service contract

- `apply(snapshot: ImpactSnapshot, mutation: TaskMutationContext)` — validate the snapshot and, per affected phase run, call the task command `markPhaseStale` (with `expectedRevision` of the stored run) when the run is not already stale; per stale gate-check group, call `markGateChecksStale`. A snapshot referencing a missing phase run, or a `running`/stale transition that the task state machine forbids, fails loud with the task error. Replaying the same snapshot is idempotent — already-stale runs and verdicts are skipped. Returns `{ staledPhaseRuns, staledGateChecks }`.

The snapshot is durable in the deliverable domain; this service only applies it, so it appends no journal facts of its own.

## Invariant

The `./invariant` companion is an explained empty installer: the service holds no storage domain of its own and mutates only the task plane through the frozen task commands, whose transitions the task package's own invariant already checks.

## Model Experience

### The task-plane application of a deliverable closure

#### What the model sees

Nothing directly. `markPhaseStale` and `markGateChecksStale` change which phases the engine re-opens, so the effect reaches a model as future phase prompts, not as text from this package.

#### Token effect

None. The application writes task projections on the storage domain, outside the model request path.

#### KV Cache effect

None. No prompt prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **No impact preview.** `apply` executes the closure; rewind/patch impact preview (M5, FR-7) consumes the snapshot before applying it.
