# @deepseek-ai/dsh-gate

English | [中文](README.zh.md)

Complex-gate service (`ctx.gate`): recognizes B/C gate checks on a `gate-running` phase run, creates one `AttentionItem` per check through `ctx.attention` (`kind='b-confirm'`/`'c-decision'`, `decisionKind='gate'`, `checkId`, `options=check.humanAction`), and advances that run to `awaiting-decision`, where the M4 attention service collects the decision. A checks keep their verdict in the engine, which records each A verdict with `uncoveredScope` + `evidenceRefs`; B/C checks carry no machine verdict, so this service never writes a passed/failed result.

## Configuration

The service has no tunables. It declares `tasks`, `recipes`, and `attention`, listens to `phase-run/updated`, and mounts after them:

```yaml
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: attention
  name: '@deepseek-ai/dsh-attention'
- id: gate
  name: '@deepseek-ai/dsh-gate'
```

## Service contract

The service exposes no remote method. On init it subscribes to `phase-run/updated`; for each run reported in `gate-running`, it reads the task's pinned recipe and, when the phase declares a B/C check, creates one attention item per check and writes `markPhaseAwaitingDecision` with the run's revision. Item creation and the transition are issued synchronously so the transition enqueues ahead of the engine's re-verification and the run leaves `gate-running` before the engine can spin on it. A-check-only runs pass through untouched for the engine to settle. Both writes are idempotent in effect: a concurrent or already-owned decision is left to its owner.

## Invariant

The `./invariant` companion has no runtime invariant: the gate service writes no durable domain of its own — its attention items and the phase-run transition are checked by the attention and task package invariants.

## Model Experience

### The complex-gate parking step behind the phase chain

#### What the model sees

Nothing from this package directly. Parking a run in `awaiting-decision` pauses engine scheduling; the decision round and its prompts belong to the M4 attention service.

#### Token effect

None. The service writes a state transition and never emits text.

#### KV Cache effect

None. No prompt prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **Decision collection is attention-owned.** This package only creates the B/C item and parks the run; `resolveDecision`/`confirmBatch` and the resume round belong to the attention service.
- **`uncoveredScope` on A verdicts is engine-owned.** B/C checks record no `GateCheckResult`; the A-check verdict and its `uncoveredScope` + `evidenceRefs` are written by the engine's `recordGateCheck`.
