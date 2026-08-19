/**
 * Recipe library plugin, node half.
 *
 * Deliberately empty. The library renders processing-template cards in the
 * browser, routing a selection into the drawer's create wizard; no host-side
 * behavior belongs here (the recipe catalogue comes from the recipes Remote,
 * owned by the recipe package). The browser half ships via exports["./client"],
 * discovered through the package.json dsh.client declaration.
 */

/** Host plugin body — the library is a pure browser surface. */
export function apply(): void {}
