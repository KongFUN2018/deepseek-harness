# @deepseek-ai/dsh-workbench-host

English | [中文](README.zh.md)

Workbench attention-channel host service: an in-memory versioned attention inbox validating the host-client channel slice — snapshot reads, compare-and-set Remote commands, and the forwarded `workbench/attention-updated` push event — before the M1 task engine lands its durable journal.

## Config

- `seedItems` (default `[]`): attention items present at boot; ids must be unique, kinds are `b-confirm` or `c-decision`, and titles must be non-empty.

## Service contract

`ctx.workbenchHost` is a `TypertRemoteService` bound to the `workbenchHost` wire namespace. Its four `@Remote` methods take plain wire values (no session lookup), so the inbox is cross-session by construction:

- `listSnapshot()` — whole-inbox read with `snapshotVersion` and per-item `entityRevision`.
- `confirmBatch(request)` — one commit resolving every still-open revision-matching B item; each target reports `resolved | conflict | stale | withdrawn | already-resolved` with `currentRevision` when the item exists. Partial commit is the contract, not a rollback.
- `resolveDecision(request)` — single C-item write recording the decision text; C items are never batched.
- `invalidateItem(request)` — upstream stale-propagation trigger; later confirms on the item report `stale`.

Every committed command bumps `snapshotVersion` once and emits `workbench/attention-updated` with the changed rows; listener failures are contained and logged.

## Extension points

- The `workbench/attention-updated` Cordis event (allowlisted in `@deepseek-ai/dsh-api-remotes`) is the push channel; consumers subscribe with `ctx.remote.$on('workbench/attention-updated', …)` in Client environments.
- The M1 task engine replaces the in-memory store with the durable journal behind the same Remote surface.

## Model Experience

### Workbench attention inbox commands

#### What the model sees

Nothing. The `ctx.workbenchHost` Remote surface serves the browser workbench UI only; no tool, prompt section, or session event exposes the inbox to a model request.

#### Token effect

None. Commands and snapshots travel on the RPC carrier, which is outside the model request path.

#### KV Cache effect

None. The inbox never enters a prompt, so no prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- The store is in-memory and seeded from config; restart discards state. The M1 journal becomes the authoritative store and installs the append-only invariant currently parked in `src/invariant.ts`.
- Batches are first-write-wins per item with no server-side queueing; a rejected target returns `currentRevision` for an immediate retry instead of holding a lock.
- The push event carries change rows, not whole snapshots; reconnect resynchronization (cursor windowing, `resnapshot-required`) is deferred to the M1 channel client and is not yet on the wire.
