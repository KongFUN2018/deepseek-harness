# @deepseek-ai/dsh-workbench-journal

English | [中文](README.zh.md)

Task-flow append-only workbench journal (`ctx.workbenchJournal`): the durable fact source over one storageDomain unit. `append` assigns a gapless monotonic `journalSeq` and is the commit point of every task-flow entity mutation; `checkpoint` and `replay` are the authoritative recovery and client-resync path. Entity projections rebuild from the journal — Cordis events stay droppable wake-ups.

## Configuration

The service mounts with `inject = ['storageDomain']` and needs no configuration of its own: backend routing belongs to the storage-domain plugin it opens its domain on.

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
```

## Service contract

### `append(fact)`

Append one fact. The journal assigns the envelope fields (`journalSeq`, `eventId`, `occurredAt`, `schemaVersion`) and keeps the sequence gapless under concurrency. A replay of the same `idempotencyKey` with identical caller fields returns the stored fact; with different caller fields it fails with `idempotency-conflict`. Invalid caller fields fail with `invalid-fact`.

### `checkpoint()`

Return `{ journalSeq }`, the highest assigned sequence (0 on an empty journal). Recovery stores this position and replays the delta.

### `replay(afterSeq)`

Return every fact with `journalSeq > afterSeq` in journal order; `afterSeq: 0` replays the whole journal. A missing intermediate fact fails with `invalid-fact` because the sequence must stay gapless. A non-safe-integer or negative position fails with `invalid-argument`.

## Fact envelope

The frozen top-level fields apply to every fact; per-kind `payload` schemas belong to the entity packages that append each kind.

| Field | Meaning |
| --- | --- |
| `journalSeq` | Gapless monotonic position, assigned by the journal |
| `eventId` | Fact identity, assigned by the journal |
| `taskId` | Task the fact belongs to |
| `kind` | Fact kind, owned by the appending package |
| `occurredAt` | Epoch milliseconds at append |
| `actor` | Actor that caused the fact |
| `causationId?` | Event id of the fact that caused this one |
| `correlationId?` | Correlation id grouping related facts |
| `idempotencyKey` | Deduplication key, required non-empty |
| `entityRevision` | Post-commit entity revision, required positive integer |
| `payload` | Kind-owned JSON value, stored verbatim |
| `schemaVersion` | Envelope schema version (1 in M1) |

## Invariant

The `./invariant` companion registers under the package name and enforces append-only ownership on the authoritative change stream: any `domain/changed` for the journal domain that is not a `put` on `entries` (a delete, or a foreign table) fails the registration.

## Model Experience

### The durable fact source behind task-flow recovery

#### What the model sees

Nothing. `ctx.workbenchJournal` serves the task engine and recovery; no tool, prompt section, or session event exposes journal facts to a model request.

#### Token effect

None. Facts and checkpoints travel on the RPC carrier or the storage domain, outside the model request path.

#### KV Cache effect

None. Journal facts never enter a prompt, so no prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **Commit-point model, not a two-phase transaction.** `append` is one durable write; a task-flow mutation that also updates entity projections performs the projection write first and the journal append last, so the journal is the commit point and recovery rebuilds projections from `replay`. A shared multi-record write unit over one domain chain is a later storage-domain phase.
- **Linear idempotency scan.** `append` finds a prior `idempotencyKey` by scanning stored entries; M1 task counts make this acceptable, an index table is deferred.
- **Unbounded replay.** `replay` returns the complete tail; a bounded window is a deployment choice deferred to the client-facing task board.
- **No journal events.** The journal emits no Cordis events by design; entity packages emit the `task/*` wake-up family after their commit.