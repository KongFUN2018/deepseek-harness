# Agent Note: Workbench journal — the append-only fact source behind task-flow recovery

Status: implemented

English | [中文](2026-08-15-workbench-journal-append-only-fact-source.zh.md)

## Problem

Task-flow needs a durable, authoritative record of every task-domain mutation so that entity projections can rebuild after a crash and clients can resynchronize. Cordis events are droppable wake-ups; a recovery path that trusts them cannot guarantee a consistent view.

## Decision

`packages/task-flow/workbench-journal` (`@deepseek-ai/dsh-workbench-journal`) ships `WorkbenchJournalService` bound to `ctx.workbenchJournal`. It is a `TypertRemoteService` with three frozen `@Remote` methods:

- `append(fact)` assigns the gapless monotonic `journalSeq`, `eventId`, `occurredAt`, and `schemaVersion`; the durable write is the commit point of the recorded mutation.
- `checkpoint()` returns the highest assigned `journalSeq` (0 when empty).
- `replay(afterSeq)` returns every fact after one position in journal order; a missing intermediate fact fails loud because the sequence must stay gapless.

The service opens one storageDomain unit named `workbench_journal` with a single `entries` table keyed by zero-padded `journalSeq`, so lexical order equals numeric order. The head sequence derives from the stored keys at open — no separate durable counter can drift from the facts it counts, and a crash between allocation and write leaves nothing behind.

Idempotency is the journal's own contract: a replay of the same `idempotencyKey` with identical caller fields returns the stored fact; with different fields it fails with `idempotency-conflict`. Appends serialize on an in-service tail so concurrent writers never interleave.

The frozen fact envelope is `journalSeq / eventId / taskId / kind / occurredAt / actor / causationId? / correlationId? / idempotencyKey / entityRevision / payload / schemaVersion`; per-kind `payload` schemas belong to the entity packages that append each kind. The journal emits no Cordis events by design — entity packages emit the `task/*` wake-up family after their commit.

The `./invariant` companion enforces append-only ownership on the authoritative change stream: any `domain/changed` for the journal domain that is not a `put` on `entries` fails the registration.

## Commit-point model

The journal append is one durable write, not a two-phase transaction. A task-flow mutation that also updates entity projections performs the projection write first and the journal append last; recovery rebuilds projections from `replay`, so a crash between the two writes leaves an unjustified projection row that replay discards. This realizes the M1 constraint that journal append and entity projections share the storage-domain durability without a multi-record write unit, which is a later storage-domain phase.

## Alternatives considered

- **A durable head counter** against **deriving head from stored keys**: a stored `head` could drift from the entries it names; deriving it at open from the table is self-consistent and removes one write from the commit path.
- **A two-phase multi-record transaction** against **journal-as-commit-point**: the storage-domain write chain serializes per domain but has no multi-record unit in M1; making the journal the commit point keeps appends a single durable write and gives recovery an authoritative rebuild source.

## Consequences

- Task-flow recovery and client resync now have one authoritative rebuild source; entity packages must append a fact for every committed mutation and treat `append` as the commit point.
- `replay` is O(tail) and `append` scans stored entries for idempotency — both acceptable at M1 task counts, with an index table and bounded replay windows deferred.
- The journal opens one domain on the storage-domain facility; a deployment without that facility cannot load the service (its `inject` requires it).
- M1 acceptance's startup-recovery scenario exercises checkpoint + replay through the real Loader, so the mechanism is verified where the design promised it.

## Required verification

- Unit suite covers gapless monotonic sequence, idempotent replay, idempotency conflict, concurrent appends, sequence recovery across a medium restart, and replay-after-checkpoint deltas (14 tests).
- The invariant suite drives the change stream directly: a delete or a foreign table on the journal domain fails; other domains and entry puts stay quiet (4 tests).
- The keyless real-Loader e2e boots the full storage stack through `cordis.yml`, appends, replays idempotently, disposes the whole app, reboots on the same medium, and observes recovery through checkpoint and replay — in both src and lib modes.
