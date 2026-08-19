/**
 * Package-owned invariant companion for @deepseek-ai/dsh-client-ui-recipe-library.
 * @module @deepseek-ai/dsh-client-ui-recipe-library/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-recipe-library'

/** Cordis companion plugin name. */
export const name = 'client-ui-recipe-library-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the library controller loads the recipe catalogue
 * through the recipes Remote and renders it in the browser; the catalogue's
 * ownership and mutation rules live in the recipe package and are proven by
 * its specs. No cross-package mutable relationship exists to assert at boot.
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
