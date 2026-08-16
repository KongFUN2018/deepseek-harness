/**
 * Task detail plugin, node half.
 *
 * Deliberately empty. The detail panel reads per-task projections on demand
 * in the browser; no host-side behavior belongs here (the tasks Remote is
 * owned by the task package). The browser half ships via exports["./client"],
 * discovered through the package.json dsh.client declaration.
 */

/** Host plugin body — the detail panel is a pure browser surface. */
export function apply(): void {}
