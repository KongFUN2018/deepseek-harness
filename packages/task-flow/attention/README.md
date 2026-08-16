# @deepseek-ai/dsh-attention

English | [中文](README.zh.md)

Persistent attention inbox (`ctx.attention`): one durable `AttentionItem` per gate check or independent task decision. Every command is optimistic — it carries an `expectedEntityRevision` and returns a per-item outcome — so a stale, withdrawn, resolved, or version-conflicted item is never silently confirmed. A settled item writes its journal fact first, then the projection, then resumes the phase run once every item of its gate settled.

## Configuration

The service has no tunables. It requires the storage domain, the workbench journal, and the task service; a bundle lists them plus this package.

```yaml
- id: storage-domain
  name: '@deepseek-ai/dsh-storage-domain'
- id: workbench-journal
  name: '@deepseek-ai/dsh-workbench-journal'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: attention
  name: '@deepseek-ai/dsh-attention'
```

## Service contract

- `createItem(input, actor, idempotencyKey)` — create one item. `input` is `{ itemId, taskId, runId?, phaseRunId?, submissionId?, checkId?, kind, decisionKind, options }`; `itemId` is caller-supplied and stable, `options` is non-empty. Replaying a caller key returns the stored item; a different `itemId` fails with `conflict`.
- `resolveDecision(itemId, expectedEntityRevision, optionId, actor, idempotencyKey)` — decide one item. `optionId` must be in the item's `options` (else `invalid-argument`); a mismatched revision returns `conflict`, a missing item `withdrawn`, a settled item `resolved` (same option) or `already-resolved` (different option), and an invalidated item `stale`.
- `confirmBatch(targets, actor, idempotencyKey)` — confirm B-class items in one pass; every still-open revision-matching target resolves and each reports its own outcome. C-class items are never batched.
- `invalidateItem(itemId, expectedEntityRevision, reason, actor, idempotencyKey)` — invalidate one open item upstream so later decisions report `stale`.
- `getItem(itemId)` / `listOpen()` — read one item, or every open item in open order.

Entities live in the `attention` domain (`version: 1`): the `items` table keyed by `AttentionItemId`, and the `item_keys` create-idempotency index. `AttentionItem` records `itemId`, `taskId`, optional `runId`/`phaseRunId`/`submissionId`/`checkId`, `kind` (`b-confirm` | `c-decision` | `clarification` | `recovery`), `decisionKind`, optional `impactSnapshot`, `options`, `state` (`open`/`resolved`/`invalidated`/`stale`), `entityRevision`, `openedAt`, and optional `resolvedAt`/`resolvedBy`/`outcome`/`reversibleUntil`.

## Decision semantics

`optionId` is the durable command field. The workbench-host delegates its wire `decision` text to `optionId` at that boundary; attention itself stores and validates `optionId` only. `impactSnapshot` and `reversibleUntil` are optional and no M4 writer populates them. Resolving a run parks until every item naming its phase run settled; `resumeIfAllSettled` then resumes it out of `awaiting-decision`. A still-open item keeps the run parked.

## Invariant

The `./invariant` companion checks reference integrity on the `domain/changed` stream: an item-key entry must name a stored item.

## Model Experience

### The decision round behind the phase chain

#### What the model sees

Nothing from this package directly. The inbox is durable state; the decision round and its prompts belong to the M4 attention-inbox UI package, which presents open items as tool results and maps a chosen decision text to an `optionId`.

#### Token effect

None. Commands write durable items and state transitions and never emit text.

#### KV Cache effect

None. No prompt prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **No decision presentation.** Rendering open items for a model and mapping a chosen decision text to an `optionId` ships in the M4 `ui-attention-inbox` package.
- **Batching is B-only.** `confirmBatch` batches B-class items; C-class decisions are always one command each.
- **Optional fields stay empty in M4.** `impactSnapshot` (rewind impact preview) and `reversibleUntil` (reversal deadline) have no M4 writer.
