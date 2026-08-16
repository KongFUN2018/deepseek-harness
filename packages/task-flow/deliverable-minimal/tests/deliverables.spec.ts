/** Unit suite: version-chain saves, stale-write rejection, current-input listing, downstream invalidation, and restart recovery. */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { PhaseRunId, SubmissionId } from '@deepseek-ai/dsh-task/types'
import DeliverableService, { DeliverableId } from '../src/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

/** Boot the deliverable service over a memory backend; a shared pool simulates restarts. */
async function harness(pool?: MemoryMediaPool) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(DeliverableService).await()
  return { ctx, service: ctx.deliverables }
}

let current: Context | undefined
afterEach(async () => {
  await current?.fiber.dispose()
  current = undefined
})

const D1 = DeliverableId('design-doc')
const RUN = 'run-1' as PhaseRunId
const SUB = 'sub-1' as SubmissionId

describe('saveVersion', () => {
  it('creates a root version and then chains versions under the same deliverable', async () => {
    const h = await harness()
    current = h.ctx
    const root = await h.service.saveVersion(D1, null, null)
    expect(root.versionNumber).toBe(1)
    expect(root.state).toBe('current')
    expect(root.entityRevision).toBe(1)
    expect(root.baseVersionId).toBeUndefined()
    const second = await h.service.saveVersion(D1, root.versionId, null)
    expect(second.versionNumber).toBe(2)
    expect(second.baseVersionId).toBe(root.versionId)
    expect(second.versionId).not.toBe(root.versionId)
  })

  it('rejects a base that is not the latest version', async () => {
    const h = await harness()
    current = h.ctx
    const root = await h.service.saveVersion(D1, null, null)
    await h.service.saveVersion(D1, root.versionId, null)
    await expect(h.service.saveVersion(D1, root.versionId, null))
      .rejects.toMatchObject({ name: 'DeliverableError', code: 'stale-write' })
  })

  it('rejects a root save once the deliverable already has versions', async () => {
    const h = await harness()
    current = h.ctx
    await h.service.saveVersion(D1, null, null)
    await expect(h.service.saveVersion(D1, null, null))
      .rejects.toMatchObject({ code: 'stale-write' })
  })

  it('rejects saving on a base whose state is no longer current', async () => {
    const h = await harness()
    current = h.ctx
    const root = await h.service.saveVersion(D1, null, null)
    const second = await h.service.saveVersion(D1, root.versionId, null)
    await h.service.invalidateDownstream([root.versionId])
    await expect(h.service.saveVersion(D1, second.versionId, null))
      .rejects.toMatchObject({ code: 'stale-write' })
  })

  it('records the source submission on the version', async () => {
    const h = await harness()
    current = h.ctx
    const version = await h.service.saveVersion(D1, null, SUB)
    expect(version.sourceSubmissionId).toBe(SUB)
    expect(h.service.getVersion(version.versionId)?.sourceSubmissionId).toBe(SUB)
  })

  it('rejects blank wire fields with invalid-argument', async () => {
    const h = await harness()
    current = h.ctx
    expect(() => h.service.saveVersion('  ', null, null)).toThrow(expect.objectContaining({ code: 'invalid-argument' }))
    expect(() => h.service.saveVersion(D1, ' ', null)).toThrow(expect.objectContaining({ code: 'invalid-argument' }))
    expect(() => h.service.saveVersion(D1, null, '')).toThrow(expect.objectContaining({ code: 'invalid-argument' }))
  })

  it('serializes concurrent saves: one wins, the other rejects stale-write', async () => {
    const h = await harness()
    current = h.ctx
    const root = await h.service.saveVersion(D1, null, null)
    const outcomes = await Promise.allSettled([
      h.service.saveVersion(D1, root.versionId, null),
      h.service.saveVersion(D1, root.versionId, null),
    ])
    const fulfilled = outcomes.filter(o => o.status === 'fulfilled')
    const rejected = outcomes.filter(o => o.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    const first = fulfilled[0]
    if (first?.status === 'fulfilled') expect(first.value.versionNumber).toBe(2)
  })
})

describe('listCurrentInputs and recordPhaseInputs', () => {
  it('returns only current inputs of the phase run in registration order', async () => {
    const h = await harness()
    current = h.ctx
    const v1 = await h.service.saveVersion(D1, null, null)
    const v2 = await h.service.saveVersion(D1, v1.versionId, null)
    const other = await h.service.saveVersion(DeliverableId('notes'), null, null)
    await h.service.recordPhaseInputs(RUN, [v2.versionId, other.versionId])
    expect(h.service.listCurrentInputs(RUN).map(v => v.versionNumber)).toEqual([2, 1])
  })

  it('excludes stale, invalid, superseded, and cancelled versions', async () => {
    const h = await harness()
    current = h.ctx
    const stale = await h.service.saveVersion(D1, null, null)
    const second = await h.service.saveVersion(D1, stale.versionId, null)
    await h.service.invalidateDownstream([stale.versionId])
    await h.service.recordPhaseInputs(RUN, [stale.versionId, second.versionId])
    expect(h.service.listCurrentInputs(RUN)).toEqual([])
  })

  it('returns nothing for an unregistered phase run', async () => {
    const h = await harness()
    current = h.ctx
    expect(h.service.listCurrentInputs(RUN)).toEqual([])
  })

  it('replaces the input registration on a repeated record', async () => {
    const h = await harness()
    current = h.ctx
    const v1 = await h.service.saveVersion(D1, null, null)
    await h.service.recordPhaseInputs(RUN, [v1.versionId])
    await h.service.recordPhaseInputs(RUN, [])
    expect(h.service.listCurrentInputs(RUN)).toEqual([])
  })
})

describe('invalidateDownstream', () => {
  it('marks the root and every newer version of each chain stale exactly once', async () => {
    const h = await harness()
    current = h.ctx
    const v1 = await h.service.saveVersion(D1, null, null)
    const v2 = await h.service.saveVersion(D1, v1.versionId, null)
    const v3 = await h.service.saveVersion(D1, v2.versionId, null)
    const result = await h.service.invalidateDownstream([v1.versionId])
    expect(result.invalidated.sort()).toEqual([v1.versionId, v2.versionId, v3.versionId].sort())
    expect(h.service.getVersion(v1.versionId)?.state).toBe('stale')
    expect(h.service.getVersion(v2.versionId)?.state).toBe('stale')
    expect(h.service.getVersion(v3.versionId)?.state).toBe('stale')
    expect(h.service.getVersion(v3.versionId)?.entityRevision).toBe(2)
    expect((await h.service.invalidateDownstream([v1.versionId])).invalidated).toEqual([])
  })

  it('does not mark versions of other deliverable chains', async () => {
    const h = await harness()
    current = h.ctx
    const a1 = await h.service.saveVersion(D1, null, null)
    const b1 = await h.service.saveVersion(DeliverableId('other'), null, null)
    await h.service.invalidateDownstream([a1.versionId])
    expect(h.service.getVersion(b1.versionId)?.state).toBe('current')
  })

  it('fails loud on an unknown root version', async () => {
    const h = await harness()
    current = h.ctx
    await expect(h.service.invalidateDownstream(['ghost-version'])).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('restart recovery', () => {
  it('recovers versions, phase inputs, and stale states across a restart', async () => {
    const pool = new MemoryMediaPool()
    const first = await harness(pool)
    const v1 = await first.service.saveVersion(D1, null, SUB)
    await first.service.saveVersion(D1, v1.versionId, null)
    await first.service.recordPhaseInputs(RUN, [v1.versionId])
    await first.ctx.fiber.dispose()
    const second = await harness(pool)
    current = second.ctx
    const inputs = second.service.listCurrentInputs(RUN)
    expect(inputs.map(v => v.versionNumber)).toEqual([1])
    await second.service.invalidateDownstream([v1.versionId])
    expect(second.service.listCurrentInputs(RUN)).toEqual([])
    expect(second.service.getVersion(v1.versionId)?.sourceSubmissionId).toBe(SUB)
  })
})
