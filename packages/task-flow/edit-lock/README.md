# @deepseek-ai/dsh-edit-lock

English | [中文](README.zh.md)

Task-flow edit lock (`ctx.editLock`): durable first-write-wins leases over deliverable versions. Acquisition freezes scheduling of the phase runs that consume the target version; release or expiry clears the freeze. Timeout only breaks the lease, never commits a local buffer, and a lease never exempts the version-chain base check.

## Configuration

The service mounts after the storage stack, the workbench journal, the deliverable service, and the task provider. The only tunable is the expiry sweep cadence.

```yaml
- id: deliverable-local
  name: '@deepseek-ai/dsh-deliverable-local'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: edit-lock
  name: '@deepseek-ai/dsh-edit-lock'
  config:
    sweepIntervalMs: 5000
```

`sweepIntervalMs` (default `5000`, minimum `50`) sets how often the sweep lapses expired leases; every read and acquire path also sweeps lazily.

## Service contract

- `acquire(deliverableId, targetVersionId, owner, ttlMs, taskId?)` — acquire a lease on one version (which must exist and belong to the deliverable). First write wins: a held deliverable rejects with `lock-held` carrying the current holder and expiry. Re-acquiring the same task, owner, and target returns the stored lease. The optional `taskId` ties the lease to a task so cancellation releases it. Acquisition freezes the consuming phase runs via `freezePhaseScheduling`.
- `renew(leaseId, expectedRevision, ttlMs)` — advance `renewedAt`/`expiresAt`; a stale revision or a lapsed (already-expired) lease rejects with `invalid-transition`.
- `release(leaseId, expectedRevision, actor)` — release explicitly and clear the consumer freezes; a stale revision rejects with `invalid-transition`, and releasing a terminal lease returns it unchanged.
- `listActive(taskId?)` — the active (unexpired) leases, optionally filtered to one task.

Leases of a task that enters `cancelling`/`cancelled` are released through the `task/updated` listener.

### Durable facts

Every lease transition appends its journal fact first: `edit-lock/acquired`, `edit-lock/renewed`, `edit-lock/released`, `edit-lock/expired`. Leases acquired outside a task use the `edit-lock` sentinel task id.

## Invariant

The `./invariant` companion checks lease writes on the authoritative change stream: a deliverable may hold at most one active lease, and every leased target version must exist in the deliverable-local versions table.

## Model Experience

### The edit lock behind the task board

#### What the model sees

Nothing directly. Acquiring freezes the consuming phase runs via `freezePhaseScheduling` and release clears them via `clearPhaseScheduling`, so its effect reaches a model as future phase prompts, not as text from this package. The lock indicator and countdown UI are M6.

#### Token effect

None. Leases travel on the storage domain, outside the model request path.

#### KV Cache effect

None. No prompt prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **No edit-lock UI.** The lock indicator and countdown surface ship with the M6 front end; M2 is backend-only.
- **No cross-host coordination.** The first-write-wins lease serializes writers inside one host process; multi-host editors are out of scope.
