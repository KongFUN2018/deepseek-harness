# @deepseek-ai/dsh-workbench-host-stream

English | [中文](README.zh.md)

Attention incremental-stream host service (`ctx.workbenchHostStream`): a cursor-ordered change feed over the workbench journal's attention facts. A client reads `listSnapshot` on the workbench host, then advances by `cursor` (a journal sequence) with `listIncremental`. Each event carries the journal event id for dedupe and the post-commit entity revision for optimistic concurrency; the page carries a per-boot `streamId` epoch so a client holding a cursor from another boot can discard it and resnapshot.

## Configuration

The service has no tunables. It requires the workbench journal; a bundle lists both.

```yaml
- id: workbench-journal
  name: '@deepseek-ai/dsh-workbench-journal'
- id: workbench-host-stream
  name: '@deepseek-ai/dsh-workbench-host-stream'
```

## Service contract

- `listIncremental(cursor?)` — read the attention change events after a journal cursor and the new cursor. `cursor` is an exclusive journal lower bound; omitted, non-positive, or non-finite replays the whole stream. Returns `{ streamId, cursor, events }`.

Each event is `{ cursor, previousCursor, eventId, entityKind: 'attention', entityId, entityRevision, operation, payload }`. `operation` is narrowed from the fact kind (`created` | `resolved` | `invalidated`) with an `updated` fallback for future attention kinds. `entityId` is the item id a fact mutated. The stream derives from the append-only journal, so every attention mutation — workbench-host commands, gate items, and clarification items alike — appears in order.

## Invariant

The `./invariant` companion is empty: the stream writes no durable data of its own and projects journal facts whose integrity the workbench-journal and attention invariants already check.

## Model Experience

### The incremental change feed

#### What the model sees

Nothing from this package directly. The stream is host-plane read plumbing; the M4 attention-inbox UI consumes it to refresh open items after a `workbench/attention-updated` push event.

#### Token effect

None. Reads return wire values and never emit text.

#### KV Cache effect

None. No prompt prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **Push rides the existing event.** The stream projects facts on read; the live notification still rides the `workbench/attention-updated` host event the workbench host broadcasts after its own commands. Gate- and clarification-created items are visible on the next `listIncremental` read even though those producers do not broadcast that event.
- **No retention window.** The journal is append-only and never truncated in M4, so `listIncremental` always replays from any historical cursor; a window-and-resnapshot boundary is deferred with journal compaction.
