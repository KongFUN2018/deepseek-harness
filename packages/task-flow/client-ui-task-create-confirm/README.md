# client-ui-task-create-confirm — task-creation confirmation card

English | [中文](README.zh.md)

The keyed `tool.call.toolview` renderer for the `task_create` tool (entry B
client half): it shows the proposal (recipe, phase/check counts, goal), the
session-inheritance toggle, and confirm/cancel. Confirm issues createTask
through the tasks Remote and flips the card to the created state.

## Model Experience

None, as this package renders a human-facing confirmation card and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- The session seed is not yet written on confirm; the inherit toggle is shown
  and recorded in the proposal, but the first-phase session seed waits for a
  host command.
- Cancel is a visual no-op; the card stays dismissable without any state change.
