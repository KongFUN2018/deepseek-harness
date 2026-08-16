# Agent Note: Attention incremental stream derives from the journal, not the push event

Status: implemented

English | [中文](2026-08-16-task-flow-attention-incremental-stream.zh.md)

## Problem

M4 requires a cursor-based incremental feed over the attention inbox so a resuming client can catch up without re-reading the whole snapshot. The obvious source — the `workbench/attention-updated` host event — is only broadcast by the workbench host after its own commands. Gate items (one per B/C check) and clarification items are created by those services calling `ctx.attention` directly, so an event-keyed feed would silently miss every item those producers open or settle.

## Decision

`packages/task-flow/workbench-host-stream` (`@deepseek-ai/dsh-workbench-host-stream`) derives the feed from the append-only workbench journal instead of the push event. `listIncremental(cursor?)` replays the journal facts after a sequence, keeps the ones whose kind starts with `attention/`, and projects each into `{ cursor, previousCursor, eventId, entityKind: 'attention', entityId, entityRevision, operation, payload }`. `cursor` is the journal sequence (exclusive lower bound; omitted, non-positive, or non-finite replays everything); the page returns a per-boot `streamId` epoch and the new checkpoint sequence. `operation` is narrowed from the fact kind (`created`/`resolved`/`invalidated`) with an `updated` fallback for future attention kinds. Because the journal records every attention mutation, the feed covers workbench-host commands, gate items, and clarification items alike; the live `workbench/attention-updated` event stays the push carrier only, while gate- and clarification-created items surface on the next `listIncremental` read.

## Verification

- 8 unit tests: empty journal, created/resolved/invalidated projections, cursor advancement, non-attention filtering, stable stream id, non-positive replay, and the `updated`/empty-id fallback for unknown kinds and malformed payloads.
- One real-Loader e2e creating then resolving an item and asserting the two projected events with a stable stream id.
- Per-file coverage 100% on `src`; oxlint, knip, typecheck, cordis-config, package-invariants, readme-limitations, model-experience, and translation-pairing all green.

## Alternatives considered

- **Event-keyed in-memory log** against **journal-derived feed**: an event keyed to `workbench/attention-updated` misses gate/clarification mutations and is not durable across a host restart, so it cannot satisfy the resnapshot-after-epoch contract.
- **Broadcasting from gate/clarification too** against **one authoritative source**: teaching every producer to emit `workbench/attention-updated` duplicates the journal's fact stream and risks drift; the journal is already the single append-only source every producer writes through.

## Consequences

- `streamId` is a per-boot `randomUUID`; a client holding a cursor from another boot detects the epoch change and resnapshots.
- The journal is never truncated in M4, so `listIncremental` replays from any historical cursor; a retention window with `resnapshot-required` is deferred with journal compaction.
- The feed is read plumbing only: nothing model-visible or user-visible is emitted, and no new forwarded event is added for it.
