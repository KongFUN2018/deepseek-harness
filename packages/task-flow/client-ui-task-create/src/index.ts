/**
 * Task-creation wizard plugin, node half.
 *
 * Deliberately empty. The wizard renders the three-column new-task panel in
 * the browser; task creation itself routes through the tasks Remote. The
 * browser half ships via exports["/client"], discovered through the
 * package.json dsh.client declaration.
 */

/** Host plugin body — the wizard is a pure browser surface. */
export function apply(): void {}
