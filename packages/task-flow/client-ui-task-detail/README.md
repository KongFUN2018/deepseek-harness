# client-ui-task-detail — web task-flow detail

English | [中文](README.zh.md)

The browser half of the task-flow detail surface: one `sidebar.footer.action` entry whose trigger opens an on-demand per-task detail panel. The panel reads a task projection through the generated `tasks` Remote (`getTask`), then the phase runs of its current run (`listPhaseRuns`) and the gate verdicts of each active submission (`listGateResults`).

## Surface

- Occupies `sidebar.footer.action` (declared by ui-sidebar, additive list slot) with id `task-detail`.
- The panel opens as a modal with a task-id input and a load verb; a loaded task shows its state and revision, its phase runs, and the gate verdicts with their pass/fail marks.

## Object layer

`src/client/detail.ts` is React-free: `TaskDetailController` owns a snapshot store (`TaskDetailState`) and loads on demand through the tasks Remote. A missing task lands in the `not-found` error; a failed read records the code. The host projections stay the single authority; nothing is cached across loads.

## Model Experience

None, as this package renders host-computed task projections for a human and touches no prompt, message, schema, stream, or tool result. The load verb only reads task projections; task state never enters prompts or the session log.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- The panel is a manual reader: it has no live `task/updated` fold and no cross-session list; those live under the task-board package.
- Gate verdicts render as pass/fail only; detail text and evidence references wait for a richer projection.
