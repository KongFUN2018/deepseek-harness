# Agent Note: Task board client plugin — remote snapshot plus revision-gated folds

Status: implemented

English | [中文](2026-08-16-client-ui-task-board-remote-folds.zh.md)

## Problem

M1 ⑦ needs the minimal browser surface for the task-flow workbench: a cross-session task list with live state and the pause/resume/cancel verbs. The M1 freeze pins the package at `packages/task-flow/client-ui-task-board` while the client stack rules live in `packages/client/AGENTS.md`, and the client API freeze restricts consumption to the `workbenchHost`/tasks Remote vocabulary plus the already-forwarded `task/updated` family — no new wire surface, no session projection channel.

## Decision

`packages/task-flow/client-ui-task-board` (`@deepseek-ai/dsh-client-ui-task-board`) is a standard client plugin package living outside `packages/client/`: same `tsconfig.base.client.json` shape, same `dsh.client` manifest and three registration surfaces (repo `tsconfig.client.json` reference, web-app `cordis.patch.yml` row, web-app `package.json` dependency), same `clientBundle` tsdown preset — the freeze owns the location, the client stack owns the rules.

The board has two layers. `src/client/board.ts` is the React-free object layer: `TaskBoardController` owns one snapshot store (`createSnapshotStore` from the runtime's sanctioned engine), boot-loads through `remote.tasks.listTasks()`, subscribes `remote.$on('task/updated', …)`, and folds deliveries revision-gated — a row updates only on a strictly newer revision, an unknown task joins, a stale or repeated delivery drops. Ordering is creation-descending with taskId as the tiebreak, so folds never reshuffle rows. Verbs (`requestPause`/`resume`/`requestCancel`) carry the row's current revision, actor `task-board`, and a fresh idempotency key per call; there is no client-side staleness fence because the Remote's compare-and-set is the guard. A `connection/reset` or a failed verb triggers `refresh()`; the host projection is authoritative and the fold is only a cache. A failed verb records its error code and the code survives a resync (it reads as history: "failed with X, since resynced") until the next successful command replaces it.

`src/client/TaskBoardAction.tsx` is the presentation half: it occupies `sidebar.footer.action` (ui-sidebar's additive list seat, so composition needs no ui-sidebar change) with id `task-board`, and receives everything through the four shares — the `wide` owner prop from the sidebar shell, the framework `t` seat, and an inject face whose `hooks.board` compartment is the controller's store (renderer-bound to `useBoard`) plus plain `refresh`/`command` callbacks. Components read no ctx and build no subscriptions.

The panel is deliberately M1-minimal: state dot, task id, state word, revision, and verb buttons per row; one transient error line; one refresh action. Run/phase-run detail waits for the task-detail package.

## Verification

- 10 controller tests over a real cordis Context with a scripted `remote` face: boot load ordering, load-failure state, revision-gated fold join/replace/drop, verb dispatch with revision + fresh idempotency keys + result fold, per-verb routing, failed-verb error persistence across resync, unknown-task no-op, connection-reset reload, and the verb-availability table per task state.
- 5 jsdom component tests feeding props directly: trigger open/close with aria state, row rendering with state word and revision, verb button wiring to the command callback, refresh wiring, and the loading/empty/failed/command-error panels.
- Package typechecks under its own project plus both aggregates; `pnpm run test:gui` covers the client lane.

## Alternatives considered

- "A workbench-client object layer" against "controller inside the plugin": the spike design's `workbench-client` package (cursor windows, incremental envelopes) is not in the M1 freeze; shipping it for one list would add a package the milestone does not own. The controller keeps the same shape (snapshot + revision-gated incremental + resync) in miniature.
- "sessionProjections channel" against "remote snapshot": task data is cross-session; projections are per-session by contract.
- "Optimistic verb state" against "resync-on-failure": optimistic rows would need per-row pending state and rollback the M1 surface does not show; the compare-and-set error path plus one refresh converges with less owned state.
- "Registering into a new sidebar seat" against "`sidebar.footer.action`": the footer action seat is the additive, unoccupied-by-default list the sidebar already declares; a new seat would force a ui-sidebar change for composition the existing seat serves.
- "Clearing the error on resync" against "keeping it until the next success": a resync-then-clear erases the failure before the user reads it; keeping the code until a successful command preserves the history the line's copy promises.

## Consequences

- The board is the first client plugin outside `packages/client/`; its registration proves the three surfaces are location-independent (the css-modules `include` needed one explicit `tsconfig.client.json` line, mirroring the ui-cordis precedent).
- `task-run/updated` and `phase-run/updated` are already forwarded but unconsumed here; the task-detail package inherits the same fold pattern.
- The controller pattern (snapshot store + revision-gated fold + reset resync) is the template the attention inbox will need; when a second consumer appears, extracting the shared fold into a small helper beats copying it.
