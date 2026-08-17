# dsh-digest — task digest projection

English | [中文](README.zh.md)

The M6 journal-derived read projection of one task: run branches (rewind
handoffs), the full timeline, phase summaries, decision history, and
deliverable states. Pure read — it never writes the task plane, never opens
attention items, and never touches Gate or scheduling.

## Usage

```ts
const digest = await ctx.remote.digest.digest(taskId)
```

## Model Experience

None, as this package computes a host-side projection of durable task facts for a human to review and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- The timeline `summary` is the journal fact kind; human-readable phrasing
  is a client-locale concern.
- Run branches derive from `rewind/applied` and `task-run/updated` journal
  facts; a run that never appears in either (created before rewind support)
  surfaces only as the current run.
- The projection recomputes on every read; an incremental projection table
  waits for a measured volume threshold.
