/**
 * Workbench drawer plugin, node half.
 *
 * Deliberately empty. The drawer renders in the browser only: a floating
 * trigger and a right-side panel seating the task-flow content tabs. No
 * host-side behavior belongs here (the tasks and workbench-host Remotes are
 * owned by the task-flow host packages). The browser half ships via
 * exports["./client"], discovered through the package.json dsh.client
 * declaration.
 */

/** Host plugin body — the drawer is a pure browser surface. */
export function apply(): void {}
