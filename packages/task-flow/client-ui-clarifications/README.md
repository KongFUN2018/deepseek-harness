# client-ui-clarifications — web clarification queue

English | [中文](README.zh.md)

The browser half of the workbench clarification queue: one `workbench.drawer.clarifications` entry filling the workbench drawer's clarification-queue tab (线稿「澄清队列」). The queue presents a **read-only** list of open clarification attention items over the generated `workbenchHost` Remote, folding forwarded `workbench/attention-updated` deliveries and resyncing on reconnect. It issues no confirm/decide verb — clarification items are read-only, so the rows carry identity, state, and realm only.

## Surface

- Occupies `workbench.drawer.clarifications` (declared by client-ui-workbench-drawer's shell.overlay entry) as its single occupant.
- Renders exactly the items whose kind is `clarification` and whose status is `open` (the host snapshot already returns open items; the controller re-filters to be explicit). Each row shows the item's source summary (`title`, which projects `checkId ?? decisionKind`), its item id, status, and compare-and-set revision — the fields the wire view actually carries. Loading, empty, and failed panels render their copy.

## Object layer

`src/client/clarifications.ts` is React-free: `ClarificationsController` owns a snapshot store (`ClarificationsState`) loaded through `remote.workbenchHost.listSnapshot()`, filtered to open-clarification rows. Forwarded `workbench/attention-updated` deliveries fold revision-gated: a row whose status flips non-open is evicted, an id the queue does not hold triggers a resync, and a reconnect resyncs from the authoritative snapshot. The component reads only the store snapshot through the inject hooks compartment.

## Model Experience

None, as this package renders host-computed attention projections read-only for a human and touches no prompt, message, schema, stream, or tool result.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- The wire item view (`AttentionItemView`) carries no `taskId`/embedding beyond the `title` summary nor a timestamp; the row therefore shows the source summary, item id, status, and revision rather than a created/updated time.
- The queue is intentionally read-only: resolving a clarification happens through the attention-inbox's decision surface, not here.
