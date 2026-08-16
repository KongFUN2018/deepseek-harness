#!/usr/bin/env node
/** Loader-driver for the recipe engine core: boot the real `cordis.yml`
 * (the task-flow storage stack, agent and goal services, and the engine),
 * register a stub agent factory and a deterministic phase executor, then
 * drive one auto-completing task, restart on the same medium and observe
 * recovery, and exercise pause quiescence plus resume on a second task,
 * streaming one JSON projection on stdout. Imports the built package
 * roots so plain-Node lib mode never loads decorator-bearing source. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { EMPTY_TEMPLATE, EMPTY_TEMPLATE_RECIPE_ID } from '@deepseek-ai/dsh-recipe'
import type { Context } from '@deepseek-ai/cordis'
import type { TaskMutationContext } from '@deepseek-ai/dsh-task/types'
import { completedOutcome, stubAgentFactory } from './stubs.ts'

/** One driver run's streamed projection. */
interface Projection {
  autoState: string
  autoPhaseState: string
  autoGates: number
  autoSubmissionResult: string
  restartState: string
  restartGates: number
  pauseDuringFlight: string
  pausedState: string
  resumedState: string
}

const NAME = 'recipe-engine-e2e-driver'
const [configArg] = process.argv.slice(2)
if (configArg === undefined || configArg.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const root = await mkdtemp(join(tmpdir(), 'dsh-recipe-engine-e2e-'))
process.env.DSH_RECIPE_ENGINE_E2E_ROOT = root
const uninstallFailLoud = installFailLoud(NAME)

const mutation = (expectedRevision: number, reason: string): TaskMutationContext => ({
  actor: NAME,
  reason,
  expectedRevision,
  idempotencyKey: `${NAME}:${reason}`,
})

async function pollUntil(cond: () => Promise<boolean>, what: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now()
  for (;;) {
    if (await cond()) return
    if (Date.now() - start > timeoutMs) throw new Error(`${NAME}: timed out waiting for ${what}`)
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

const stateOf = async (ctx: Context, taskId: string): Promise<string> =>
  (await ctx.tasks.getTask(taskId))?.state ?? 'missing'

try {
  loadEnv(NAME)
  const ctx = await boot(NAME, resolveConfigPath(configArg, undefined))
  ctx.agents.setFactory(stubAgentFactory())
  ctx.recipeEngine.registerExecutor({
    name: 'e2e-auto',
    execute: assignment => completedOutcome(assignment, ctx.deliverables),
  })

  const created = await ctx.tasks.createTask(EMPTY_TEMPLATE_RECIPE_ID, 'w-1', NAME, 'auto-k')
  await ctx.tasks.startTask(created.taskId, mutation(1, 'start'))
  await pollUntil(async () => (await stateOf(ctx, created.taskId)) === 'completed', 'auto completion')
  const task = await ctx.tasks.getTask(created.taskId)
  const phases = await ctx.tasks.listPhaseRuns(String(task?.currentRunId))
  const submission = await ctx.tasks.getSubmission(String(phases[0]?.activeSubmissionId))
  const autoGates = (await ctx.tasks.listGateResults(String(phases[0]?.activeSubmissionId))).length

  // Restart on the same medium: recovery re-reads projections and the
  // journal and must not re-run the completed task's gate.
  await ctx.fiber.dispose()
  const ctx2 = await boot(NAME, resolveConfigPath(configArg, undefined))
  ctx2.agents.setFactory(stubAgentFactory())
  let started = false
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => { release = resolve })
  ctx2.recipeEngine.registerExecutor({
    name: 'e2e-blocking',
    async execute(assignment) {
      started = true
      await gate
      return completedOutcome(assignment, ctx2.deliverables)
    },
  })
  const restartState = await stateOf(ctx2, created.taskId)
  const restartGates = (await ctx2.tasks.listGateResults(String(phases[0]?.activeSubmissionId))).length

  // Pause quiescence: pause while the executor holds the task's only
  // in-flight action; settle waits for the recorded submission. The pause task
  // registers its own recipe so its output deliverable never collides with the
  // completed task's version chain.
  const PAUSE_RECIPE_ID = 'e2e-pause-template'
  ctx2.recipes.register(PAUSE_RECIPE_ID, 1, {
    ...EMPTY_TEMPLATE,
    phases: EMPTY_TEMPLATE.phases.map(phase => ({ ...phase, outputs: ['pause deliverable'] })),
  })
  const second = await ctx2.tasks.createTask(PAUSE_RECIPE_ID, 'w-1', NAME, 'pause-k')
  await ctx2.tasks.startTask(second.taskId, mutation(1, 'start'))
  await pollUntil(() => Promise.resolve(started), 'blocking executor start')
  const before = await ctx2.tasks.getTask(second.taskId)
  await ctx2.tasks.requestPause(second.taskId, mutation(before!.revision, 'pause'))
  await pollUntil(async () => (await stateOf(ctx2, second.taskId)) === 'pausing', 'pausing')
  await new Promise(resolve => setTimeout(resolve, 150))
  const pauseDuringFlight = await stateOf(ctx2, second.taskId)
  release()
  await pollUntil(async () => (await stateOf(ctx2, second.taskId)) === 'paused', 'paused settle')
  const pausedState = await stateOf(ctx2, second.taskId)
  const pausedTask = await ctx2.tasks.getTask(second.taskId)
  await ctx2.tasks.resume(second.taskId, mutation(pausedTask!.revision, 'resume'))
  await pollUntil(async () => (await stateOf(ctx2, second.taskId)) === 'completed', 'resumed completion')
  const resumedState = await stateOf(ctx2, second.taskId)
  await ctx2.fiber.dispose()

  const projection: Projection = {
    autoState: task?.state ?? 'missing',
    autoPhaseState: phases[0]?.state ?? 'missing',
    autoGates,
    autoSubmissionResult: submission?.result ?? 'missing',
    restartState,
    restartGates,
    pauseDuringFlight,
    pausedState,
    resumedState,
  }
  console.log(JSON.stringify(projection))
} catch (error) {
  console.error(String(error))
  process.exitCode = 1
} finally {
  uninstallFailLoud()
  await rm(root, { recursive: true, force: true })
}
