# Agent Note: Gate/clarification — attention-item linkage and the gate-running microtask starvation hang

Status: implemented

English | [中文](2026-08-16-task-flow-attention-item-linkage.zh.md)

## Problem

M4 links the attention inbox to the two complex-decision producers. Gate must create one `AttentionItem` per B/C check before parking the run in `awaiting-decision`; clarification must create one `kind='clarification'` item per request and settle it once every required question is answered. The first naive gate implementation awaited each `createItem` before `markPhaseAwaitingDecision`, and its real-Loader e2e hung on Windows: the process never exited within the loader-smoke timeout.

The hang is not a filesystem race. Instrumentation showed `writeAtomic`'s `open`/`rename` never settling, but isolated concurrent-write reproductions completed, a global write-serialization lock only moved the stall from `rename` to `open`, and `UV_THREADPOOL_SIZE=16` changed nothing. The cause is microtask starvation: awaiting item creation delays the `markPhaseAwaitingDecision` write into the task command queue behind the engine's re-verification `recordGateCheck`. Once that re-verification returns, the engine re-reads the still-`gate-running` run and re-enters `runGate`, which for an already-recorded A check awaits only resolved promises — a pure-microtask spin that never yields to the poll phase, so the JSON backend's filesystem callbacks never run and the parked run never advances.

## Decision

`packages/task-flow/gate` now issues every command synchronously instead of awaiting item creation first. For a `gate-running` run with B/C checks it maps all `ctx.attention.createItem` calls (one per check, `kind='b-confirm'`/`'c-decision'`, `decisionKind='gate'`, `checkId`, `options=check.humanAction`, `itemId=gate:<phaseRunId>:<checkId>`) and then issues `ctx.tasks.markPhaseAwaitingDecision`, awaiting them together with `Promise.all`. Item creation still starts first (the frozen design order), but the transition is enqueued into the task command queue in the same synchronous turn, so it lands ahead of the engine's `recordGateCheck` and the run leaves `gate-running` before the engine can spin on it.

`packages/task-flow/clarification` creates the linked item inside `createRequestNow` (the request's own write chain) with `itemId=clarification:<requestId>`, `phaseRunId`, `options=['satisfied']` — a system-resolved option, not a user decision. `injectIfComplete` resolves that item with `optionId='satisfied'` via `resolveDecision` before `resumePhaseFromAwaiting`. Both services gained the `attention` injection; both cordis.yml fixtures mount `attention` ahead of them.

## Verification

- Gate: 4 unit tests (now asserting one open item per B/C check with the expected `itemId`/`kind`/`decisionKind`/`checkId`/`options`) and one real-Loader e2e that parks a B-check run and proves the item exists.
- Clarification: 22 unit tests plus 6 invariant tests, with the injection test asserting the item is `resolved`/`outcome='satisfied'`, and one real-Loader e2e asserting the same through the projected `itemState`/`itemOutcome`.
- Full task-flow e2e 12/12; tsc/lint/knip/invariants/limitations/translation-pairing/cordis-config all green.

## Alternatives considered

- **Global write serialization in storage-json** against **fixing the caller ordering**: a per-process write tail only relocated the stall from `rename` to `open` — the event loop was starved, not the writes racing — and it would serialize unrelated units for a problem the caller owns.
- **Reordering to mark-then-create** against **synchronous issuance**: marking before creating would satisfy the enqueue constraint but reverse the frozen `createItem → markPhaseAwaitingDecision` order and leave a window where the run is parked with no item yet.
- **Yielding the engine's re-verification loop** against **leaving the engine closure untouched**: adding an IO await to the engine's already-recorded re-verification would mask the ordering bug and widen a frozen M1 closure for a caller-owned race.

## Consequences

- Gate's `maybeAwaitDecision` keeps a `try/catch` that swallows concurrent-transition and unregistered-recipe errors; a B/C check with an empty `humanAction` now surfaces as an attention `invalid-argument` and leaves the run parked, still loud enough to notice rather than silently confirmed.
- The clarification item carries the single internal option `satisfied`; workbench-host's `title` projection renders it as `item.checkId ?? item.decisionKind` (here `clarification`).
- Deferred: clarification-item invalidation on task cancel stays with the M5 cancel path, which already archives open attention items.
