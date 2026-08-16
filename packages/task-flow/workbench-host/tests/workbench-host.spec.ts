import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WorkbenchHostService, { WorkbenchItemId } from '@deepseek-ai/dsh-workbench-host/src/index.ts'
import type { WorkbenchAttentionUpdate } from '@deepseek-ai/dsh-workbench-host/src/types.ts'

const seeded = (): WorkbenchHostService => new WorkbenchHostService(new Context(), {
  seedItems: [
    { itemId: ' b-1 ', kind: 'b-confirm', title: '确认需求要点' },
    { itemId: 'b-2', kind: 'b-confirm', title: '确认覆盖度' },
    { itemId: 'c-1', kind: 'c-decision', title: '拍板口径' },
  ],
})

describe('workbench host service', () => {
  it('seeds items with trimmed ids at revision 1 and versions the first snapshot', () => {
    const svc = seeded()
    const snapshot = svc.listSnapshot()
    expect(snapshot.snapshotVersion).toBe(1)
    expect(snapshot.items.map((item: { itemId: string }) => item.itemId)).toEqual(['b-1', 'b-2', 'c-1'])
    expect(snapshot.items.every((item: { entityRevision: number; status: string }) => item.entityRevision === 1 && item.status === 'open')).toBe(true)
  })

  it('reports an empty inbox as snapshot version 0', () => {
    const svc = new WorkbenchHostService(new Context())
    expect(svc.listSnapshot()).toEqual({ snapshotVersion: 0, items: [] })
  })

  it('rejects seed lists with a duplicate id, an empty title, or an empty item id', () => {
    const build = (seedItems: Array<{ itemId: string; kind: 'b-confirm' | 'c-decision'; title: string }>) =>
      new WorkbenchHostService(new Context(), { seedItems })
    expect(() => build([
      { itemId: 'x', kind: 'b-confirm', title: 'a' },
      { itemId: 'x', kind: 'b-confirm', title: 'b' },
    ])).toThrow(/appears twice/)
    expect(() => build([
      { itemId: 'x', kind: 'b-confirm', title: ' ' },
    ])).toThrow(/title/)
    expect(() => build([
      { itemId: ' ', kind: 'b-confirm', title: 'a' },
    ])).toThrow(/seed itemId/)
  })

  it('resolves every open matching item in one batch and bumps the version once', () => {
    const svc = seeded()
    const updates: WorkbenchAttentionUpdate[] = []
    svc['ctx'].on('workbench/attention-updated', (update: WorkbenchAttentionUpdate) => updates.push(update))
    const response = svc.confirmBatch({
      actor: ' user ',
      items: [
        { itemId: WorkbenchItemId('b-1'), expectedEntityRevision: 1 },
        { itemId: WorkbenchItemId('b-2'), expectedEntityRevision: 1 },
      ],
    })
    expect(response.results).toEqual([
      { itemId: 'b-1', outcome: 'resolved', currentRevision: 2 },
      { itemId: 'b-2', outcome: 'resolved', currentRevision: 2 },
    ])
    expect(response.snapshotVersion).toBe(2)
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ snapshotVersion: 2, changed: [
      { itemId: 'b-1', status: 'resolved', entityRevision: 2 },
      { itemId: 'b-2', status: 'resolved', entityRevision: 2 },
    ] })
  })

  it('reports per-item withdrawn, conflict, already-resolved, and stale outcomes without committing', () => {
    const svc = seeded()
    svc.confirmBatch({ actor: 'user', items: [{ itemId: WorkbenchItemId('b-2'), expectedEntityRevision: 1 }] })
    const response = svc.confirmBatch({
      actor: 'user',
      items: [
        { itemId: WorkbenchItemId('gone'), expectedEntityRevision: 1 },
        { itemId: WorkbenchItemId('b-1'), expectedEntityRevision: 9 },
        { itemId: WorkbenchItemId('b-2'), expectedEntityRevision: 2 },
        { itemId: WorkbenchItemId('c-1'), expectedEntityRevision: 9 },
      ],
    })
    expect(response.results.map(row => [row.itemId, row.outcome, row.currentRevision])).toEqual([
      ['gone', 'withdrawn', undefined],
      ['b-1', 'conflict', 1],
      ['b-2', 'already-resolved', 2],
      ['c-1', 'conflict', 1],
    ])
    expect(response.snapshotVersion).toBe(2)
  })

  it('reports stale for a confirm on an invalidated item', () => {
    const svc = seeded()
    svc.invalidateItem({ itemId: WorkbenchItemId('b-1'), expectedEntityRevision: 1, reason: '上游口径变化', actor: 'engine' })
    const response = svc.confirmBatch({ actor: 'user', items: [{ itemId: WorkbenchItemId('b-1'), expectedEntityRevision: 2 }] })
    expect(response.results[0]).toMatchObject({ outcome: 'stale', currentRevision: 2 })
    expect(response.snapshotVersion).toBe(2)
  })

  it('resolves a C decision, records the text, and projects it in the snapshot', () => {
    const svc = seeded()
    const response = svc.resolveDecision({
      itemId: WorkbenchItemId('c-1'),
      expectedEntityRevision: 1,
      decision: ' 采用新增+存量口径 ',
      actor: 'user',
    })
    expect(response).toEqual({ snapshotVersion: 2, outcome: 'resolved', currentRevision: 2 })
    const item = svc.listSnapshot().items.find((entry: { itemId: string }) => entry.itemId === 'c-1')
    expect(item?.status).toBe('resolved')
    expect(item?.decision).toBe('采用新增+存量口径')
  })

  it('returns the decision ladder for non-open C items', () => {
    const svc = seeded()
    expect(svc.resolveDecision({ itemId: WorkbenchItemId('gone'), expectedEntityRevision: 1, decision: 'd', actor: 'user' }))
      .toEqual({ snapshotVersion: 1, outcome: 'withdrawn' })
    svc.resolveDecision({ itemId: WorkbenchItemId('c-1'), expectedEntityRevision: 1, decision: 'd', actor: 'user' })
    expect(svc.resolveDecision({ itemId: WorkbenchItemId('c-1'), expectedEntityRevision: 2, decision: 'd', actor: 'user' }))
      .toEqual({ snapshotVersion: 2, outcome: 'already-resolved', currentRevision: 2 })
    expect(svc.resolveDecision({ itemId: WorkbenchItemId('c-1'), expectedEntityRevision: 9, decision: 'd', actor: 'user' }).outcome).toBe('already-resolved')
  })

  it('invalidates an open item and reports the invalidation ladder', () => {
    const svc = seeded()
    expect(svc.invalidateItem({ itemId: WorkbenchItemId('b-1'), expectedEntityRevision: 1, reason: '上游变化', actor: 'engine' }))
      .toEqual({ snapshotVersion: 2, outcome: 'invalidated', currentRevision: 2 })
    expect(svc.invalidateItem({ itemId: WorkbenchItemId('b-1'), expectedEntityRevision: 2, reason: '再失效', actor: 'engine' }))
      .toEqual({ snapshotVersion: 2, outcome: 'stale', currentRevision: 2 })
    expect(svc.invalidateItem({ itemId: WorkbenchItemId('gone'), expectedEntityRevision: 1, reason: 'r', actor: 'engine' }))
      .toEqual({ snapshotVersion: 2, outcome: 'withdrawn' })
    expect(svc.invalidateItem({ itemId: WorkbenchItemId('b-2'), expectedEntityRevision: 9, reason: 'r', actor: 'engine' }))
      .toEqual({ snapshotVersion: 2, outcome: 'conflict', currentRevision: 1 })
    svc.confirmBatch({ actor: 'user', items: [{ itemId: WorkbenchItemId('b-2'), expectedEntityRevision: 1 }] })
    expect(svc.invalidateItem({ itemId: WorkbenchItemId('b-2'), expectedEntityRevision: 2, reason: 'r', actor: 'engine' }))
      .toEqual({ snapshotVersion: 3, outcome: 'already-resolved', currentRevision: 2 })
  })

  it('validates wire inputs loudly', () => {
    const svc = seeded()
    expect(() => svc.confirmBatch({ actor: ' ', items: [] })).toThrow(/actor/)
    expect(() => svc.confirmBatch({ actor: 'user', items: [{ itemId: WorkbenchItemId('b-1'), expectedEntityRevision: 0 }] }))
      .toThrow(/expectedEntityRevision/)
    expect(() => svc.resolveDecision({ itemId: WorkbenchItemId('c-1'), expectedEntityRevision: 1, decision: '', actor: 'user' }))
      .toThrow(/decision/)
    expect(() => svc.invalidateItem({ itemId: WorkbenchItemId('b-1'), expectedEntityRevision: 1, reason: ' ', actor: 'engine' }))
      .toThrow(/reason/)
  })

  it('contains a throwing attention-updated listener and keeps the commit', () => {
    const svc = seeded()
    const warn = vi.spyOn(svc['ctx'].logger, 'warn').mockImplementation(() => {})
    svc['ctx'].on('workbench/attention-updated', () => { throw new Error('listener boom') })
    const response = svc.confirmBatch({ actor: 'user', items: [{ itemId: WorkbenchItemId('b-1'), expectedEntityRevision: 1 }] })
    expect(response.results[0]?.outcome).toBe('resolved')
    expect(response.snapshotVersion).toBe(2)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(svc.listSnapshot().snapshotVersion).toBe(2)
    warn.mockRestore()
  })
})
