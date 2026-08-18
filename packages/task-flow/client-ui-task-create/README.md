# client-ui-task-create — task-creation wizard

English | [中文](README.zh.md)

The task-creation wizard (entry A): a three-column panel filling the drawer's
create tab — recipe picker, linked phase preview, and goal/config. It creates
through the tasks Remote with a fresh idempotency key and opens the detail tab.

## Model Experience

None, as this package renders a human-facing wizard and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- The workspace selector is a read-only default; multi-workspace pickers are future work.
- The goal text is not persisted on the task record; it seeds the first phase on a later confirm step.
