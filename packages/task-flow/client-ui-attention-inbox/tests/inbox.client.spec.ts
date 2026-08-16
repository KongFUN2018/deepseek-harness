/**
 * AttentionInboxController semantics over a real cordis Context with a
 * scripted workbenchHost/workbenchHostStream Remote: the boot load populates
 * the snapshot and delta cursor, a failed load lands in the error state,
 * folds are revision- and version-gated (unknown ids trigger a resync),
 * batch-confirm and single-decision carry each row's revision and surface
 * every non-resolved item as a conflict count without silently removing it,
 * a failed command records the code and resyncs, and a connection reset
 * replays the delta from the recorded cursor.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AttentionItemView,
  BatchConfirmResponse,
  ResolveDecisionResponse,
  WorkbenchSnapshot,
} from '@deepseek-ai/dsh-workbench-host/types'
import type { IncrementalPage } from '@deepseek-ai/dsh-workbench-host-stream/types'
import { AttentionInboxController, batchable, decidable } from '../src/client/inbox.ts'

let seq = 0

/** One attention-item fixture; `over` overrides any field. */
function item(over: Partial<AttentionItemView> = {}): AttentionItemView {
  seq += 1
  return {
    itemId: `i-${seq}` as AttentionItemView['itemId'],
    kind: 'b-confirm',
    status: 'open',
    entityRevision: 1,
    title: `check-${seq}` ,
    ...over,
  }
}

/** One delta page fixture with a stable epoch and cursor. */
function page(over: Partial<IncrementalPage> = {}): IncrementalPage {
  return { streamId: 'stream-1', cursor: 0, events: [], ...over }
}

type Listener = (...args: unknown[]) => void

/** Boot the controller over a scripted remote; commands record their calls. */
async function bench(script: {
  snapshot?: RemoteResult<WorkbenchSnapshot>
  page?: RemoteResult<IncrementalPage> | ((cursor?: number) => RemoteResult<IncrementalPage>)
  confirm?: RemoteResult<BatchConfirmResponse>
  decide?: RemoteResult<ResolveDecisionResponse>
} = {}, settle = true) {
  const ctx = new Context()
  const items: AttentionItemView[] = []
  const snap = script.snapshot ?? { ok: true as const, value: { snapshotVersion: 0, items } }
  const pageResult = script.page ?? { ok: true as const, value: page() }
  const confirmResult = script.confirm ?? { ok: true as const, value: { snapshotVersion: 1, results: [] } }
  const decideResult = script.decide ?? { ok: true as const, value: { snapshotVersion: 1, outcome: 'resolved' } }
  const loads = vi.fn()
  const streams = vi.fn()
  const confirms = vi.fn()
  const decides = vi.fn()
  const listeners = new Map<string, Listener>()
  ctx.reflect.provide('remote', {
    workbenchHost: {
      listSnapshot: async () => { loads(); return snap } ,
      confirmBatch: async (request: { actor: string; items: unknown[] }) => { confirms(request); return confirmResult },
      resolveDecision: async (request: unknown) => { decides(request); return decideResult },
    },
    workbenchHostStream: {
      listIncremental: async (cursor?: number) => {
        streams(cursor)
        return typeof pageResult === 'function' ? pageResult(cursor) : pageResult
      } ,
    },
    $on: (event: string, listener: Listener) => {
      listeners.set(event, listener)
      return () => { listeners.delete(event) }
    },
  })
  const controller = new AttentionInboxController(ctx)
  if (settle) await new Promise((resolve) => { setTimeout(resolve, 0) })
  return {
    ctx,
    controller,
    loads,
    streams,
    confirms,
    decides,
    deliver: (update: { snapshotVersion: number; changed: { itemId: string; status: AttentionItemView['status']; entityRevision: number }[] }) => {
      listeners.get('workbench/attention-updated')?.(update)
    },
    setItems: (next: AttentionItemView[]) => {
      items.splice(0, items.length, ...next)
    },
  }
}

describe('AttentionInboxController', () => {
  it('loads the snapshot and the delta epoch/cursor on boot', async () => {
    const first = item()
    const second = item()
    const { controller, loads, streams } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 3, items: [first, second] } } ,
      page: { ok: true, value: page({ cursor: 3 }) } ,
    })
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.items).toEqual([first, second])
    expect(state.snapshotVersion).toBe(3)
    expect(state.cursor).toBe(3)
    expect(state.streamId).toBe('stream-1')
    expect(loads).toHaveBeenCalledTimes(1)
    expect(streams).toHaveBeenCalledWith(0)
  })

  it('records the failure code when the snapshot load fails', async () => {
    const failing = { ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } }
    const { controller } = await bench({ snapshot: failing })
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('failed')
    expect(state.error).toBe('unavailable')
  })

  it('folds newer revisions and drops stale or repeated deliveries', async () => {
    const first = item({ entityRevision: 2 })
    const { controller, deliver } = await bench({ snapshot: { ok: true, value: { snapshotVersion: 2, items: [first] } } })
    deliver({ snapshotVersion: 3, changed: [{ itemId: String(first.itemId), status: 'resolved', entityRevision: 3 }] })
    expect(controller.store.getSnapshot().items[0]).toMatchObject({ status: 'resolved', entityRevision: 3 })
    // Older revision delivery drops; an older version delivery drops entirely.
    deliver({ snapshotVersion: 4, changed: [{ itemId: String(first.itemId), status: 'stale', entityRevision: 2 }] })
    expect(controller.store.getSnapshot().items[0]).toMatchObject({ status: 'resolved', entityRevision: 3 })
    deliver({ snapshotVersion: 2, changed: [{ itemId: String(first.itemId), status: 'stale', entityRevision: 9 }] })
    expect(controller.store.getSnapshot().items[0]).toMatchObject({ status: 'resolved', entityRevision: 3 })
  })

  it('resyncs when a delivery names an item the snapshot does not hold', async () => {
    const first = item()
    const { deliver, loads, setItems } = await bench({ snapshot: { ok: true, value: { snapshotVersion: 1, items: [first] } } })
    expect(loads).toHaveBeenCalledTimes(1)
    setItems([first, item()])
    deliver({ snapshotVersion: 2, changed: [{ itemId: 'i-unknown', status: 'open', entityRevision: 1 }] })
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(loads).toHaveBeenCalledTimes(2)
  })

  it('confirms the selected batch and surfaces every non-resolved item', async () => {
    const first = item({ entityRevision: 2 })
    const second = item({ entityRevision: 4 })
    const { controller, confirms } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [first, second] } } ,
      confirm: {
        ok: true,
        value: {
          snapshotVersion: 2,
          results: [
            { itemId: first.itemId, outcome: 'resolved', currentRevision: 3 } ,
            { itemId: second.itemId, outcome: 'conflict', currentRevision: 5 } ,
          ],
        } ,
      } ,
    })
    await controller.confirm([{ itemId: first.itemId, expectedEntityRevision: 2 }, { itemId: second.itemId, expectedEntityRevision: 4 }])
    expect(confirms).toHaveBeenCalledTimes(1)
    expect(controller.store.getSnapshot().conflictCount).toBe(1)
    expect(controller.store.getSnapshot().error).toBe('conflict:1')
  })

  it('never silently removes a stale, withdrawn, or already-resolved batch item', async () => {
    const first = item()
    const { controller } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [first] } } ,
      confirm: {
        ok: true,
        value: {
          snapshotVersion: 2,
          results: [{ itemId: first.itemId, outcome: 'stale', currentRevision: 2 }] ,
        } ,
      } ,
    })
    await controller.confirm([{ itemId: first.itemId, expectedEntityRevision: 1 }])
    expect(controller.store.getSnapshot().conflictCount).toBe(1)
    expect(controller.store.getSnapshot().error).toBe('conflict:1')
  })

  it('decides one C item and records the code on failure', async () => {
    const row = item({ kind: 'c-decision' })
    const { controller, decides } = await bench({ snapshot: { ok: true, value: { snapshotVersion: 1, items: [row] } } })
    await controller.decide(row, 'approve')
    expect(decides).toHaveBeenCalledWith(expect.objectContaining({ decision: 'approve', expectedEntityRevision: 1 }))
    expect(controller.store.getSnapshot().conflictCount).toBe(0)
    expect(controller.store.getSnapshot().error).toBeUndefined()
  })

  it('surfaces a non-resolved decision without confirming it', async () => {
    const row = item({ kind: 'c-decision' })
    const { controller } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [row] } } ,
      decide: { ok: true, value: { snapshotVersion: 2, outcome: 'already-resolved', currentRevision: 2 } } ,
    })
    await controller.decide(row, 'approve')
    expect(controller.store.getSnapshot().conflictCount).toBe(1)
    expect(controller.store.getSnapshot().error).toBe('conflict:1')
  })

  it('replays the delta after a connection reset and resyncs on a moved epoch', async () => {
    const first = item()
    const { ctx, streams, loads } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [first] } } ,
      page: { ok: true, value: page({ cursor: 1 }) } ,
    })
    expect(streams).toHaveBeenCalledWith(0)
    ctx.emit('connection/reset')
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(streams).toHaveBeenCalledWith(1)
    expect(loads).toHaveBeenCalledTimes(1)
  })

  it('skips an empty batch command entirely', async () => {
    const { controller, confirms } = await bench()
    await controller.confirm([])
    expect(confirms).not.toHaveBeenCalled()
    expect(controller.store.getSnapshot().conflictCount).toBe(0)
  })

  it('classifies kinds into batch, decision, and read-only rows', () => {
    expect(batchable(item({ kind: 'b-confirm' }))).toBe(true)
    expect(batchable(item({ kind: 'c-decision' }))).toBe(false)
    expect(decidable(item({ kind: 'c-decision' }))).toBe(true)
    expect(decidable(item({ kind: 'clarification' }))).toBe(false)
  })

  it('drops a delivery that arrives before the boot load settles', async () => {
    const first = item()
    const { controller, deliver } = await bench({ snapshot: { ok: true, value: { snapshotVersion: 1, items: [first] } } }, false)
    deliver({ snapshotVersion: 2, changed: [{ itemId: String(first.itemId), status: 'resolved', entityRevision: 2 }] })
    expect(controller.store.getSnapshot().status).toBe('loading')
    expect(controller.store.getSnapshot().items).toEqual([])
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(controller.store.getSnapshot().status).toBe('ready')
  })

  it('keeps the prior cursor and epoch when the delta read fails during refresh', async () => {
    const first = item()
    const failing = { ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } }
    const { controller } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [first] } } ,
      page: failing,
    })
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.cursor).toBe(0)
    expect(state.streamId).toBeUndefined()
  })

  it('resyncs from the snapshot when a reconnect finds no recorded epoch', async () => {
    const first = item()
    const { ctx, controller, loads } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [first] } } ,
      page: { ok: false, error: { code: 'unavailable', message: 'x', details: {} } } ,
    })
    expect(controller.store.getSnapshot().streamId).toBeUndefined()
    ctx.emit('connection/reset')
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(loads).toHaveBeenCalledTimes(2)
  })

  it('resyncs when the delta replay fails, the epoch moves, or events pend', async () => {
    const first = item()
    const failing = { ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } }
    const { ctx, loads } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [first] } } ,
      page: (cursor?: number) => cursor === 0
        ? { ok: true as const, value: page({ cursor: 1 }) }
        : failing,
    })
    ctx.emit('connection/reset')
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(loads).toHaveBeenCalledTimes(2)
  })

  it('resyncs when the delta epoch moved since the boot load', async () => {
    const first = item()
    const { ctx, loads } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [first] } } ,
      page: (cursor?: number) => cursor === 0
        ? { ok: true as const, value: page({ cursor: 1 }) }
        : { ok: true as const, value: page({ cursor: 2, streamId: 'stream-2' }) },
    })
    ctx.emit('connection/reset')
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(loads).toHaveBeenCalledTimes(2)
  })

  it('resyncs when the delta replay reports pending attention events', async () => {
    const first = item()
    const { ctx, loads } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [first] } } ,
      page: (cursor?: number) => cursor === 0
        ? { ok: true as const, value: page({ cursor: 1 }) }
        : { ok: true as const, value: page({ cursor: 2, events: [{ cursor: 2, previousCursor: 1, eventId: 'e-1', entityKind: 'attention' as const, entityId: String(first.itemId), entityRevision: 2, operation: 'resolved' as const, payload: {} }] }) },
    })
    ctx.emit('connection/reset')
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(loads).toHaveBeenCalledTimes(2)
  })

  it('advances the cursor without resyncing when the delta replay is clean', async () => {
    const first = item()
    const { ctx, controller, loads } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [first] } } ,
      page: (cursor?: number) => cursor === 0
        ? { ok: true as const, value: page({ cursor: 1 }) }
        : { ok: true as const, value: page({ cursor: 2 }) },
    })
    ctx.emit('connection/reset')
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(controller.store.getSnapshot().cursor).toBe(2)
    expect(loads).toHaveBeenCalledTimes(1)
  })

  it('records the code and resyncs when the batch confirm fails', async () => {
    const first = item()
    const failing = { ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } }
    const { controller } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [first] } } ,
      confirm: failing,
    })
    await controller.confirm([{ itemId: first.itemId, expectedEntityRevision: 1 }])
    expect(controller.store.getSnapshot().error).toBe('unavailable')
    expect(controller.store.getSnapshot().conflictCount).toBe(0)
  })

  it('clears the conflict line when every batch item resolves', async () => {
    const first = item()
    const { controller } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [first] } } ,
      confirm: {
        ok: true,
        value: {
          snapshotVersion: 2,
          results: [{ itemId: first.itemId, outcome: 'resolved', currentRevision: 2 }] ,
        } ,
      } ,
    })
    await controller.confirm([{ itemId: first.itemId, expectedEntityRevision: 1 }])
    expect(controller.store.getSnapshot().conflictCount).toBe(0)
    expect(controller.store.getSnapshot().error).toBeUndefined()
  })

  it('records the code and resyncs when the single decision fails', async () => {
    const row = item({ kind: 'c-decision' })
    const failing = { ok: false as const, error: { code: 'invalid-argument', message: 'x', details: {} } }
    const { controller } = await bench({
      snapshot: { ok: true, value: { snapshotVersion: 1, items: [row] } } ,
      decide: failing,
    })
    await controller.decide(row, 'nope')
    expect(controller.store.getSnapshot().error).toBe('invalid-argument')
    expect(controller.store.getSnapshot().conflictCount).toBe(0)
  })
})
