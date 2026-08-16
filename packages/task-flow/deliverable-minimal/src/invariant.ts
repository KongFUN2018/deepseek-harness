/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-deliverable-minimal`.
 * @module @deepseek-ai/dsh-deliverable-minimal/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantFailure, InvariantInstaller } from '@deepseek-ai/dsh-invariants'
import type { DomainChanged } from '@deepseek-ai/dsh-storage-domain'

const PACKAGE_NAME = '@deepseek-ai/dsh-deliverable-minimal'
const DOMAIN_NAME = 'deliverable_minimal'

/** Cordis companion plugin name. */
export const name = 'deliverable-minimal-invariant'
/** Services required before the companion can reserve and check package ownership. */
export const inject = ['invariants']

/**
 * Input-reference integrity: every registered phase-run input must resolve to
 * a stored version on the authoritative change stream — a registration naming
 * a version that does not exist means a caller recorded a ref without the
 * durable version behind it, breaking the acceptance chain's input checks.
 */
const install: InvariantInstaller = Object.assign((ctx: Context, fail: InvariantFailure) => {
  ctx.on('domain/changed', (change: DomainChanged) => {
    if (change.domain !== DOMAIN_NAME) return
    if (change.table !== 'phase_inputs' || change.operation !== 'put') return
    const domain = ctx.storage.form('domain').get(DOMAIN_NAME)
    if (domain === undefined) {
      return fail('phaseInputs changed while the deliverable domain is not open')
    }
    const versions = domain.table('versions')
    for (const versionId of (change.value as { inputVersionIds: string[] }).inputVersionIds) {
      if (versions.get(versionId) === undefined) {
        return fail(`phaseInputs references version '${versionId}' which is not stored`)
      }
    }
  }, { global: true })
}, { inject: ['storage'] })

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
