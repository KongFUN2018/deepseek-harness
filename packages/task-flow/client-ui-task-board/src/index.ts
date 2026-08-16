/**
 * Task board plugin, node half.
 *
 * Deliberately empty. The board renders cross-session task projections in
 * the browser; no host-side behavior belongs here (the tasks Remote and the
 * task/updated forwarding are owned by the task packages). The browser half
 * ships via exports["./client"], discovered through the package.json
 * dsh.client declaration.
 */

/** Host plugin body — the board is a pure browser surface. */
export function apply(): void {}
