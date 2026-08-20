/**
 * Clarification queue plugin, node half.
 *
 * Deliberately empty. The queue renders open clarification attention items
 * read-only in the browser; no host-side behavior belongs here (the
 * workbench-host Remote and the forwarded workbench/attention-updated event
 * are owned by the host package). The browser half ships via
 * exports["./client"], discovered through the package.json dsh.client
 * declaration.
 */

/** Host plugin body — the queue is a pure browser surface. */
export function apply(): void {}
