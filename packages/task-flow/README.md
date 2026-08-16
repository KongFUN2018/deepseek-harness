# task-flow/ — cross-session task-flow workbench

English | [中文](README.zh.md)

The task-flow workbench domain: recipe-driven task execution with phased submissions, gate checks, and attention decisions. The workbench journal is the durable fact source; the workbench host service exposes cross-session Remote reads and commands to the browser UI.

| Package | Role | ctx key / surface |
|---|---|---|
| [`recipe/`](recipe/README.md) | Immutable recipe revision registry: validated payloads, content-addressed revisions, pinned-identity reads, the built-in empty template | `ctx.recipes` |
| [`task/`](task/README.md) | Task domain Service Definition: pinned-recipe task/run/phase-run projections, guarded transitions, PhaseSubmission acceptance | `ctx.tasks` |
| [`workbench-host/`](workbench-host/README.md) | Cross-session attention inbox: versioned snapshot reads, compare-and-set Remote commands, forwarded `workbench/attention-updated` push | `ctx.workbenchHost` |
| [`workbench-journal/`](workbench-journal/README.md) | Append-only fact source: monotonic durable facts, checkpoint/replay recovery, append-only invariant | `ctx.workbenchJournal` |
| [`deliverable-minimal/`](deliverable-minimal/README.md) | Immutable deliverable versions: stale-write rejection, current-input listing, downstream invalidation | `ctx.deliverables` |
| [`task-local/`](task-local/README.md) | Durable task provider: TaskHandle storage hooks over one storageDomain unit, journal-fact commit points, in-chain deliverable-ref validation | `ctx.tasks` |
| [`recipe-engine-core/`](recipe-engine-core/README.md) | Recipe engine: schedules pinned-recipe phase runs, deterministic submissions, gate-pass chain, pause/cancel quiescence, restart recovery through a contributed executor | `ctx.recipeEngine` |
| [`client-ui-task-board/`](client-ui-task-board/README.md) | Browser task board: cross-session task panel over the tasks Remote, revision-gated `task/updated` folds, pause/resume/cancel verbs | `sidebar.footer.action` |

The subsystem references — recipe and task wire types on [docs/subsystems/task-flow.md](../../docs/subsystems/task-flow.md), attention item identity, snapshot and command wire types, and the forwarded event on [docs/subsystems/workbench.md](../../docs/subsystems/workbench.md) — own the projections.
