# @deepseek-ai/dsh-task-local

English | [中文](README.zh.md)

Task-flow durable task provider (`ctx.tasks`): implements the `TaskHandle` storage hooks over one storageDomain unit (`task_local` domain, five tables). Every projection write appends its journal fact first — the append is the commit point — so checkpoint/replay can rebuild every projection, and submission acceptance validates deliverable refs inside the task write chain by injecting the minimal deliverable service.

## Configuration

The provider mounts behind the storage stack, the recipe registry, the workbench journal, and the minimal deliverable service, and needs no configuration of its own.

```yaml
- id: storage
  name: '@deepseek-ai/dsh-storage'
- id: storage-json
  name: '@deepseek-ai/dsh-storage-json'
  config:
    root: /var/lib/dsh/storages
- id: storage-domain
  name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- id: recipe
  name: '@deepseek-ai/dsh-recipe'
- id: workbench-journal
  name: '@deepseek-ai/dsh-workbench-journal'
- id: deliverable-local
  name: '@deepseek-ai/dsh-deliverable-local'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
```

## Service contract

The Remote command surface is inherited from the task Service Definition; this provider adds no methods. It overrides two protected extension points:

- `resolveSubmissionEnvironment` derives `inputsCurrent` (every referenced input version exists, belongs to the named deliverable, and is `current`) and `outputsValid` (every referenced output version exists and carries this submission as `sourceSubmissionId`) from the deliverable service, ignoring caller claims. A failed derivation appends its problems to the rejection.
- `onSubmissionAccepted` registers the submission's input versions as the phase run's phase inputs, so `listCurrentInputs` reflects the accepted snapshot and downstream invalidation can mark them stale.

### Write path

Each mutation runs inside the base class's serialized write chain: load, transition, append the journal fact (`taskFactKey(kind, entityId, entityRevision)` — deterministic per projection write), then put the projection. A put whose revision does not equal the stored revision plus one rejects with `stale-revision`. Submission acceptance admits `running` and `pausing` tasks — an engine executor resolving after `requestPause` still records its submission — while `cancelling` and settled tasks reject. Restarts recover projections and the journal head from the same medium.

## Invariant

The `./invariant` companion registers under the package name and checks projection-journal consistency on the authoritative change stream: a `task_local` projection put (and every gate-result list position) without a matching journal fact fails.

## Model Experience

### The durable task provider behind the workbench

#### What the model sees

Nothing directly. The provider serves the engine and the task board; task state reaches a model only through the engine's phase prompts built from `resolveSubmissionEnvironment` verdicts, which this package does not shape.

#### Token effect

None. Projections and journal facts travel on the storage domain, outside the model request path.

#### KV Cache effect

None. Task projections never enter a prompt, so no prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **Single-medium projection sizing.** `loadTaskByIdempotencyKey` and `loadSubmissionByIdempotencyKey` scan their tables linearly; per-key indexes are deferred until real task volume demands them.
- **Gate results carry no caller provenance.** `recordGateCheck` is engine-owned and derives its provenance from the submission and check ids plus the recording timestamp; a caller-supplied actor lands with the multi-phase gate write path (M3).
- **No cross-host replication.** The write chain serializes commands inside one host process; multi-host coordination is out of M1 scope.
