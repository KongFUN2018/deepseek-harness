# dsh-tool-task-create — task creation tool

English | [中文](README.zh.md)

The `task_create` model tool (entry B): each call turns an explicit create
request into a confirmation proposal — validated recipe, goal, session
inheritance choice, and an idempotency key — without creating anything. The
task is created only once the human confirms the rendered card.

## Model Experience

Indirectly, through the explicit recipe id and goal the model supplies and the proposal the confirming surface renders.

#### KV Cache effect

None; the tool never assembles or sends provider requests.

## Known Limitations and Deferred Work

- Session inheritance is proposed but not yet applied; the confirm step owns
  `createTask` plus the first-phase session seed.
- The recipe display name is the recipe id; a human-readable name waits for a
  recipe payload field.
