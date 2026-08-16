# client-ui-task-board — web task-flow board

English | [中文](README.zh.md)

The browser half of the task-flow workbench: one `sidebar.footer.action` entry whose trigger opens a cross-session task panel. The board is the M1 minimal surface — task rows with live state, revision, and the pause/resume/cancel verbs — over the generated `tasks` Remote and forwarded `task/updated` events.

## Surface

- Occupies `sidebar.footer.action` (declared by ui-sidebar, additive list slot) with id `task-board`.
- The panel opens as a modal; rows carry a state dot, the task id, the state word, and the compare-and-set revision.

## Object layer

`src/client/board.ts` is React-free: `TaskBoardController` owns a snapshot store (`TaskBoardState`) loaded through `remote.tasks.listTasks()`, folds forwarded `task/updated` deliveries revision-gated (new rows join, newer revisions replace, stale or repeated deliveries drop), and issues the verbs with each row's revision and fresh idempotency keys. A reconnect (`connection/reset`) or a failed verb resyncs from the Remote — the host projection is authoritative, never the client fold.

## Model Experience

None, as this package renders host-computed task projections for a human and touches no prompt, message, schema, stream, or tool result. The verb buttons only route task lifecycle mutations; task state never enters prompts or the session log.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- M1 scope shows the task list only; run/phase-run detail views (task-run/updated, phase-run/updated are already forwarded) wait for the task-detail package.
- Verb failures surface one transient error line; per-row pending states wait for the same follow-up.
