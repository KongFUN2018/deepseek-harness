# client-ui-attention-inbox — web decision inbox

English | [中文](README.zh.md)

The browser half of the workbench attention channel: one `sidebar.footer.action` entry whose trigger opens the decision-inbox panel. The inbox presents open attention items over the generated `workbenchHost` Remote, folds forwarded `workbench/attention-updated` deliveries, replays the `workbenchHostStream` delta on reconnect, and issues the batch-confirm and single-decision verbs with each row's compare-and-set revision. A non-resolved outcome (conflict, stale, withdrawn, already-resolved, or an invalid option) is never silently removed — its count surfaces and the list resyncs.

## Surface

- Occupies `sidebar.footer.action` (declared by ui-sidebar, additive list slot) with id `attention-inbox`.
- The panel opens as a modal. B-class (`b-confirm`) rows select and batch-confirm; C-class (`c-decision`) rows carry a decision input and a submit verb; clarification/recovery rows render read-only.

## Object layer

`src/client/inbox.ts` is React-free: `AttentionInboxController` owns a snapshot store (`InboxState`) loaded through `remote.workbenchHost.listSnapshot()` plus the `remote.workbenchHostStream.listIncremental(0)` epoch/cursor, folds forwarded `workbench/attention-updated` deliveries revision-gated, and issues `confirmBatch` / `resolveDecision` through the Remote. A reconnect (`connection/reset`) replays the delta from the recorded cursor and resyncs on an epoch change or pending events; a failed or conflicting command resyncs from the authoritative snapshot.

## Model Experience

None, as this package renders host-computed attention projections for a human and touches no prompt, message, schema, stream, or tool result. The confirm/decide verbs only route attention mutations; item state never enters prompts or the session log.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- The wire item view (`AttentionItemView`) carries no options, so a C-class decision is a free-text input that the host validates against `item.options`; the option list itself is not rendered. Surfacing options waits for a wire widening.
- The recorded actor is the fixed `workbench-inbox` marker; the client has no user identity to forward.
- A conflict or failure resyncs the whole list rather than patching per row; per-row optimistic folds wait for the same follow-up.
