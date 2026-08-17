# client-ui-task-detail — web task-flow detail

English | [中文](README.zh.md)

The browser half of the task-flow detail surface: one `workbench.drawer.detail` entry filling the workbench drawer's detail tab. The panel reads a task projection through the generated `tasks` Remote (`getTask`), then the phase runs of its current run (`listPhaseRuns`) and the gate verdicts of each active submission (`listGateResults`).

## Surface

- Occupies `workbench.drawer.detail` (declared by client-ui-workbench-drawer's shell.overlay entry) as its single occupant.
- The owner's `taskId` share drives what loads: the drawer's task tab fires `openDetail(taskId)` on row open, the detail tab reloads on change, and an undefined selection renders the empty state. A loaded task shows its state and revision, its phase runs, and the gate verdicts with their pass/fail marks.

## Object layer

`src/client/detail.ts` is React-free: `TaskDetailController` owns a snapshot store (`TaskDetailState`) and loads on demand through the tasks Remote. A missing task lands in the `not-found` error; a failed read records the code. The host projections stay the single authority; nothing is cached across loads.

## Model Experience

None, as this package renders host-computed task projections for a human and touches no prompt, message, schema, stream, or tool result. The load verb only reads task projections; task state never enters prompts or the session log.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- The tab is a driven reader: it loads only what the drawer's selection says and has no live `task/updated` fold; the cross-session list with folds lives in the drawer's task tab (client-ui-task-board).
- Gate verdicts render as pass/fail only; detail text and evidence references wait for a richer projection.
