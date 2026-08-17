/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-workbench-drawer`.
 * @module @deepseek-ai/dsh-client-ui-workbench-drawer/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-workbench-drawer'

/** Cordis companion plugin name. */
export const name = 'client-ui-workbench-drawer-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the drawer shell owns only browser-side viewing
 * state (open/tab/width) in component-local state and reads Remotes through
 * cordis disposers; no cross-package mutable relationship exists to assert
 * at boot (the seated content packages own their own companions).
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
