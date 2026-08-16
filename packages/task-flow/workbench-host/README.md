# @deepseek-ai/dsh-workbench-host

English | [中文](README.zh.md)

Workbench attention-channel host service: the client-safe projection over the M4 persistent attention inbox (`ctx.attention`). Snapshot reads project open attention items into wire views; confirm, resolve, and invalidate delegate to the attention service's compare-and-set commands, so a stale, withdrawn, resolved, or version-conflicted item is never silently confirmed. The `workbench/attention-updated` event still broadcasts after a committed change, and the snapshot version is the journal checkpoint seq.

## Service contract

`ctx.workbenchHost` is a `TypertRemoteService` bound to the `workbenchHost` wire namespace. Its four `@Remote` methods take plain wire values (no session lookup), so the inbox is cross-session by construction:

- `listSnapshot()` — whole-open-inbox read with `snapshotVersion` (the journal checkpoint seq) and per-item `entityRevision`. Only open items project; resolved and invalidated items leave the inbox.
- `confirmBatch(request)` — one pass resolving every still-open revision-matching B item; each target reports `resolved | conflict | stale | withdrawn | already-resolved` with `currentRevision` when the item exists. Partial commit is the contract, not a rollback.
- `resolveDecision(request)` — single C-item write recording the decision text; the text maps to an `optionId` on the item, and a text outside the item's options raises an invalid-argument error instead of silently confirming. C items are never batched.
- `invalidateItem(request)` — upstream stale-propagation trigger; later confirms on the item report `stale`.

Every committed change emits `workbench/attention-updated` with the changed rows; listener failures are contained and logged.

## Extension points

- The `workbench/attention-updated` Cordis event (allowlisted in `@deepseek-ai/dsh-api-remotes`) is the push channel; consumers subscribe with `ctx.remote.$on('workbench/attention-updated', ...)` in Client environments.
- `ctx.attention` is the durable authority; the host service only projects and delegates, so new attention kinds or states surface here through the shared wire vocabulary.

## Model Experience

### Workbench attention inbox commands

#### What the model sees

Nothing. The `ctx.workbenchHost` Remote surface serves the browser workbench UI only; no tool, prompt section, or session event exposes the inbox to a model request.

#### Token effect

None. Commands and snapshots travel on the RPC carrier, which is outside the model request path.

#### KV Cache effect

None. The inbox never enters a prompt, so no prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- The snapshot projects open items only; a resolved decision's text is not carried in the snapshot because the item has left the inbox. The wire `decision` field remains for the M4 channel client, which tracks resolved C items through the push event instead.
- Batches are first-write-wins per item with no server-side queueing; a rejected target returns `currentRevision` for an immediate retry instead of holding a lock.
- The push event carries change rows, not whole snapshots; reconnect resynchronization (cursor windowing, `resnapshot-required`) is deferred to the M4 channel client and is not yet on the wire.
