/**
 * RecipeLibraryController semantics over a real cordis Context with a scripted
 * recipes Remote: the boot load populates the card snapshot in registration
 * order, a failed load lands in the error state, every card field is derived
 * from the revision payload (phase/check/output counts, description), a
 * connection reset re-loads, and an empty catalogue yields an empty library.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { RecipeRevision } from '@deepseek-ai/dsh-recipe/types'
import { RecipeLibraryController } from '../src/client/recipeLibrary.ts'

/** One recipe revision fixture; `over` overrides any field. */
function recipe(over: Partial<RecipeRevision> = {}): RecipeRevision {
  return {
    recipeId: 'recipe-a' as RecipeRevision['recipeId'],
    revision: 1,
    schemaVersion: 1,
    contentHash: 'hash-a',
    registeredAt: 0,
    payload: {
      phases: [
        { phaseId: 'p0', kind: 'work', goal: '收集', inputs: ['in'], outputs: ['draft'], submissionCriteria: [] },
        { phaseId: 'p1', kind: 'work', goal: '分析', inputs: ['draft'], outputs: ['analysis'], submissionCriteria: [] },
      ],
      gateChecks: [
        { checkId: 'c0', phaseId: 'p0', kind: 'A', machineScope: [], humanAction: [] },
      ],
      defaults: { batchConfirm: 'per-phase-single', clarify: { maxRounds: 3, splitMustDefault: false }, draftPolicy: 'block-finalize-not-draft' },
      p4Mode: { mode: 'auto' },
    },
    ...over,
  }
}

/** Boot the controller over a scripted recipes Remote; records loads. */
async function bench(list: RemoteResult<RecipeRevision[]>) {
  const ctx = new Context()
  const listDetails = vi.fn(async () => list)
  ctx.reflect.provide('remote', {
    recipes: { listDetails },
    $on: () => () => {},
  })
  const controller = new RecipeLibraryController(ctx)
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  return { ctx, controller, listDetails }
}

describe('RecipeLibraryController', () => {
  it('loads the catalogue into flat cards on boot', async () => {
    const { controller } = await bench({ ok: true as const, value: [recipe()] })
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.cards).toHaveLength(1)
    expect(state.cards[0]).toMatchObject({ recipeId: 'recipe-a', phases: 2, checks: 1 })
    expect(state.updatedAt).toBeGreaterThan(0)
  })

  it('derives deliverable count from distinct phase outputs', async () => {
    const shared = recipe({ payload: {
      phases: [
        { phaseId: 'p0', kind: 'work', goal: 'g0', inputs: [], outputs: ['one', 'two'], submissionCriteria: [] },
        { phaseId: 'p1', kind: 'work', goal: 'g1', inputs: [], outputs: ['two', 'three'], submissionCriteria: [] },
      ],
      gateChecks: [],
      defaults: { batchConfirm: 'per-phase-single', clarify: { maxRounds: 3, splitMustDefault: false }, draftPolicy: 'block-finalize-not-draft' },
      p4Mode: { mode: 'auto' },
    } as RecipeRevision['payload'] })
    const { controller } = await bench({ ok: true as const, value: [shared] })
    expect(controller.store.getSnapshot().cards[0]).toMatchObject({ deliverables: 3 })
  })

  it('summarizes the leading phase goals as the description', async () => {
    const withMany = recipe({ payload: {
      phases: ['一', '二', '三', '四', '五'].map((goal, index) => ({
        phaseId: 'p' + String(index), kind: 'work', goal, inputs: [], outputs: ['o' + String(index)], submissionCriteria: [],
      })),
      gateChecks: [],
      defaults: { batchConfirm: 'per-phase-single', clarify: { maxRounds: 3, splitMustDefault: false }, draftPolicy: 'block-finalize-not-draft' },
      p4Mode: { mode: 'auto' },
    } as RecipeRevision['payload'] })
    const { controller } = await bench({ ok: true as const, value: [withMany] })
    expect(controller.store.getSnapshot().cards[0]).toMatchObject({ description: '一 · 二 · 三 · …' })
  })

  it('records the failure code when the load fails', async () => {
    const failing = { ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } }
    const { controller } = await bench(failing)
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('failed')
    expect(state.error).toBe('unavailable')
    expect(state.cards).toHaveLength(0)
  })

  it('yields an empty library for an empty catalogue', async () => {
    const { controller } = await bench({ ok: true as const, value: [] })
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.cards).toHaveLength(0)
  })

  it('reloads after a connection reset', async () => {
    const { ctx, listDetails } = await bench({ ok: true as const, value: [] })
    expect(listDetails).toHaveBeenCalledTimes(1)
    ctx.emit('connection/reset')
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(listDetails).toHaveBeenCalledTimes(2)
  })
})
