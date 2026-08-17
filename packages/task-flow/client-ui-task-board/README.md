# client-ui-task-board — web task-flow board

English | [中文](README.zh.md)

The browser half of the task-flow workbench: one `workbench.drawer.tasks` entry filling the workbench drawer's task tab. The board is the M1 minimal surface — task rows with live state, revision, and the pause/resume/cancel verbs — over the generated `tasks` Remote and forwarded `task/updated` events.

## Surface

- Occupies `workbench.drawer.tasks` (declared by client-ui-workbench-drawer's shell.overlay entry) as its single occupant.
- Rows carry a state dot, the task id, the state word, and the compare-and-set revision; opening a row fires the seat's `openDetail(taskId)` owner callback, which switches the drawer to that task's detail tab.

## Object layer

`src/client/board.ts` is React-free: `TaskBoardController` owns a snapshot store (`TaskBoardState`) loaded through `remote.tasks.listTasks()`, folds forwarded `task/updated` deliveries revision-gated (new rows join, newer revisions replace, stale or repeated deliveries drop), and issues the verbs with each row's revision and fresh idempotency keys. A reconnect (`connection/reset`) or a failed verb resyncs from the Remote — the host projection is authoritative, never the client fold.

## Model Experience

None, as this package renders host-computed task projections for a human and touches no prompt, message, schema, stream, or tool result. The verb buttons only route task lifecycle mutations; task state never enters prompts or the session log.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- M1 scope shows the task list only; run/phase-run detail views (task-run/updated, phase-run/updated are already forwarded) wait for the task-detail package.
- Verb failures surface one transient error line; per-row pending states wait for the same follow-up.
- The list shows no phase/gate detail; that lives in the drawer's detail tab (client-ui-task-detail).
