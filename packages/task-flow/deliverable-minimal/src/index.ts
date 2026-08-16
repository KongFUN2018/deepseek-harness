/**
 * Minimal deliverable versions (`ctx.deliverables`): immutable version chains
 * per deliverable over one storageDomain unit. `saveVersion` rejects writes
 * against a base that is no longer current, `listCurrentInputs` admits only
 * current branch products of one phase run, and `invalidateDownstream` marks
 * every newer version of a root's chain stale (the full impact closure and
 * ImpactSnapshot are M2). Version records are the rebuildable projection; the
 * task write chain owns the journal commit point.
 * @module @deepseek-ai/dsh-deliverable-minimal
 */

import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { PhaseRunId, SubmissionId } from '@deepseek-ai/dsh-task/types'
import { DeliverableId, DeliverableVersionId as DeliverableVersionIdValue } from './runtime.ts'
import { deliverableDomainSpec } from './spec.ts'
import type { PhaseInputs } from './spec.ts'
import { DeliverableError } from './types.ts'
import type {
  DeliverableVersion,
  DeliverableVersionId,
  DeliverableVersionState,
  InvalidateDownstreamResult,
} from './types.ts'

export type * from './types.ts'
export { DeliverableId, DeliverableVersionId } from './runtime.ts'
export { deliverableDomainSpec, deliverableVersionSchema, phaseInputsSchema } from './spec.ts'
export type { PhaseInputs } from './spec.ts'
export { DeliverableError } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    deliverables: DeliverableService
  }
}

/** States a fresh version is created in. */
const INITIAL_STATE: DeliverableVersionState = 'current'

/**
 * Minimal deliverable version service; the M2 deliverable-local provider
 * replaces the linear scans and the non-Remote host seams behind the same
 * Remote surface.
 */
export class DeliverableService extends TypertRemoteService {
  /** The service opens its domain on the mounted storage-domain facility. */
  static inject = ['storageDomain']

  private versions?: KvTable<string, DeliverableVersion>
  private phaseInputs?: KvTable<string, PhaseInputs>
  /** Serializes read-validate-write mutations so concurrent writers never interleave. */
  private mutationTail: Promise<void> = Promise.resolve()

  /**
   * @param ctx - Host context carrying the storage-domain facility.
   */
  constructor(ctx: Context) {
    super(ctx, 'deliverables')
  }

  /** Open and own the deliverable domain. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(deliverableDomainSpec)
    this.ctx.effect(() => async () => {
      await domain.close()
    }, 'deliverable-minimal.domainClose')
    this.versions = domain.table('versions')
    this.phaseInputs = domain.table('phase_inputs')
  }

  /**
   * Create one immutable version of a deliverable. The caller names the base
   * version it built on; a base that is no longer the latest, or whose state
   * is not `current`, rejects with `stale-write`.
   * @param deliverableId - raw deliverable identifier.
   * @param expectedBaseVersion - the latest version the caller built on; `null` on a root version.
   * @param sourceSubmissionId - raw submission identifier that produced the version, when known.
   * @returns the stored immutable version.
   */
  @Remote('saveVersion')
  saveVersion(
    deliverableId: string,
    expectedBaseVersion: string | null,
    sourceSubmissionId: string | null,
  ): Promise<DeliverableVersion> {
    const deliverable = this.requireText(deliverableId, 'deliverableId')
    if (expectedBaseVersion !== null) this.requireText(expectedBaseVersion, 'expectedBaseVersion')
    if (sourceSubmissionId !== null) this.requireText(sourceSubmissionId, 'sourceSubmissionId')
    const input = {
      deliverableId: DeliverableId(deliverable),
      expectedBaseVersion: expectedBaseVersion === null ? null : DeliverableVersionIdValue(expectedBaseVersion),
      sourceSubmissionId: sourceSubmissionId === null ? undefined : sourceSubmissionId as SubmissionId,
    }
    const result = this.mutationTail.then(() => this.saveVersionNow(input))
    this.mutationTail = result.then(() => undefined, () => undefined)
    return result
  }

  /**
   * List the current input versions of one phase run: every registered input
   * whose state is `current`, in registration order. Stale, invalid,
   * superseded, and cancelled branch products are excluded.
   * @param phaseRunId - raw phase-run identifier.
   * @returns the current input versions.
   */
  @Remote('listCurrentInputs')
  listCurrentInputs(phaseRunId: string): DeliverableVersion[] {
    const runId = this.requireText(phaseRunId, 'phaseRunId') as PhaseRunId
    const inputs = this.requirePhaseInputs().get(runId)
    if (inputs === undefined) return []
    const versions = this.requireVersions()
    const current: DeliverableVersion[] = []
    for (const versionId of inputs.inputVersionIds) {
      const version = versions.get(versionId)
      if (version !== undefined && version.state === 'current') current.push(version)
    }
    return current
  }

  /**
   * Mark every version of each root's chain newer than the root stale. The
   * full transitive impact closure and ImpactSnapshot are M2.
   * @param rootVersionIds - raw version ids whose chains lose currency.
   * @returns the ids newly transitioned to stale.
   */
  @Remote('invalidateDownstream')
  invalidateDownstream(rootVersionIds: string[]): Promise<InvalidateDownstreamResult> {
    const roots: DeliverableVersionId[] = rootVersionIds.map((id) => {
      this.requireText(id, 'rootVersionId')
      return DeliverableVersionIdValue(id)
    })
    const result = this.mutationTail.then(() => this.invalidateDownstreamNow(roots))
    this.mutationTail = result.then(() => undefined, () => undefined)
    return result
  }

  /**
   * Register (or replace) the input versions of one phase run. Host-side seam:
   * the task write chain records a submission's input refs here at acceptance.
   * @param phaseRunId - raw phase-run identifier.
   * @param versionIds - raw input version ids in stable order.
   */
  async recordPhaseInputs(phaseRunId: string, versionIds: string[]): Promise<void> {
    const runId = this.requireText(phaseRunId, 'phaseRunId') as PhaseRunId
    const inputVersionIds = versionIds.map((id) => {
      this.requireText(id, 'versionId')
      return id
    })
    await this.enqueue(() => this.requirePhaseInputs().put(runId, { inputVersionIds }))
  }

  /**
   * Read one version by identity; `undefined` when absent. Host-side seam for
   * the task write chain's output-exists and source-matches checks.
   * @param versionId - raw version id.
   * @returns the stored version, or `undefined`.
   */
  getVersion(versionId: string): DeliverableVersion | undefined {
    return this.requireVersions().get(DeliverableVersionIdValue(this.requireText(versionId, 'versionId')))
  }

  /** One serialized save step; the durable put is the commit point of the version. */
  private async saveVersionNow(input: {
    deliverableId: DeliverableVersion['deliverableId']
    expectedBaseVersion: DeliverableVersionId | null
    sourceSubmissionId: SubmissionId | undefined
  }): Promise<DeliverableVersion> {
    const versions = this.requireVersions()
    const latest = this.latestVersionOf(input.deliverableId)
    if (latest === undefined) {
      if (input.expectedBaseVersion !== null) {
        throw new DeliverableError('stale-write', 'deliverable has no version yet; expectedBaseVersion must be null')
      }
    } else {
      if (latest.versionId !== input.expectedBaseVersion) {
        throw new DeliverableError('stale-write', 'expectedBaseVersion is not the latest version of the deliverable')
      }
      if (latest.state !== 'current') {
        throw new DeliverableError('stale-write', 'the base version is no longer current')
      }
    }
    const version: DeliverableVersion = {
      versionId: DeliverableVersionIdValue(randomUUID()),
      deliverableId: input.deliverableId,
      versionNumber: latest === undefined ? 1 : latest.versionNumber + 1,
      ...(latest === undefined ? {} : { baseVersionId: latest.versionId }),
      ...(input.sourceSubmissionId === undefined ? {} : { sourceSubmissionId: input.sourceSubmissionId }),
      state: INITIAL_STATE,
      entityRevision: 1,
      createdAt: Date.now(),
    }
    await versions.put(version.versionId, version)
    return version
  }

  /** One serialized invalidation step over the whole chain of each root. */
  private async invalidateDownstreamNow(roots: DeliverableVersionId[]): Promise<InvalidateDownstreamResult> {
    const versions = this.requireVersions()
    const byDeliverable = new Map<string, DeliverableVersion[]>()
    for (const version of versions.entries()) {
      const list = byDeliverable.get(version[1].deliverableId) ?? []
      list.push(version[1])
      byDeliverable.set(version[1].deliverableId, list)
    }
    const invalidated: DeliverableVersionId[] = []
    for (const rootId of roots) {
      const root = versions.get(rootId)
      if (root === undefined) {
        throw new DeliverableError('not-found', `no version with id ${JSON.stringify(rootId)}`)
      }
      // The root itself loses currency first, then every version built on it.
      const targets = [root, ...(byDeliverable.get(root.deliverableId) ?? [])
        .filter(version => version.versionNumber > root.versionNumber)
        .sort((a, b) => a.versionNumber - b.versionNumber)]
      for (const version of targets) {
        if (version.state === 'stale') continue
        const next: DeliverableVersion = { ...version, state: 'stale', entityRevision: version.entityRevision + 1 }
        await versions.put(version.versionId, next)
        invalidated.push(version.versionId)
      }
    }
    return { invalidated }
  }

  /** The latest version of one deliverable, or `undefined` when it has none. */
  private latestVersionOf(deliverableId: string): DeliverableVersion | undefined {
    let latest: DeliverableVersion | undefined
    for (const version of this.requireVersions().entries()) {
      const candidate = version[1]
      if (candidate.deliverableId === deliverableId
        && (latest === undefined || candidate.versionNumber > latest.versionNumber)) {
        latest = candidate
      }
    }
    return latest
  }

  /** Validate one non-empty wire field, returning the trimmed value. */
  private requireText(value: string, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new DeliverableError('invalid-argument', `${field} must be a non-empty string`)
    }
    return value.trim()
  }

  /** Enqueue one mutation on the service's serialized tail. */
  private enqueue(job: () => Promise<void>): Promise<void> {
    const result = this.mutationTail.then(job)
    this.mutationTail = result.then(() => undefined, () => undefined)
    return result
  }

  /** The opened versions table; absent before service start or after disposal. */
  private requireVersions(): KvTable<string, DeliverableVersion> {
    if (this.versions === undefined) {
      throw new DeliverableError('invalid-argument', 'deliverable domain is not open')
    }
    return this.versions
  }

  /** The opened phaseInputs table; absent before service start or after disposal. */
  private requirePhaseInputs(): KvTable<string, PhaseInputs> {
    if (this.phaseInputs === undefined) {
      throw new DeliverableError('invalid-argument', 'deliverable domain is not open')
    }
    return this.phaseInputs
  }
}

export default DeliverableService
