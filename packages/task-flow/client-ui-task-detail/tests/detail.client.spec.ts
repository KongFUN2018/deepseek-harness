/**
 * TaskDetailController semantics over a real cordis Context with a scripted
 * tasks Remote: a load fetches the task, its phase runs, and the gate
 * verdicts of each active submission; a missing task lands in the not-found
 * error; a failed load records the code; a blank id never touches the wire;
 * and a task without a current run skips the phase-run scan.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { GateCheckResult, PhaseRunRecord, TaskRecord } from '@deepseek-ai/dsh-task/types'
import { TaskDetailController } from '../src/client/detail.ts'

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

/** One phase-run projection fixture. */
function phase(over: Partial<PhaseRunRecord> = {}): PhaseRunRecord {
  seq += 1
  return {
    phaseRunId: `pr-${seq}` as PhaseRunRecord['phaseRunId'],
    runId: 'r-1' as PhaseRunRecord['runId'],
    taskId: 't-1' as PhaseRunRecord['taskId'],
    phaseId: `phase-${seq}` ,
    state: 'gate-running',
    revision: 1,
    ...over,
  }
}

/** One gate verdict fixture. */
function gate(over: Partial<GateCheckResult> = {}): GateCheckResult {
  seq += 1
  return {
    submissionId: 's-1' as GateCheckResult['submissionId'],
    checkId: `check-${seq}` ,
    passed: true,
    recordedAt: seq * 10,
    ...over,
  }
}

/** Boot the controller over a scripted tasks Remote; reads record their calls. */
async function bench(script: {
  task?: RemoteResult<TaskRecord | undefined>
  phases?: RemoteResult<PhaseRunRecord[]>
  gates?: RemoteResult<GateCheckResult[]>
} = {}) {
  const ctx = new Context()
  const taskResult = script.task ?? { ok: true as const, value: undefined }
  const phasesResult = script.phases ?? { ok: true as const, value: [] as PhaseRunRecord[] }
  const gatesResult = script.gates ?? { ok: true as const, value: [] as GateCheckResult[] }
  const gets = vi.fn()
  const phaseLoads = vi.fn()
  const gateLoads = vi.fn()
  ctx.reflect.provide('remote', {
    digest: {
      digest: async () => ({ ok: true as const, value: {
        taskId: 't-1' as never, state: 'running', revision: 1, runs: [], timeline: [],
        phaseSummaries: [], decisionHistory: [], deliverableStates: [],
      } }),
    },
    tasks: {
      getTask: async (taskId: string) => { gets(taskId); return taskResult } ,
      listPhaseRuns: async (runId: string) => { phaseLoads(runId); return phasesResult } ,
      listGateResults: async (submissionId: string) => { gateLoads(submissionId); return gatesResult } ,
    },
    deliverables: {
      listCurrentInputs: async () => ({ ok: true as const, value: [] }),
    },
  })
  const controller = new TaskDetailController(ctx)
  return { controller, gets, phaseLoads, gateLoads }
}

describe('TaskDetailController', () => {
  it('loads the task, its phase runs, and the verdicts of each active submission', async () => {
    const row = task({ currentRunId: 'r-9' as NonNullable<TaskRecord['currentRunId']> })
    const first = phase({ activeSubmissionId: 's-a' as NonNullable<PhaseRunRecord['activeSubmissionId']> })
    const second = phase()
    const verdict = gate()
    const { controller, gets, phaseLoads, gateLoads } = await bench({
      task: { ok: true, value: row } ,
      phases: { ok: true, value: [first, second] } ,
      gates: { ok: true, value: [verdict] } ,
    })
    await controller.load('t-9')
    const state = controller.store.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.task).toEqual(row)
    expect(state.phaseRuns).toEqual([first, second])
    expect(state.gateResults).toEqual([verdict])
    expect(gets).toHaveBeenCalledWith('t-9')
    expect(phaseLoads).toHaveBeenCalledWith('r-9')
    expect(gateLoads).toHaveBeenCalledWith('s-a')
  })

  it('records not-found when the task does not exist', async () => {
    const { controller } = await bench({ task: { ok: true, value: undefined } })
    await controller.load('t-missing')
    expect(controller.store.getSnapshot().status).toBe('failed')
    expect(controller.store.getSnapshot().error).toBe('not-found')
  })

  it('records the failure code when the task load fails', async () => {
    const failing = { ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } }
    const { controller } = await bench({ task: failing })
    await controller.load('t-1')
    expect(controller.store.getSnapshot().error).toBe('unavailable')
  })

  it('never touches the wire for a blank task id', async () => {
    const { controller, gets } = await bench()
    await controller.load('   ')
    expect(gets).not.toHaveBeenCalled()
    expect(controller.store.getSnapshot().status).toBe('idle')
  })

  it('skips the phase-run scan when the task reports no current run', async () => {
    const row = task()
    const { controller, phaseLoads } = await bench({ task: { ok: true, value: row } })
    await controller.load('t-1')
    expect(phaseLoads).not.toHaveBeenCalled()
    expect(controller.store.getSnapshot().status).toBe('ready')
    expect(controller.store.getSnapshot().phaseRuns).toEqual([])
  })

  it('records the failure code when the phase-run scan fails', async () => {
    const row = task({ currentRunId: 'r-9' as NonNullable<TaskRecord['currentRunId']> })
    const failing = { ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } }
    const { controller } = await bench({ task: { ok: true, value: row }, phases: failing })
    await controller.load('t-9')
    expect(controller.store.getSnapshot().status).toBe('failed')
    expect(controller.store.getSnapshot().error).toBe('unavailable')
  })

  it('drops a failed verdict read without failing the whole load', async () => {
    const row = task({ currentRunId: 'r-9' as NonNullable<TaskRecord['currentRunId']> })
    const first = phase({ activeSubmissionId: 's-a' as NonNullable<PhaseRunRecord['activeSubmissionId']> })
    const failing = { ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } }
    const { controller } = await bench({ task: { ok: true, value: row }, phases: { ok: true, value: [first] }, gates: failing })
    await controller.load('t-9')
    expect(controller.store.getSnapshot().status).toBe('ready')
    expect(controller.store.getSnapshot().gateResults).toEqual([])
  })
})
