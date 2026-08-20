/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-client-ui-clarifications`.
 * @module @deepseek-ai/dsh-client-ui-clarifications/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-clarifications'

/** Cordis companion plugin name. */
export const name = 'client-ui-clarifications-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the clarification controller subscribes through
 * cordis disposers and folds forwarded attention updates against the snapshot
 * revision, both owned and proven by this package's specs; no cross-package
 * mutable relationship exists to assert at boot.
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
