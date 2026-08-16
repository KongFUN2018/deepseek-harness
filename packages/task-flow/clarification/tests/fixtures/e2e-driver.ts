#!/usr/bin/env node
/** Loader-driver for persistent clarification: boot the real cordis.yml
 * (task-flow storage stack plus the session store and clarification service),
 * drive one task to a parked phase run, open a live phase session, answer the
 * required questions, and stream one JSON projection proving the summary was
 * injected as a model-visible session message and the run resumed. Imports the
 * built package roots so plain-Node lib mode never loads decorator-bearing
 * source. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import '@deepseek-ai/dsh-clarification'
import '@deepseek-ai/dsh-attention'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { EMPTY_TEMPLATE_RECIPE_ID } from '@deepseek-ai/dsh-recipe'
import { SubmissionId } from '@deepseek-ai/dsh-task'
import type { PhaseSubmission, TaskMutationContext } from '@deepseek-ai/dsh-task/types'

/** One driver run's streamed projection. */
interface Projection {
  injectedState: string
  userMessageCount: number
  phaseState: string
  injectedFacts: number
  itemState: string
  itemOutcome: string | undefined
}

const NAME = 'clarification-e2e-driver'
const [configArg] = process.argv.slice(2)
if (configArg === undefined || configArg.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const root = await mkdtemp(join(tmpdir(), 'dsh-clarification-e2e-'))
process.env.DSH_CLARIFICATION_E2E_ROOT = root
const uninstallFailLoud = installFailLoud(NAME)

const mutation = (expectedRevision: number, reason: string): TaskMutationContext => ({
  actor: NAME,
  reason,
  expectedRevision,
  idempotencyKey: `${NAME}:${reason}`,
})

try {
  loadEnv(NAME)
  const ctx = await boot(NAME, resolveConfigPath(configArg, undefined))

  const created = await ctx.tasks.createTask(EMPTY_TEMPLATE_RECIPE_ID, 'w-1', NAME, 'auto-k')
  await ctx.tasks.startTask(created.taskId, mutation(1, 'start'))
  const run = await ctx.tasks.createTaskRun(created.taskId, mutation(2, 'run'))
  const phaseRun = await ctx.tasks.createPhaseRun(run.runId, 'main', mutation(1, 'phase'))
  await ctx.tasks.startPhaseRun(phaseRun.phaseRunId, mutation(1, 'start-phase'))
  const submission: PhaseSubmission = {
    submissionId: SubmissionId('s-1'),
    taskId: created.taskId,
    taskRunId: run.runId,
    phaseRunId: phaseRun.phaseRunId,
    phaseId: 'main',
    attempt: 1,
    pinnedRecipe: created.pinnedRecipe,
    sourceSessionId: 'clarify-session',
    sourceSeqRange: { start: 1, end: 5 },
    inputVersions: [],
    outputVersions: [],
    unresolvedIssues: [],
    result: 'completed',
    idempotencyKey: 'sub-k-1',
    submittedAt: Date.now(),
  }
  await ctx.tasks.recordSubmission(submission, {
    submittedBy: NAME,
    sourceSeqPersisted: true,
    inputsCurrent: true,
    outputsValid: true,
  })
  await ctx.tasks.startGate('s-1', mutation(3, 'gate'))
  await ctx.tasks.markPhaseAwaitingInput(String(phaseRun.phaseRunId), mutation(4, 'await'))
  await ctx.tasks.recordPhaseSession(String(phaseRun.phaseRunId), 'clarify-session', mutation(5, 'session'))
  ctx.sessions.create('clarify-session' as SessionId)

  const request = await ctx.clarifications.createRequest(String(phaseRun.phaseRunId), [
    { phaseId: 'main', required: true, order: 0, text: 'What is the target?' },
    { phaseId: 'main', required: true, order: 1, text: 'What is the budget?' },
  ], NAME, 'req-k')
  await ctx.clarifications.answerPartial(String(request.questionIds[0]!), 1, 'target-x', NAME, 'a-1')
  await ctx.clarifications.answerPartial(String(request.questionIds[1]!), 1, 'budget-y', NAME, 'a-2')

  const injected = ctx.clarifications.getRequest(String(request.requestId))
  const session = ctx.sessions.get('clarify-session' as SessionId)
  const userMessages = session?.events.filter(event => event.type === 'user/message') ?? []
  const resumed = await ctx.tasks.getPhaseRun(String(phaseRun.phaseRunId))
  const injectedFacts = ctx.workbenchJournal.replay(0).filter(fact => fact.kind === 'clarification/injected')
  const item = ctx.attention.getItem(`clarification:${String(request.requestId)}`)

  const projection: Projection = {
    injectedState: injected?.state ?? 'missing',
    userMessageCount: userMessages.length,
    phaseState: resumed?.state ?? 'missing',
    injectedFacts: injectedFacts.length,
    itemState: item?.state ?? 'missing',
    itemOutcome: item?.outcome,
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
