#!/usr/bin/env node
/** Loader-driver for the complex gate: boot the real cordis.yml (task-flow
 * storage stack plus the gate service over the engine), register a stub agent
 * factory, one completing executor, and a recipe declaring a B check, then
 * drive the task until the gate service parks its phase run in
 * awaiting-decision. Imports the built package roots so plain-Node lib mode
 * never loads decorator-bearing source. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { Context } from '@deepseek-ai/cordis'
import { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentFactory } from '@deepseek-ai/dsh-agent'
import type { PhaseAssignment, PhaseOutcome } from '@deepseek-ai/dsh-recipe-engine-core/types'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { TaskMutationContext } from '@deepseek-ai/dsh-task/types'
import '@deepseek-ai/dsh-gate'
import '@deepseek-ai/dsh-attention'

/** One driver run's streamed projection. */
interface Projection {
  phaseState: string
  gateResultKinds: string[]
  openItems: Array<{ itemId: string; kind: string; decisionKind: string; checkId?: string; options: string[] }>
}

const NAME = 'gate-e2e-driver'
const [configArg] = process.argv.slice(2)
if (configArg === undefined || configArg.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const root = await mkdtemp(join(tmpdir(), 'dsh-gate-e2e-'))
process.env.DSH_GATE_E2E_ROOT = root
const uninstallFailLoud = installFailLoud(NAME)

/** One minimal live agent over an in-memory session. */
function stubAgent(rawId: string): Agent {
  const id = SessionId(rawId)
  const session = Session.create(id)
  return {
    id,
    options: {},
    session,
    inbox: new Inbox(session, { inserted: () => {}, discarded: () => {}, claimed: () => {} }),
    status: 'idle',
    ctx: new Context(),
    send: () => {},
    followup: () => {},
    steer: () => ({ outcome: Promise.resolve({ status: 'rejected' as const }) }),
    inject: () => {},
    cancel() {},
    runMaintenance: task => task(new AbortController().signal),
    whenIdle: () => Promise.resolve(),
  }
}

function stubAgentFactory(): AgentFactory {
  return {
    async createAgent(ownerCtx, options) {
      const agent = stubAgent(String(options.sessionId))
      const unregister = ownerCtx.agents.register(agent)
      return { agent, dispose: async () => { unregister() } }
    },
    async resume(ownerCtx, options) {
      const agent = stubAgent(String(options.resumeSessionId))
      const unregister = ownerCtx.agents.register(agent)
      return { agent, dispose: async () => { unregister() } }
    },
  }
}

async function completedOutcome(_assignment: PhaseAssignment): Promise<PhaseOutcome> {
  return {
    result: 'completed',
    inputVersions: [],
    outputVersions: [],
    unresolvedIssues: [],
    sourceSeqRange: { start: 1, end: 1 },
    sourceSeqPersisted: true,
  }
}

const mutation = (expectedRevision: number, reason: string): TaskMutationContext => ({
  actor: NAME,
  reason,
  expectedRevision,
  idempotencyKey: `${NAME}:${reason}`,
})

async function pollAwaiting(ctx: Context, taskId: string): Promise<{ phaseState: string; submissionId: string }> {
  const start = Date.now()
  for (;;) {
    const task = await ctx.tasks.getTask(taskId)
    const runs = await ctx.tasks.listPhaseRuns(String(task?.currentRunId))
    const run = runs[0]
    if (run?.state === 'awaiting-decision') {
      return { phaseState: run.state, submissionId: String(run.activeSubmissionId ?? '') }
    }
    if (Date.now() - start > 15000) {
      return { phaseState: run?.state ?? 'missing', submissionId: String(run?.activeSubmissionId ?? '') }
    }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
}

try {
  loadEnv(NAME)
  const ctx = await boot(NAME, resolveConfigPath(configArg, undefined))
  ctx.agents.setFactory(stubAgentFactory())
  ctx.recipeEngine.registerExecutor({
    name: 'gate-e2e-exec',
    execute: completedOutcome,
  })
  ctx.recipes.register('gate-e2e-recipe', 1, {
    phases: [
      { phaseId: 'build', kind: 'build', goal: 'Build the output.', inputs: [], outputs: [], submissionCriteria: ['one explicit submission'] },
    ],
    gateChecks: [
      { checkId: 'outputs-complete', phaseId: 'build', kind: 'A', machineScope: ['the accepted submission lists every declared phase output'], humanAction: [] },
      { checkId: 'human-review', phaseId: 'build', kind: 'B', machineScope: ['the accepted submission is complete'], humanAction: ['review the produced output'] },
    ],
    defaults: { batchConfirm: 'per-phase-single', clarify: { maxRounds: 2, splitMustDefault: true }, draftPolicy: 'block-finalize-not-draft' },
    p4Mode: { mode: 'auto' },
  })

  const created = await ctx.tasks.createTask('gate-e2e-recipe', 'w-1', NAME, 'auto-k')
  await ctx.tasks.startTask(created.taskId, mutation(1, 'start'))
  const polled = await pollAwaiting(ctx, created.taskId)
  const gateResults = await ctx.tasks.listGateResults(polled.submissionId)

  const projection: Projection = {
    phaseState: polled.phaseState,
    gateResultKinds: gateResults.map(result => result.checkId),
    openItems: ctx.attention.listOpen().map(item => ({
      itemId: String(item.itemId),
      kind: item.kind,
      decisionKind: item.decisionKind,
      ...(item.checkId === undefined ? {} : { checkId: item.checkId }),
      options: [...item.options],
    })),
  }
  console.log(JSON.stringify(projection))
  await ctx.fiber.dispose()
} catch (error) {
  console.error(String(error))
  process.exitCode = 1
} finally {
  uninstallFailLoud()
  await rm(root, { recursive: true, force: true })
}
