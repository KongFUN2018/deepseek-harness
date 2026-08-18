/** Package-owned invariant companion for @deepseek-ai/dsh-client-ui-task-create.
 *  @module @deepseek-ai/dsh-client-ui-task-create/invariant */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-task-create'

export const name = 'ui-task-create-invariant'
export const inject = ['invariants']

/** Browser-side composition panel; owns no host state, so no runtime relation to assert. */
const install: InvariantInstaller = Object.assign((_ctx: Context, _fail: InvariantFailure) => {
  void _ctx
  void _fail
}, { inject: ['storage'] })

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
