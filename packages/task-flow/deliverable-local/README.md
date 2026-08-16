# @deepseek-ai/dsh-deliverable-local

English | [中文](README.zh.md)

Task-flow deliverable domain (`ctx.deliverables`): durable version chains per deliverable with dependency edges, idempotent saves, persisted multi-root impact snapshots, and the current-input index the task write chain reads. It replaces `@deepseek-ai/dsh-deliverable-minimal` under the same service key and Remote surface.

## Configuration

The service mounts behind the storage stack and the workbench journal and needs no configuration of its own.

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
- id: workbench-journal
  name: '@deepseek-ai/dsh-workbench-journal'
- id: deliverable-local
  name: '@deepseek-ai/dsh-deliverable-local'
```

## Service contract

Remote commands (the M1 surface plus the M2 extensions):

- `saveVersion(deliverableId, expectedBaseVersion, sourceSubmissionId, idempotencyKey?)` — create the next version of a deliverable. `expectedBaseVersion` must equal the latest version, or the save rejects with `stale-write`. The optional `idempotencyKey` replays a stored save with the same key and fields; different fields under the same key reject with `idempotency-conflict`. A successor chains on a staled head and re-validates the deliverable.
- `listCurrentInputs(phaseRunId)` — the phase run's registered inputs whose version state is `current`, in registration order; stale, invalid, superseded, and cancelled-branch products are excluded.
- `invalidateDownstream(rootVersionIds)` — transition each root and its transitive `dependsOn` consumers to `stale` (already-stale subgraphs are skipped; chain lineage alone is not an impact edge), returning and persisting the `ImpactSnapshot`.

Non-Remote host seams, owned by the task write chain and the edit-lock service:

- `recordPhaseInputs(phaseRunId, versionIds)` — register a submission's input versions at acceptance.
- `registerVersionDependencies(versionId, dependsOn)` — complete one version's dependency edges; the executor never declares edges.
- `getVersion(versionId)` / `getImpactSnapshot(snapshotId)` — reads.
- `listConsumingPhaseRuns(targetVersionId)` — the phase runs whose registered inputs include the version; edit-lock freezes exactly these while the version is under a lease.

### Durable facts

Each write appends its journal fact before the projection put: `deliverable/save` (keyed save), `deliverable/version-saved`, `deliverable/version-staled` (one per staled revision), and `deliverable/impact-snapshotted`. Versions carry no task, so their facts use the `deliverables` sentinel task id.

## Invariant

The `./invariant` companion checks reference integrity on the authoritative change stream: phase-input registrations, dependency edges, save-index entries, chain-head entries, and impact snapshots must all name stored versions.

## Model Experience

### The deliverable domain behind the task write chain

#### What the model sees

Nothing directly. Deliverable states and snapshots reach a model only through the task write chain's `inputsCurrent`/`outputsValid` verdicts, which this package computes but does not phrase.

#### Token effect

None. Versions, edges, and snapshots travel on the storage domain, outside the model request path.

#### KV Cache effect

None. Deliverable records never enter a prompt, so no prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **Impact preview is out of M2.** `ImpactSnapshot` persists and applies to the task plane, but rewind/patch impact preview consumes it in M5 (FR-7).
- **No cross-host coordination.** The save chain serializes writes inside one host process; multi-host deliverable writers are out of scope.
