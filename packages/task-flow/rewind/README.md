# @deepseek-ai/dsh-rewind

English | [中文](README.zh.md)

Task-flow rewind (`ctx.rewind`): the branch-abandonment flow of the M5 correction milestone. A rewind request computes the deliverable impact closure, persists the preview on a blocking decision item (the first `impactSnapshot` writer), and only a resolved `confirm-rewind` outcome opens the successor task run — superseding every phase run of the retired branch. Declined outcomes leave the task plane untouched: the upstream edit already staled what it staled.

## Configuration

The service mounts after the deliverable service, the task provider, the attention service, and the workbench journal, and needs no configuration of its own.

```yaml
- id: deliverable-local
  name: '@deepseek-ai/dsh-deliverable-local'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: attention
  name: '@deepseek-ai/dsh-attention'
- id: rewind
  name: '@deepseek-ai/dsh-rewind'
```

## Service contract

- `requestRewind(taskId, rootVersionIds, actor, idempotencyKey)` — compute `deliverables.invalidateDownstream(roots)`, map the closure to a preview (`snapshotId`, invalidated versions, rerun phase ids, reusable clarification ids replayed from the task's `clarification/injected` journal facts, `costHint: 'uncalibrated'`), append the `rewind/preview-requested` fact, and open one `c-decision` item (`decisionKind: 'rewind'`, options `confirm-rewind`/`keep-current`/`cancel`, the preview serialized into `impactSnapshot`). Empty roots, blank fields, or an unknown task fail loud before any write.
- `applyRewind(itemId, taskRevision, actor, idempotencyKey)` — only a resolved `confirm-rewind` item applies: create the successor run with `parentRunId` linking the retired branch, `markPhaseSuperseded` every phase run of it (each with its stored revision), and append the `rewind/applied` fact. An unresolved or foreign item fails loud (`not-resolved`/`invalid-option`); a declined outcome journals `rewind/declined` and refuses to apply.

## Invariant

The `./invariant` companion is an explained empty installer: the service holds no durable state of its own; the branch lineage it writes lands in the task projections and journal facts the task package's companion already checks.

## Model Experience

### Rewind decisions over the workbench inbox

#### What the model sees

Nothing directly. The `rewind` decision item and its `impactSnapshot` render in the workbench inbox; a model sees the successor branch only as future phase prompts after `markPhaseSuperseded` retires the old runs and the engine re-opens the affected phases.

#### Token effect

None. The service writes attention items and task projections on the storage domain, outside the model request path.

#### KV Cache effect

None. No prompt prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **No calibrated cost estimate.** `costHint` stays the literal `uncalibrated` until the M0 calibration lands; PRD §10 forbids placeholder numbers.
- **No reversal window.** `reversibleUntil` on the attention item stays unwritten; the field remains reserved for a calibrated window.
