/** Package-owned invariant companion for @deepseek-ai/dsh-client-ui-task-create-confirm.
 *  @module @deepseek-ai/dsh-client-ui-task-create-confirm/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-task-create-confirm'

export const name = 'ui-task-create-confirm-invariant'
export const inject = ['invariants']

/** Browser-side confirm card; owns no host state, so no runtime relation to assert. */
const install: InvariantInstaller = Object.assign((_ctx: Context, _fail: InvariantFailure) => {
  void _ctx
  void _fail
}, { inject: ['storage'] })

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
