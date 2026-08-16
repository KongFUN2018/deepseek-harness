# Agent Note: Cross-session workbench attention channel

Status: implemented

English | [中文](2026-08-15-cross-session-workbench-attention-channel.zh.md)

## Problem

The task-flow workbench needs a process-wide attention inbox that the browser UI reads and mutates across sessions. Goal-domain Remote services resolve a session from their first `Agent` parameter, which the cross-session inbox does not need; the inbox needs plain wire reads and compare-and-set commands plus a push event so every open tab resynchronizes without polling.

## Decision

`packages/task-flow/workbench-host` (`@deepseek-ai/dsh-workbench-host`) ships a `WorkbenchHostService` bound to `ctx.workbenchHost`. It is a `TypertRemoteService` whose four `@Remote` methods take plain wire values and no session lookup, so the inbox is cross-session by construction.

- `listSnapshot()` reads the whole inbox with an inbox-wide `snapshotVersion` and per-item `entityRevision`.
- `confirmBatch()` commits every still-open revision-matching B-class item in one commit and reports each target as `resolved | conflict | stale | withdrawn | already-resolved` with `currentRevision` when the item exists. Partial commit is the contract; a failed target is retried, not rolled back. C-class items never batch.
- `resolveDecision()` and `invalidateItem()` write one C-class decision or one upstream invalidation.

Every commit bumps `snapshotVersion` once and emits `workbench/attention-updated` with the changed rows; synchronous listener failures are contained and logged so a broken observer never makes a committed inbox change look failed. The event is allowlisted in `@deepseek-ai/dsh-api-remotes` for gateway forwarding, and its payload is versioned so a client behind on one push resnapshots.

The store is in-memory and seeded from `Config.seedItems`; the M1 task engine replaces it with the durable journal behind the same Remote surface. The `./invariant` companion stays an explained empty installer until that journal lands an append-only contract. The service, event scope, and wire types render onto `docs/subsystems/workbench.md`.

## Alternatives considered

- **All-or-nothing batch confirm** against **per-item partial commit**: a batch that fails one target would otherwise roll back every sibling; per-item outcomes let a multi-select confirm commit everything that still matches and report exactly which rows to retry.
- **Catalog exemptions naming the package README** against **a subsystems page**: the projection renders the service and event regardless, so exemptions were stale; `workbench.md` is the honest single home for the wire types.
- **A durable store now** against **in-memory with M1 journaling later**: the channel slice validates the Remote surface and push event before the journal schema is frozen; shipping an unvalidated append-only contract would have locked the wrong shape.

## Consequences

Bought a real, tested cross-session channel (unit, invariant, and a keyless real-Loader smoke) with a versioned snapshot, per-item conflict ladder, and a forwarded push event. Cost: inbox state is lost on restart until the M1 journal lands, batches are first-write-wins with no server-side queue, and the push event carries change rows rather than whole snapshots, so reconnect resynchronization stays on the M1 client.
