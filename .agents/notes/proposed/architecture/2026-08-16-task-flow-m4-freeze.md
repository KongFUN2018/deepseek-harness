# Agent Note: Task-flow M4 freeze — persistent attention inbox and decision commands

Status: proposed

English | [中文](2026-08-16-task-flow-m4-freeze.zh.md)

## Problem

Task-flow freezes milestone contracts before packages open. M3 shipped the complex gate: a B/C check parks its phase run in `awaiting-decision`, but no package owns the decision that un-parks it. The M1 workbench host already exposes `listSnapshot` / `confirmBatch` / `resolveDecision` / `invalidateItem` over an in-memory inbox, and the M1/M3 freezes both defer the persistent inbox and `resolveDecision` to M4. Two facts collide. First, a parked run has no durable decision item, so the inbox is a process-local seed list that vanishes on restart and cannot explain a multi-tab conflict. Second, `resolveDecision` is named by the overall design (§3.4) with an `optionId` command face, but the M1 wire vocabulary uses free `decision` text — the durable command and the wire surface must be pinned together or the two drift. Opening M4 without a frozen scope re-litigates the entity schema, the command ladder, and the engine re-verification boundary per package.

## Proposal

M4 is the attention milestone: a persistent `AttentionItem` entity, decision commands with optimistic concurrency, and the workbench inbox backed by that entity. Four packages; the existing `workbench-host` is rebuilt in place, not re-shipped.

### Package freeze

- `packages/task-flow/attention` (`@deepseek-ai/dsh-attention`) ships `ctx.attention` and the `attention` domain.
- `packages/task-flow/workbench-host-stream` (`@deepseek-ai/dsh-workbench-host-stream`) ships the versioned snapshot + incremental envelope client surface.
- `packages/task-flow/client-ui-attention-inbox` (`@deepseek-ai/dsh-client-ui-attention-inbox`) ships the inbox UI.
- `packages/task-flow/client-ui-task-detail` (`@deepseek-ai/dsh-client-ui-task-detail`) ships the task-detail UI.

### AttentionItem entity

One durable item per gate check or per independent task decision, keyed by a branded `itemId`, carrying `taskId`, optional run/phase-run/submission/check references, a presentation `kind` (`b-confirm` / `c-decision` / `clarification` / `recovery`), a business `decisionKind`, `options`, an `entityRevision` for compare-and-set, and lifecycle fields. State is `open → resolved` (decision), `open → invalidated` (upstream invalidation), and `resolved → stale` (impact propagation).

### ctx.attention command surface

`createItem` (idempotent by key), `listOpen`, `getItem`, `resolveDecision(itemId, expectedEntityRevision, optionId, actor, idempotencyKey)`, `confirmBatch(targets, actor, idempotencyKey)` returning per-item `resolved` / `conflict` / `stale` / `withdrawn` / `already-resolved`, and `invalidateItem`. Every command validates open/stale/revision inside one task write chain, appends journal, updates the item, then notifies the engine. C items never enter the batch; no stale, withdrawn, resolved, or version-conflicted item is ever silently confirmed.

### Workbench host rebuild and service linkage

`workbench-host` keeps its four Remote wire types but delegates to `ctx.attention`; its M1 `decision` text maps to `optionId`. The gate service creates one item per B/C check (`options = check.humanAction`) before parking the run in `awaiting-decision`. The clarification service creates one `kind='clarification'` item per request and closes it when the required answers inject. A decision that resolves every item of a gate resumes the run through `resumePhaseFromAwaiting`; the engine closure stays untouched.

## Alternatives considered

**Keeping the inbox in-memory and adding only the UI.** Rejected: the exit criterion is multi-tab conflict explained and no silent confirmation, which needs a durable revision the inbox must survive a restart to provide.

**Folding the attention entity into workbench-host.** Rejected: the channel wire surface and the durable domain evolve independently; the overall design already splits `attention` (domain) from the workbench host API.

**A single resolve command for B and C.** Rejected: C decisions are per-item with an `optionId`; B confirmation is an optimistic batch that must return per-item results, so the two stay separate commands.

**Widening the engine closure to inject attention.** Rejected: the M1 freeze forbids it, and completion wakes the engine through the existing `resumePhaseFromAwaiting` task command and `phase-run/updated` composition.

## Acceptance criteria

- A B/C gate check creates a durable `AttentionItem`; the inbox rebuilds after restart and never depends on an in-process map.
- `resolveDecision` with a stale revision returns `conflict`/`stale`/`already-resolved` and never silently resolves; resolving every item of a gate re-runs the gate from `awaiting-decision`.
- A batch containing open, stale, and already-resolved items returns per-item outcomes and confirms only the open, revision-matching ones.
- Two tabs confirming the same item resolve it once; the loser receives a conflict and refreshes.
- A clarification request creates a `kind='clarification'` item that closes when the required answers inject.
- A real-Loader composition runs the M1/M2/M3 stack plus attention, with the earlier semantics (pause quiescence, recovery without re-running, stale propagation, clarification injection, gate evidence scope) still green.

## Risks

The M1 wire `decision` text and the durable `optionId` are two names for one value; the workbench-host delegation must be the only place they meet, or the wire and the domain drift. `impactSnapshot` and `reversibleUntil` are declared for M5 rewind but have no M4 writer, so they must stay optional and never be asserted as populated. The engine re-verification owner for a mixed B/C gate (attention resolves-and-resumes versus the engine re-checks) is left to the package opening; the semantics — B may confirm first, the gate passes only when every B and C item resolves — are frozen and must not be weakened.
