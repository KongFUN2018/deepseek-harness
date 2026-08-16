/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-workbench-host`.
 * @module @deepseek-ai/dsh-workbench-host/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-workbench-host'

/** Cordis companion plugin name. */
export const name = 'workbench-host-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this slice owns an in-memory inbox with no durable
 * package-local event stream yet; the M1 journal installs its append-only
 * contract here when persistence lands.
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
