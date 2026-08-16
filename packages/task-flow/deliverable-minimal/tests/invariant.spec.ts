/** Invariant companion suite: the phase-input reference check fires on a dangling registration and stays quiet on valid ones. */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry, { InvariantError } from '@deepseek-ai/dsh-invariants'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import DeliverableService from '../src/index.ts'
import * as DeliverableInvariant from '../src/invariant.ts'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

/** Boot the deliverable service with its invariant companion mounted. */
async function harness() {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(InvariantRegistry)
  await ctx.plugin(DeliverableInvariant)
  await ctx.plugin(DeliverableService).await()
  return { ctx, service: ctx.deliverables }
}

let current: Context | undefined
afterEach(async () => {
  await current?.fiber.dispose()
  current = undefined
})

describe('deliverable-minimal invariant', () => {
  it('registers under the package name and allows valid input registrations', async () => {
    const h = await harness()
    current = h.ctx
    const root = await h.service.saveVersion('design-doc', null, null)
    await h.service.recordPhaseInputs('run-1', [root.versionId])
    expect(h.service.listCurrentInputs('run-1')).toHaveLength(1)
  })

  it('fails when a phase_inputs put references a version that is not stored', async () => {
    const h = await harness()
    current = h.ctx
    expect(() => { h.ctx.emit('domain/changed', {
      domain: 'deliverable_minimal',
      table: 'phase_inputs',
      key: 'run-1',
      operation: 'put',
      value: { inputVersionIds: ['ghost-version'] },
    }) }).toThrow(InvariantError)
  })

  it('stays quiet for version puts, other tables, and other domains', async () => {
    const h = await harness()
    current = h.ctx
    expect(() => { h.ctx.emit('domain/changed', { domain: 'deliverable_minimal', table: 'versions', key: 'v', operation: 'put', value: {} }) })
      .not.toThrow()
    expect(() => { h.ctx.emit('domain/changed', { domain: 'deliverable_minimal', table: 'phase_inputs', key: 'r', operation: 'deleted' }) })
      .not.toThrow()
    expect(() => { h.ctx.emit('domain/changed', { domain: 'other', table: 'x', key: 'y', operation: 'put', value: null }) })
      .not.toThrow()
  })
})
