/**
 * ClarificationsController semantics over a real cordis Context with a
 * scripted workbenchHost Remote: the boot load pulls the full attention
 * snapshot and keeps only open clarification rows, a failed load lands in the
 * error state, folds are revision- and version-gated (a row that flips
 * non-open is evicted, a newly appearing id resyncs), and a connection reset
 * resyncs from the authoritative snapshot.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { AttentionItemView, WorkbenchSnapshot } from '@deepseek-ai/dsh-workbench-host/types'
import { ClarificationsController, openClarification } from '../src/client/clarifications.ts'

/** Projection item id of one fixture row. */
type ItemId = AttentionItemView['itemId']

/** Fixture override shape; `itemId` is a plain string cast to the branded id. */
type ItemOver = Partial<Omit<AttentionItemView, 'itemId'>> & { itemId?: string }

/** One attention-item fixture; `over` overrides any field. */
function item(over: ItemOver = {}): AttentionItemView {
  const { itemId: rawId, ...rest } = over
  const id = (rawId ?? `i-${Math.random().toString(36).slice(2)}`) as ItemId
  return {
    itemId: id,
    kind: 'clarification',
    status: 'open',
    entityRevision: 1,
    title: `clarify-${id}`,
    ...rest,
  }
}

type Listener = (...args: unknown[]) => void

/** Boot the controller over a scripted remote; the snapshot reads a live array. */
async function bench(script: {
  snapshot?: RemoteResult<WorkbenchSnapshot>
  failInitial?: boolean
  /** Keep the boot load pending forever; deliveries land while state is still loading. */
  ghostSnapshot?: boolean
} = {}, _settle = true) {
  const ctx = new Context()
  // The live array the loader reads; `setItems` swaps it so later loads see new rows.
  const live: AttentionItemView[] = []
  const defaultSnap: RemoteResult<WorkbenchSnapshot> = { ok: true, value: { snapshotVersion: 0, items: live } }
  const snap = script.failInitial ? { ok: false as const, error: { code: 'unavailable' as const, message: 'x', details: {} } } : script.snapshot ?? defaultSnap
  const loads = vi.fn()
  const listeners = new Map<string, Listener>()
  ctx.reflect.provide('remote', {
    workbenchHost: {
      listSnapshot: script.ghostSnapshot === true
        ? () => new Promise<RemoteResult<WorkbenchSnapshot>>(() => {}) // never settles
        : async () => { loads(); return snap },
    },
    $on: (event: string, listener: Listener) => {
      listeners.set(event, listener)
      return () => { listeners.delete(event) }
    },
  })
  const controller = new ClarificationsController(ctx)
  if (_settle) await new Promise((resolve) => { setTimeout(resolve, 0) })
  return {
    ctx,
    controller,
    loads,
    setItems: (next: AttentionItemView[]) => { live.splice(0, live.length, ...next) },
    deliver: (update: { snapshotVersion: number; changed: { itemId: string; status: AttentionItemView['status']; entityRevision: number }[] }) => {
      listeners.get('workbench/attention-updated')?.(update)
    },
  }
}

describe('ClarificationsController', () => {
  it('loads the snapshot and keeps only open clarification rows on boot', async () => {
    const open = item({ itemId: 'i-open' })
    const closed = item({ itemId: 'i-resolved', status: 'resolved' })
    const other = item({ itemId: 'i-b', kind: 'b-confirm' })
    const stale = item({ itemId: 'i-stale', status: 'stale' })
    const { controller, loads } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 3, items: [open, closed, other, stale] } },
    })
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.items).toEqual([open])
    expect(state.snapshotVersion).toBe(3)
    expect(loads).toHaveBeenCalledTimes(1)
  })

  it('classifies only open clarification kinds as queue rows', () => {
    expect(openClarification(item({ kind: 'clarification', status: 'open' }))).toBe(true)
    expect(openClarification(item({ kind: 'clarification', status: 'resolved' }))).toBe(false)
    expect(openClarification(item({ kind: 'clarification', status: 'stale' }))).toBe(false)
    expect(openClarification(item({ kind: 'b-confirm' }))).toBe(false)
    expect(openClarification(item({ kind: 'c-decision' }))).toBe(false)
    expect(openClarification(item({ kind: 'recovery' }))).toBe(false)
  })

  it('records the failure code when the snapshot load fails', async () => {
    const { controller } = await bench({ failInitial: true })
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('failed')
    expect(state.error).toBe('unavailable')
  })

  it('folds newer revisions and evicts a row that flips non-open', async () => {
    const row = item({ itemId: 'i-r', entityRevision: 2 })
    const { controller, deliver } = await bench({ snapshot: { ok: true, value: { snapshotVersion: 2, items: [row] } } })
    deliver({ snapshotVersion: 3, changed: [{ itemId: 'i-r', status: 'resolved', entityRevision: 3 }] })
    expect(controller.store.getSnapshot().items).toEqual([])
  })

  it('keeps an open clarification with a newer revision from a delivery', async () => {
    const row = item({ itemId: 'i-r', entityRevision: 2 })
    const { controller, deliver } = await bench({ snapshot: { ok: true, value: { snapshotVersion: 2, items: [row] } } })
    deliver({ snapshotVersion: 3, changed: [{ itemId: 'i-r', status: 'open', entityRevision: 3 }] })
    expect(controller.store.getSnapshot().items[0]).toMatchObject({ entityRevision: 3 })
  })

  it('resyncs when a delivery names an item the queue does not hold', async () => {
    const row = item({ itemId: 'i-known' })
    const { controller, deliver, loads, setItems } = await bench()
    // Boot load reads the live array; point it at one open row first.
    setItems([row])
    await controller.refresh()
    expect(loads).toHaveBeenCalledTimes(2)
    expect(controller.store.getSnapshot().items.map(i => i.itemId)).toEqual(['i-known'])
    setItems([row, item({ itemId: 'i-new', title: 'new-open' })])
    deliver({ snapshotVersion: 2, changed: [{ itemId: 'i-nowhere', status: 'open', entityRevision: 1 }] })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(loads).toHaveBeenCalledTimes(3)
    expect(controller.store.getSnapshot().items.map(i => i.itemId)).toEqual(['i-known', 'i-new'])
  })

  it('drops a delivery that arrives before the boot load settles', async () => {
    // The boot load never settles, so the fold sees a loading queue and drops.
    const { controller, deliver } = await bench({ ghostSnapshot: true })
    deliver({ snapshotVersion: 2, changed: [{ itemId: 'i-ghost', status: 'resolved', entityRevision: 2 }] })
    expect(controller.store.getSnapshot().status).toBe('loading')
    expect(controller.store.getSnapshot().items).toEqual([])
  })

  it('resyncs from the snapshot after a connection reset', async () => {
    const row = item({ itemId: 'i-r' })
    const { ctx, controller, loads, setItems } = await bench()
    setItems([row])
    await controller.refresh()
    expect(loads).toHaveBeenCalledTimes(2)
    expect(controller.store.getSnapshot().items.map(i => i.itemId)).toEqual(['i-r'])
    setItems([row, item({ itemId: 'i-after', title: 'after-reset' })])
    ctx.emit('connection/reset')
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(loads).toHaveBeenCalledTimes(3)
    expect(controller.store.getSnapshot().items.map(i => i.itemId)).toEqual(['i-r', 'i-after'])
  })

  it('applies refresh and keeps only open clarifications from the latest snapshot', async () => {
    const row = item({ itemId: 'i-open', title: 'still-open' })
    const { controller, loads, setItems } = await bench()
    setItems([row, item({ itemId: 'i-b', kind: 'b-confirm' }), item({ itemId: 'i-res', status: 'resolved' })])
    await controller.refresh()
    expect(loads).toHaveBeenCalledTimes(2)
    expect(controller.store.getSnapshot().items.map(i => i.itemId)).toEqual(['i-open'])
  })
})
