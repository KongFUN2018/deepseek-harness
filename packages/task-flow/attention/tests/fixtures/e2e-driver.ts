#!/usr/bin/env node
/** Loader-driver for the persistent attention inbox: boot the real cordis.yml
 * (task-flow storage stack plus the attention service), park a phase run in
 * awaiting-decision, create one decision item, resolve it, and stream one JSON
 * projection proving the item resolved, the run resumed, and the journal fact
 * landed. Imports the built package roots so plain-Node lib mode never loads
 * decorator-bearing source. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import '@deepseek-ai/dsh-attention'
import { EMPTY_TEMPLATE_RECIPE_ID } from '@deepseek-ai/dsh-recipe'
import { SubmissionId, TaskId } from '@deepseek-ai/dsh-task'
import type { PhaseSubmission, TaskMutationContext } from '@deepseek-ai/dsh-task/types'
import { AttentionItemId } from '@deepseek-ai/dsh-attention'

/** One driver run's streamed projection. */
interface Projection {
  itemState: string
  outcome: string
  phaseState: string
  resolvedFacts: number
  openCount: number
}

const NAME = 'attention-e2e-driver'
const [configArg] = process.argv.slice(2)
if (configArg === undefined || configArg.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const root = await mkdtemp(join(tmpdir(), 'dsh-attention-e2e-'))
process.env.DSH_ATTENTION_E2E_ROOT = root
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
    sourceSessionId: 'attention-session',
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
  const gated = await ctx.tasks.getPhaseRun(String(phaseRun.phaseRunId))
  if (gated === undefined) throw new Error('phase run missing after startGate')
  await ctx.tasks.markPhaseAwaitingDecision(String(gated.phaseRunId), mutation(gated.revision, 'await'))

  const itemId = AttentionItemId('gate:s-1:human-review')
  await ctx.attention.createItem({
    itemId,
    taskId: TaskId(String(created.taskId)),
    phaseRunId: gated.phaseRunId,
    kind: 'c-decision',
    decisionKind: 'gate',
    options: ['yes', 'no'],
  }, NAME, 'create-k')
  const decided = await ctx.attention.resolveDecision(String(itemId), 1, 'yes', NAME, 'resolve-k')
  const stored = ctx.attention.getItem(String(itemId))
  const resumed = await ctx.tasks.getPhaseRun(String(phaseRun.phaseRunId))
  const resolvedFacts = ctx.workbenchJournal.replay(0).filter(fact => fact.kind === 'attention/item-resolved')

  const projection: Projection = {
    itemState: stored?.state ?? 'missing',
    outcome: decided.outcome,
    phaseState: resumed?.state ?? 'missing',
    resolvedFacts: resolvedFacts.length,
    openCount: ctx.attention.listOpen().length,
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
