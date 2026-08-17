# client-ui-workbench-drawer — web task-flow workbench drawer

English | [中文](README.zh.md)

The browser half of the task-flow workbench: one `shell.overlay` entry that renders the floating trigger and the right-side three-tab drawer, and declares the three content seats (`workbench.drawer.tasks` / `.inbox` / `.detail`) the task-flow content packages register into. Replaces the earlier three scattered sidebar-foot modals with a single non-modal operating console — no mask, the conversation stays visible and interactive.

## Surface

- Occupies `shell.overlay` (declared by ui-layout, additive frame-wide floating list) with id `workbench-drawer`.
- The trigger is a floating pill at the bottom-right: a running indicator dot (pulsing while any task is in an active state) plus a badge with the count of open attention items.
- The drawer opens from the right with three tabs — tasks / inbox / detail — each dispatching its declared seat through the render share. Per-tab semantic widths (600/720/800px); a left-edge drag resizes within 480–960px, and switching tabs returns to the semantic width.
- Non-modal: Escape or the close control dismisses; the component stays mounted while the entry lives, so reopening keeps the selected tab and the user width.
- The task-list seat receives an `openDetail(taskId)` owner callback that switches the drawer to the detail tab; the detail seat receives the selected `taskId`.

## Object layer

`src/client/badge.ts` is React-free: `BadgeController` owns a snapshot store (`BadgeState`) with the two trigger aggregates — the open-attention count and the active-task count. Both are re-read from the authoritative Remotes (`workbenchHost.listSnapshot`, `tasks.listTasks`) on boot, on every forwarded `workbench/attention-updated` / `task/updated` delivery, and on reconnect; the counts are projections, never folded locally, so a dropped delivery costs at most one redundant snapshot read.

## Theming

All colors ride the semantic `--dsw-alias-*` tokens (bg-layer / border-l* / label-* / state-* / interactive-bg-* / button-floating-*): the drawer follows the light/dark theme flip, and a skin plugin that redefines the token layer restyles the drawer without any cooperation from this package.

## Model Experience

None, as this package renders trigger aggregates and seating chrome for a human and touches no prompt, message, schema, stream, or tool result. The drawer issues no task mutations.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- Tab widths and bounds are fixed constants; persisted per-user width preferences wait for a settings-scope decision.
- The badge refreshes whole snapshots per forwarded update rather than folding deltas; acceptable at current item counts, revisit if attention volume grows.
