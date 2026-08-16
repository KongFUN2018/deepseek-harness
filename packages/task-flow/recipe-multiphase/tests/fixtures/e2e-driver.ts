#!/usr/bin/env node
/** Loader-driver for the per-kind executor registry: boot the real
 * `cordis.yml` (task-flow storage stack plus recipe-multiphase over the
 * engine), register a stub agent factory, two kind executors, and a
 * two-phase recipe, then drive one task to completion and stream one JSON
 * projection proving each phase ran on the executor registered for its
 * kind. Imports the built package roots so plain-Node lib mode never loads
 * decorator-bearing source. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { Context } from '@deepseek-ai/cordis'
import { Inbox } from '@deepseek-ai/dsh-agent'
import type { Agent, AgentFactory } from '@deepseek-ai/dsh-agent'
import { DeliverableId } from '@deepseek-ai/dsh-deliverable-local'
import type { DeliverableService } from '@deepseek-ai/dsh-deliverable-local'
import '@deepseek-ai/dsh-recipe-multiphase'
import type { PhaseAssignment, PhaseOutcome } from '@deepseek-ai/dsh-recipe-engine-core/types'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type { TaskMutationContext } from '@deepseek-ai/dsh-task/types'

/** One driver run's streamed projection. */
interface Projection {
  state: string
  phaseStates: string[]
  surveyKinds: string[]
  clarifyKinds: string[]
}

const NAME = 'recipe-multiphase-e2e-driver'
const [configArg] = process.argv.slice(2)
if (configArg === undefined || configArg.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const root = await mkdtemp(join(tmpdir(), 'dsh-recipe-multiphase-e2e-'))
process.env.DSH_RECIPE_MULTIPHASE_E2E_ROOT = root
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

/** A factory registering every created agent, so goal mutations resolve live identity. */
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

/** Produce a completed outcome saving every declared output as a deliverable version. */
async function completedOutcome(assignment: PhaseAssignment, deliverables: DeliverableService): Promise<PhaseOutcome> {
  const outputVersions = []
  for (const output of assignment.phase.outputs) {
    const version = await deliverables.saveVersion(DeliverableId(output), null, assignment.submissionId)
    outputVersions.push({ deliverableId: DeliverableId(output), versionId: version.versionId })
  }
  return {
    result: 'completed',
    inputVersions: [],
    outputVersions,
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

  const surveyKinds: string[] = []
  const clarifyKinds: string[] = []
  ctx.recipeMultiphase.registerExecutor('survey', {
    name: 'survey-exec',
    async execute(assignment) {
      surveyKinds.push(assignment.phase.kind)
      return completedOutcome(assignment, ctx.deliverables)
    },
  })
  ctx.recipeMultiphase.registerExecutor('clarify', {
    name: 'clarify-exec',
    async execute(assignment) {
      clarifyKinds.push(assignment.phase.kind)
      return completedOutcome(assignment, ctx.deliverables)
    },
  })

  ctx.recipes.register('mp-e2e-recipe', 1, {
    phases: [
      { phaseId: 'survey', kind: 'survey', goal: 'Survey the inputs.', inputs: [], outputs: ['survey-out'], submissionCriteria: ['one explicit submission'] },
      { phaseId: 'clarify', kind: 'clarify', goal: 'Clarify the survey.', inputs: [], outputs: ['clarify-out'], submissionCriteria: ['one explicit submission'] },
    ],
    gateChecks: [
      { checkId: 'survey-complete', phaseId: 'survey', kind: 'A', machineScope: ['the accepted submission lists every declared phase output'], humanAction: [] },
      { checkId: 'clarify-complete', phaseId: 'clarify', kind: 'A', machineScope: ['the accepted submission lists every declared phase output'], humanAction: [] },
    ],
    defaults: { batchConfirm: 'per-phase-single', clarify: { maxRounds: 2, splitMustDefault: true }, draftPolicy: 'block-finalize-not-draft' },
    p4Mode: { mode: 'auto' },
  })

  const created = await ctx.tasks.createTask('mp-e2e-recipe', 'w-1', NAME, 'auto-k')
  await ctx.tasks.startTask(created.taskId, mutation(1, 'start'))
  await pollUntil(async () => (await stateOf(ctx, created.taskId)) === 'completed', 'multi-phase completion')
  const task = await ctx.tasks.getTask(created.taskId)
  const phases = await ctx.tasks.listPhaseRuns(String(task?.currentRunId))

  const projection: Projection = {
    state: task?.state ?? 'missing',
    phaseStates: phases.map(phase => phase.state),
    surveyKinds,
    clarifyKinds,
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
