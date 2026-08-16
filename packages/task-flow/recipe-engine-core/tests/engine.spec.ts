/**
 * Unit suite: the engine schedules pinned-recipe phase runs, drives the
 * submission-gate-pass chain through a contributed executor, and reconciles
 * pause, cancel, and restart recovery.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import DeliverableService from '@deepseek-ai/dsh-deliverable-minimal'
import GoalService from '@deepseek-ai/dsh-goal'
import RecipeRegistry, { EMPTY_TEMPLATE_RECIPE_ID } from '@deepseek-ai/dsh-recipe'
import { SessionId } from '@deepseek-ai/dsh-session'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { TaskMutationContext } from '@deepseek-ai/dsh-task/types'
import WorkbenchJournalService from '@deepseek-ai/dsh-workbench-journal'
import LocalTaskService from '@deepseek-ai/dsh-task-local'
import RecipeEngineCore from '../src/index.ts'
import {
  completedOutcome,
  stubAgentFactory,
} from './fixtures/stubs.ts'
import {
  MemoryMediaPool,
  MemoryStorageBackend,
} from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'

async function harness(pool?: MemoryMediaPool) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(RecipeRegistry)
  await ctx.plugin(WorkbenchJournalService)
  await ctx.plugin(DeliverableService)
  await ctx.plugin(LocalTaskService).await()
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(GoalService)
  await ctx.plugin(RecipeEngineCore).await()
  return { ctx, tasks: ctx.tasks, journal: ctx.workbenchJournal, deliverables: ctx.deliverables, engine: ctx.recipeEngine }
}

type H = Awaited<ReturnType<typeof harness>>

let current: Context | undefined
afterEach(async () => {
  await current?.fiber.dispose()
  current = undefined
})

const mutation = (expectedRevision: number, over: Partial<TaskMutationContext> = {}): TaskMutationContext => ({
  actor: 'unit',
  reason: 'engine spec',
  expectedRevision,
  idempotencyKey: 'mut-k',
  ...over,
})

async function waitFor(cond: () => boolean | Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const start = Date.now()
  for (;;) {
    if (await cond()) return
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

async function taskState(h: H, taskId: string): Promise<string | undefined> {
  return (await h.tasks.getTask(taskId))?.state
}

/** Create and start one task; returns the created task record. */
async function startOne(h: H) {
  const created = await h.tasks.createTask(EMPTY_TEMPLATE_RECIPE_ID, 'w-1', 'unit', 'create-k')
  await h.tasks.startTask(created.taskId, mutation(1))
  return created
}

describe('recipe engine core', () => {
  it('drives one task through execute, submission, gate, and completion', async () => {
    const h = await harness()
    current = h.ctx
    h.engine.registerExecutor({ name: 'test', execute: assignment => completedOutcome(assignment, h.deliverables) })
    const created = await startOne(h)
    await waitFor(async () => (await taskState(h, created.taskId)) === 'completed')
    const task = await h.tasks.getTask(created.taskId)
    expect(task?.state).toBe('completed')
    const phases = await h.tasks.listPhaseRuns(String(task!.currentRunId))
    expect(phases).toHaveLength(1)
    expect(phases[0]?.state).toBe('passed')
    expect(phases[0]?.activeSubmissionId).toBeDefined()
    const submission = await h.tasks.getSubmission(String(phases[0]!.activeSubmissionId))
    expect(submission?.result).toBe('completed')
    expect(submission?.outputVersions.map(ref => String(ref.deliverableId))).toEqual(['main deliverable'])
    const gates = await h.tasks.listGateResults(String(submission!.submissionId))
    expect(gates).toHaveLength(1)
    expect(gates[0]?.passed).toBe(true)
    const taskFacts = h.journal.replay(0).filter(fact => fact.taskId === created.taskId)
    expect(taskFacts.length).toBeGreaterThan(0)
  })

  it('enforces a single executor registration with disposal', async () => {
    const h = await harness()
    current = h.ctx
    const executor = { name: 'test', execute: (assignment: Parameters<Parameters<typeof h.engine.registerExecutor>[0]['execute']>[0]) => completedOutcome(assignment, h.deliverables) }
    const dispose = h.engine.registerExecutor(executor)
    expect(() => h.engine.registerExecutor(executor)).toThrow(/already registered/)
    dispose()
    const dispose2 = h.engine.registerExecutor(executor)
    expect(dispose2).toBeTypeOf('function')
    dispose2()
  })

  it('stalls a running phase loudly when no executor is registered', async () => {
    const h = await harness()
    current = h.ctx
    const created = await startOne(h)
    await waitFor(async () => (await h.tasks.listPhaseRuns(String((await h.tasks.getTask(created.taskId))!.currentRunId!)))[0]?.state === 'running')
    const task = await h.tasks.getTask(created.taskId)
    expect(task?.state).toBe('running')
    const phases = await h.tasks.listPhaseRuns(String(task!.currentRunId))
    expect(phases[0]?.state).toBe('running')
    expect(task?.state).not.toBe('completed')
  })

  it('observes a pause barrier only after the in-flight execution records its submission', async () => {
    const h = await harness()
    current = h.ctx
    let started = false
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    h.engine.registerExecutor({
      name: 'blocking',
      async execute(assignment) {
        started = true
        await gate
        return completedOutcome(assignment, h.deliverables)
      },
    })
    const created = await startOne(h)
    await waitFor(() => started)
    const before = await h.tasks.getTask(created.taskId)
    await h.tasks.requestPause(created.taskId, mutation(before!.revision))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(await taskState(h, created.taskId)).toBe('pausing')
    release()
    await waitFor(async () => (await taskState(h, created.taskId)) === 'paused')
    await h.tasks.resume(created.taskId, mutation((await h.tasks.getTask(created.taskId))!.revision))
    await waitFor(async () => (await taskState(h, created.taskId)) === 'completed')
    expect(await taskState(h, created.taskId)).toBe('completed')
  })

  it('cancels active phases and settles cancel after in-flight work records', async () => {
    const h = await harness()
    current = h.ctx
    let started = false
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    h.engine.registerExecutor({
      name: 'blocking',
      async execute(assignment) {
        started = true
        await gate
        return completedOutcome(assignment, h.deliverables)
      },
    })
    const created = await startOne(h)
    await waitFor(() => started)
    const before = await h.tasks.getTask(created.taskId)
    await h.tasks.requestCancel(created.taskId, mutation(before!.revision))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(await taskState(h, created.taskId)).toBe('cancelling')
    release()
    await waitFor(async () => (await taskState(h, created.taskId)) === 'cancelled')
    const task = await h.tasks.getTask(created.taskId)
    expect(task?.state).toBe('cancelled')
  })

  it('recovers a submitted-but-ungated phase across a restart exactly once', async () => {
    const pool = new MemoryMediaPool()
    const h = await harness(pool)
    current = h.ctx
    let started = false
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    h.engine.registerExecutor({
      name: 'blocking',
      async execute(assignment) {
        started = true
        await gate
        return completedOutcome(assignment, h.deliverables)
      },
    })
    const created = await startOne(h)
    await waitFor(() => started)
    const before = await h.tasks.getTask(created.taskId)
    await h.tasks.requestPause(created.taskId, mutation(before!.revision))
    release()
    await waitFor(async () => (await taskState(h, created.taskId)) === 'paused')
    const phaseRun = (await h.tasks.listPhaseRuns(String((await h.tasks.getTask(created.taskId))!.currentRunId!)))[0]
    expect(phaseRun?.state).toBe('submitted')
    await h.ctx.fiber.dispose()
    current = undefined

    const h2 = await harness(pool)
    current = h2.ctx
    h2.engine.registerExecutor({ name: 'test', execute: assignment => completedOutcome(assignment, h2.deliverables) })
    await waitFor(async () => (await taskState(h2, created.taskId)) === 'paused')
    const resumed = await h2.tasks.getTask(created.taskId)
    await h2.tasks.resume(created.taskId, mutation(resumed!.revision))
    await waitFor(async () => (await taskState(h2, created.taskId)) === 'completed')
    const submissionId = String(phaseRun!.activeSubmissionId)
    const gates = await h2.tasks.listGateResults(submissionId)
    expect(gates).toHaveLength(1)
  })

  it('re-executes a phase whose executor died mid-flight across a restart', async () => {
    const pool = new MemoryMediaPool()
    const h = await harness(pool)
    current = h.ctx
    let started = false
    h.engine.registerExecutor({
      name: 'never-resolves',
      execute() {
        started = true
        return new Promise<never>(() => {})
      },
    })
    const created = await startOne(h)
    await waitFor(() => started)
    const phaseRunBefore = (await h.tasks.listPhaseRuns(String((await h.tasks.getTask(created.taskId))!.currentRunId!)))[0]
    expect(phaseRunBefore?.state).toBe('running')
    await h.ctx.fiber.dispose()
    current = undefined

    const h2 = await harness(pool)
    current = h2.ctx
    h2.engine.registerExecutor({ name: 'test', execute: assignment => completedOutcome(assignment, h2.deliverables) })
    await waitFor(async () => (await taskState(h2, created.taskId)) === 'completed')
    const phases = await h2.tasks.listPhaseRuns(String((await h2.tasks.getTask(created.taskId))!.currentRunId!))
    expect(phases[0]?.state).toBe('passed')
    const submission = await h2.tasks.getSubmission(String(phases[0]!.activeSubmissionId))
    expect(submission?.attempt).toBe(2)
  })

  it('creates a phase-session agent and goal, then disposes them when the phase settles', async () => {
    const h = await harness()
    current = h.ctx
    h.ctx.agents.setFactory(stubAgentFactory())
    let started = false
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    h.engine.registerExecutor({
      name: 'blocking',
      async execute(assignment) {
        started = true
        await gate
        return completedOutcome(assignment, h.deliverables)
      },
    })
    const created = await startOne(h)
    await waitFor(() => started)
    const phaseRun = (await h.tasks.listPhaseRuns(String((await h.tasks.getTask(created.taskId))!.currentRunId!)))[0]
    const sessionId = SessionId(`phase-${phaseRun!.phaseRunId}-a1`)
    const agent = h.ctx.agents.get(sessionId)
    expect(agent).toBeDefined()
    const goal = h.ctx.goals.get(agent!)
    expect(goal?.objective).toBeDefined()
    release()
    await waitFor(async () => (await taskState(h, created.taskId)) === 'completed')
    expect(h.ctx.agents.get(sessionId)).toBeUndefined()
  })
})
