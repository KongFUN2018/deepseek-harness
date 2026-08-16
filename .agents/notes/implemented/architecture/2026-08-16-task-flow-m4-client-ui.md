# Agent Note: M4 client surfaces: attention inbox and task detail over the Remote vocabulary

Status: implemented

English | [中文](2026-08-16-task-flow-m4-client-ui.zh.md)

## Problem

M4 adds two browser surfaces to the workbench attention channel: `ui-attention-inbox` presents open decision items and issues the confirm/decide verbs, and `ui-task-detail` reads per-task projections on demand. Both must consume only the frozen client vocabulary — `ctx.remote.workbenchHost`, `ctx.remote.workbenchHostStream`, the forwarded `workbench/attention-updated` event, and `ctx.remote.tasks` — without importing the attention/gate domain packages or reading raw frames.

## Decision

- `ui-attention-inbox` is a React-free controller (`inbox.ts`) plus a `sidebar.footer.action` entry. The controller loads `workbenchHost.listSnapshot()` and the `workbenchHostStream.listIncremental(0)` epoch/cursor, folds `workbench/attention-updated` revision-gated, replays the delta on `connection/reset` (epoch change or pending events force a snapshot resync), and issues `confirmBatch`/`resolveDecision` with each row's CAS revision.
- A non-resolved command outcome — `conflict`, `stale`, `withdrawn`, `already-resolved`, or an `invalid-argument` from a bad option — is never silently removed: its count lands in `conflictCount` (error code `conflict:<n>`) and the list resyncs from the authoritative snapshot. This is the exit-criterion proof of "多标签页冲突可解释、无静默确认".
- The wire `AttentionItemView` carries no `options`, so a C-class decision is a free-text input the host validates against `item.options`; the option list itself is not rendered (recorded as a README limitation).
- `ui-task-detail` is a manual reader: `getTask` then `listPhaseRuns` of the current run and `listGateResults` of each active submission; no live fold, no cross-session list (those stay in `ui-task-board`).

## Verification

- Both packages sit inside the per-file 100% coverage gate: 21 + 20 inbox specs and 7 + 17 detail specs (controller + component) exercise every fold branch, every command outcome, every status/kind label, and the inject-face callbacks.
- `pnpm run build:lib:client` (tsc + tsdown) passes; the two-package `vitest` scope passes; oxlint, knip, cordis-config, package-invariants, readme-limitations, model-experience, translation-pairing, and export-jsdoc are green.

## Alternatives considered

- **Rendering the option list per C row** against **free-text decision**: the frozen wire view has no `options` field, so surfacing options would need a wire widening before any client render; the host still validates the free text against `item.options`, so a bad option fails loudly instead of silently.
- **Optimistic per-row patches after a conflict** against **full resync**: the journal-backed snapshot is the single authority, so a resync is the cheapest correct reconciliation and never risks a client-side patch drifting from the host projection.

## Consequences

- Both packages register in `tsconfig.client.json`, the web-app bundle (`cordis.patch.yml` + `package.json`), and the api-remotes client face (`workbenchHostStream` mounts for the delta read).
- The actor recorded by inbox commands is the fixed `workbench-inbox` marker until the client grows a user identity.
- The inbox controller reuses the task-board fold pattern (snapshot store + revision-gated fold + reset resync) that [`client-ui-task-board-remote-folds`](2026-08-16-client-ui-task-board-remote-folds.md) established; extracting the shared fold into a helper stays deferred until a third consumer appears.
