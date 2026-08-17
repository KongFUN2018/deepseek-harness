/**
 * TaskBoardController semantics over a real cordis Context with a scripted
 * tasks Remote: the boot load populates the snapshot freshest-first, a
 * failed load lands in the error state, folds are revision-gated (new rows
 * join, newer revisions replace, stale or repeated deliveries drop), each
 * verb reaches its Remote method carrying the row's revision with fresh
 * idempotency keys, a failed verb records the code and resyncs, an unknown
 * task id never touches the wire, and a connection reset re-loads.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { TaskMutationContext, TaskRecord } from '@deepseek-ai/dsh-task/types'
import { TaskBoardController, verbsFor } from '../src/client/board.ts'

let seq = 0

/** One task projection fixture; `over` overrides any field. */
function task(over: Partial<TaskRecord> = {}): TaskRecord {
  seq += 1
  return {
    taskId: `t-${seq}` as TaskRecord['taskId'],
    workspaceId: 'ws-1',
    pinnedRecipe: { recipeId: 'recipe-a' as never, revision: 1, schemaVersion: 1, contentHash: 'hash' },
    state: 'running',
    revision: 1,
    createdAt: seq * 10,
    ...over,
  }
}

type Listener = (...args: unknown[]) => void

/** Boot the controller over a scripted remote; verbs record their calls. */
async function bench(script: {
  list?: RemoteResult<TaskRecord[]>
  pause?: RemoteResult<TaskRecord>
  resume?: RemoteResult<TaskRecord>
  cancel?: RemoteResult<TaskRecord>
} = {}) {
  const ctx = new Context()
  const list = script.list ?? { ok: true as const, value: [] }
  const verbResult = (r: RemoteResult<TaskRecord> | undefined) =>
    r ?? { ok: true as const, value: task() }
  const mutations: Record<'pause' | 'resume' | 'cancel', (TaskMutationContext & { taskId: string })[]> = {
    pause: [], resume: [], cancel: [],
  }
  const loads = vi.fn()
  const listeners = new Map<string, Listener>()
  ctx.reflect.provide('remote', {
    metrics: {
      metrics: async () => ({
        ok: true as const,
        value: { live: 0, gate: 0, ask: 0, asset: 0, throughput: [], gatePassRate: { a: 0, b: 0, c: 0 } },
      }),
    },
    tasks: {
      listTasks: async () => { loads(); return list },
      listPhaseRuns: async () => ({ ok: true as const, value: [] }),
      requestPause: async (taskId: string, mutation: TaskMutationContext) => {
        mutations.pause.push({ taskId, ...mutation })
        return verbResult(script.pause)
      },
      resume: async (taskId: string, mutation: TaskMutationContext) => {
        mutations.resume.push({ taskId, ...mutation })
        return verbResult(script.resume)
      },
      requestCancel: async (taskId: string, mutation: TaskMutationContext) => {
        mutations.cancel.push({ taskId, ...mutation })
        return verbResult(script.cancel)
      },
    },
    $on: (event: string, listener: Listener) => {
      listeners.set(event, listener)
      return () => { listeners.delete(event) }
    },
  })
  const controller = new TaskBoardController(ctx)
  await new Promise((resolve) => { setTimeout(resolve, 0) })
  return {
    ctx,
    controller,
    loads,
    mutations,
    deliverTask: (payload: TaskRecord) => { listeners.get('task/updated')?.(payload) },
  }
}

describe('TaskBoardController', () => {
  it('loads the task list freshest-first on boot', async () => {
    const older = task({ createdAt: 5 })
    const newer = task({ createdAt: 50 })
    const { controller } = await bench({ list: { ok: true, value: [older, newer] } })
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.tasks.map(t => t.taskId)).toEqual([newer.taskId, older.taskId])
    expect(state.updatedAt).toBeGreaterThan(0)
  })

  it('records the failure code when the load fails', async () => {
    const failing = { ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } }
    const { controller } = await bench({ list: failing })
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('failed')
    expect(state.error).toBe('unavailable')
  })

  it('orders equal-creation rows by taskId as the stable tiebreak', async () => {
    const alpha = task({ taskId: 't-a' as TaskRecord['taskId'], createdAt: 42 })
    const beta = task({ taskId: 't-b' as TaskRecord['taskId'], createdAt: 42 })
    const descending = await bench({ list: { ok: true, value: [beta, alpha] } })
    expect(descending.controller.store.getSnapshot().tasks.map(t => t.taskId)).toEqual(['t-a', 't-b'])
    // The same pair pre-sorted exercises the comparator's keep-order side.
    const ascending = await bench({ list: { ok: true, value: [alpha, beta] } })
    expect(ascending.controller.store.getSnapshot().tasks.map(t => t.taskId)).toEqual(['t-a', 't-b'])
  })

  it('folds unknown tasks in and replaces rows only on newer revisions', async () => {
    const first = task()
    const { controller, deliverTask } = await bench({ list: { ok: true, value: [first] } })
    const joined = task({ createdAt: first.createdAt + 5 })
    deliverTask(joined)
    expect(controller.store.getSnapshot().tasks.map(t => t.taskId)).toEqual([joined.taskId, first.taskId])
    deliverTask({ ...first, revision: first.revision + 1, state: 'pausing' })
    expect(controller.store.getSnapshot().tasks[1]).toMatchObject({ revision: 2, state: 'pausing' })
    deliverTask({ ...first, revision: 1 })
    deliverTask({ ...first, revision: 0 })
    expect(controller.store.getSnapshot().tasks.map(row => row.revision)).toEqual([expect.any(Number), 2])
  })

  it('issues pause with the row revision and fresh idempotency keys, then folds the result', async () => {
    const row = task({ revision: 7 })
    const paused = { ...row, revision: 8, state: 'pausing' as const }
    const { controller, mutations } = await bench({ list: { ok: true, value: [row] }, pause: { ok: true, value: paused } })
    await controller.command(row.taskId, 'pause')
    expect(mutations.pause).toHaveLength(1)
    expect(mutations.pause).toEqual([expect.objectContaining({ taskId: row.taskId, expectedRevision: 7, actor: 'task-board' })])
    await controller.command(row.taskId, 'pause')
    const keys = mutations.pause.map(entry => entry.idempotencyKey)
    expect(keys).toHaveLength(2)
    expect(keys[0]).not.toBe(keys[1])
    expect(controller.store.getSnapshot().tasks[0]).toMatchObject({ revision: 8, state: 'pausing' })
  })

  it('routes resume and cancel to their own verbs', async () => {
    const row = task()
    const { controller, mutations } = await bench({ list: { ok: true, value: [row] } })
    await controller.command(row.taskId, 'resume')
    await controller.command(row.taskId, 'cancel')
    expect(mutations.pause).toHaveLength(0)
    expect(mutations.resume.map(entry => entry.taskId)).toEqual([row.taskId])
    expect(mutations.cancel.map(entry => entry.taskId)).toEqual([row.taskId])
  })

  it('records a failed verb, resyncs, and keeps the code until a successful command', async () => {
    const row = task({ revision: 3 })
    const { controller, mutations, loads } = await bench({
      list: { ok: true, value: [row] },
      cancel: { ok: false, error: { code: 'stale-revision', message: 'x', details: {} } },
    })
    expect(loads).toHaveBeenCalledTimes(1)
    await controller.command(row.taskId, 'cancel')
    expect(mutations.cancel).toHaveLength(1)
    expect(controller.store.getSnapshot().error).toBe('stale-revision')
    expect(loads).toHaveBeenCalledTimes(2)
    await controller.refresh()
    expect(controller.store.getSnapshot().error).toBe('stale-revision')
  })

  it('clears a recorded error on the next successful command', async () => {
    const row = task()
    const { controller } = await bench({ list: { ok: true, value: [row] } })
    controller.store.set({ ...controller.store.getSnapshot(), error: 'stale-revision' })
    await controller.command(row.taskId, 'pause')
    expect(controller.store.getSnapshot().error).toBeUndefined()
  })

  it('ignores a command for a task the board no longer holds', async () => {
    const { controller, mutations } = await bench()
    await controller.command('t-absent', 'pause')
    expect(mutations.pause).toHaveLength(0)
  })

  it('reloads after a connection reset', async () => {
    const { ctx, loads } = await bench()
    expect(loads).toHaveBeenCalledTimes(1)
    ctx.emit('connection/reset')
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    expect(loads).toHaveBeenCalledTimes(2)
  })

  it('offers verbs by task state', () => {
    expect(verbsFor(task({ state: 'running' }))).toEqual(['pause', 'cancel'])
    expect(verbsFor(task({ state: 'paused' }))).toEqual(['resume', 'cancel'])
    expect(verbsFor(task({ state: 'pausing' }))).toEqual(['cancel'])
    expect(verbsFor(task({ state: 'planning' }))).toEqual(['cancel'])
    expect(verbsFor(task({ state: 'completed' }))).toEqual([])
    expect(verbsFor(task({ state: 'cancelling' }))).toEqual([])
  })
})
