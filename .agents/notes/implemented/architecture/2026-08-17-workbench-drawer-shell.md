# Agent Note: The workbench drawer replaces the three sidebar-foot task-flow modals

Status: implemented

English | [中文](2026-08-17-workbench-drawer-shell.zh.md)

## Problem

The task-flow workbench shipped three `sidebar.footer.action` entries (task board, attention inbox, task detail), each opening its own modal from the sidebar foot. The prototype review judged the shape wrong: three scattered triggers, mask-modal chrome that blocks the conversation, and no single place where a human sits on the workbench. The drawer-v2 prototype (single floating trigger + right-side non-modal drawer with three tabs) was accepted as the redesign; the M4 content packages' controllers had to survive the move untouched.

## Decision

- New package `client-ui-workbench-drawer` occupies `shell.overlay` (the ui-layout frame-wide floating list seat, previously unused) with one entry: a bottom-right floating pill (running indicator dot + open-attention badge) and the right-side drawer — three tabs (tasks / inbox / detail), per-tab semantic widths (600/720/800px), a left-edge drag resizing within 480–960px, Escape/close dismissal, and state kept across close/reopen (the component stays mounted while the entry lives).
- The drawer entry declares three content seats: `workbench.drawer.tasks`, `workbench.drawer.inbox`, `workbench.drawer.detail` (all `single`/`root`). The three M4 packages migrate their registrations from `sidebar.footer.action` into those seats; the seat declarations collapse with the drawer entry on teardown (HMR-safe via `slots.inject`).
- Cross-entry navigation rides owner props, the same pattern as ui-workspace's directory-flow callbacks: the tasks seat receives `openDetail(taskId)` (row open switches the drawer to that task's detail tab); the detail seat receives the owner-selected `taskId` and reloads on change (its manual task-id input is gone; undefined selection renders the empty state).
- The badge aggregates (open attention count, active task count) live in a new React-free `BadgeController` that re-reads `workbenchHost.listSnapshot` and `tasks.listTasks` on boot, on every forwarded `workbench/attention-updated` / `task/updated`, and on reconnect — projections, never local folds, so a dropped delivery costs at most one redundant snapshot read. The inbox's full controller (CAS ladder, delta replay, conflict counts) is untouched.
- Theming: every module CSS uses only `--dsw-alias-*` semantic tokens (including the `state-warn-*` spelling; the prototype's `state-warning-*` does not exist in ui-theme), zero literal colors — the drawer follows the light/dark flip and any skin plugin that redefines the token layer.
- The browser e2e `apps/web/tests/workbench-attention.e2e.ts` drives the drawer instead of the sidebar foot: it opens the drawer and switches to the inbox tab.

## Verification

- Four packages' jsdom component + browser-half suites green (drawer 15, board 11, inbox 15, detail 12 tests): tab dispatch, width semantics and drag clamping, Escape, badge rendering, HMR teardown removing the seat declarations, controller wiring.
- The workbench-attention e2e lane (drawer-driven) green under `DSH_SNAPSHOT=replay`; the conflict golden re-recorded for the drawer's aria tree.
- `test:gui`, `test:web` (replay), typecheck, lint, knip, and the verify-* battery (cordis-config, package-invariants, readme-limitations, model-experience, translation-pairing, export-jsdoc) green; config-catalog regenerated.

## Alternatives considered

- **One merged client package for all three tabs** against **a shell package plus seats**: merging would couple the inbox's data logic to the board's and the detail's, and cross-package imports between the content packages are forbidden by the client stack rules. The seat split keeps one feature = one package and reuses the existing controllers as-is.
- **A drawer-local store for open/tab/width** against **component-local state**: the drawer entry never remounts (its `shell.overlay` entry lives for the fiber), so local state survives close/reopen without a declared store; rule 5's store requirement is for state shared across entries or surviving remounts, neither of which applies.
- **The drawer reading inbox folds for the badge** against **re-reading snapshots**: the badge is a count, not an item list; folding would duplicate the inbox controller's revision logic for no user-visible gain. Re-reading costs one RPC per update at current volumes.
- **`state-warning-*` tokens from the prototype** against **the real `state-warn-*`**: ui-theme defines `warn`, not `warning`; the prototype's spelling would render no color. All module CSS uses the real aliases.

## Consequences

- `shell.overlay` now has its first occupant; future frame-wide floating surfaces (toasts, badges) register alongside by id, per its additive-list contract.
- The `sidebar.footer.action` seat is again occupied only by its shipped entries (settings-adjacent); task-flow no longer contributes to it. Any task-flow UI that needs a sidebar foot entry in the future should instead seat into the drawer.
- A content seat's owner props are the only cross-entry channel; content packages must not reach back into the drawer's state (tab, width) — navigation requests flow owner→occupant via callbacks, matching ui-workspace's directory-flow precedent.
