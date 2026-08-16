/**
 * Attention inbox plugin, node half.
 *
 * Deliberately empty. The inbox renders open attention items and their
 * decision commands in the browser; no host-side behavior belongs here (the
 * workbench-host and workbench-host-stream Remotes and the forwarded
 * workbench/attention-updated event are owned by the host packages). The
 * browser half ships via exports["./client"], discovered through the
 * package.json dsh.client declaration.
 */

/** Host plugin body — the inbox is a pure browser surface. */
export function apply(): void {}
