#!/usr/bin/env node
/** Loader-driver for the durable task provider: boot the real `cordis.yml`
 * (the full storage stack, recipe registry, journal, deliverables, and the
 * task-local provider), then drive one full lifecycle with deliverable-validated
 * submissions, stale-input rejection, gate result dedupe, journal facts, and a
 * restart on the same medium, streaming one JSON projection on stdout. Imports
 * the built package roots so plain-Node lib mode never loads decorator-bearing
 * source. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { EMPTY_TEMPLATE_RECIPE_ID } from '@deepseek-ai/dsh-recipe'
import { SubmissionId, TaskError } from '@deepseek-ai/dsh-task'
import { DeliverableId } from '@deepseek-ai/dsh-deliverable-local'
import type { PhaseSubmission } from '@deepseek-ai/dsh-task/types'
import type { Context } from '@deepseek-ai/cordis'

/** One driver run's streamed projection. */
interface Projection {
  accepted: boolean
  staleInput: string[]
  registeredInputs: number
  dedupedGates: number
  completedState: string
  journalSeq: number
  taskFacts: number
  eventsSeen: number
  restartState: string
  restartJournalSeq: number
  restartGates: number
  restartInputs: number
}

const NAME = 'task-local-e2e-driver'
const [configArg] = process.argv.slice(2)
if (configArg === undefined || configArg.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const root = await mkdtemp(join(tmpdir(), 'dsh-task-local-e2e-'))
process.env.DSH_TASK_LOCAL_E2E_ROOT = root
const uninstallFailLoud = installFailLoud(NAME)

/** Drive one full task lifecycle through the booted task service. */
async function lifecycle(ctx: Context) {
  const tasks = ctx.tasks
  const created = await tasks.createTask(EMPTY_TEMPLATE_RECIPE_ID, 'w-1', NAME, 'create-k')
  await tasks.startTask(created.taskId, { actor: NAME, reason: 'e2e', expectedRevision: 1, idempotencyKey: 'k-start' })
  const run = await tasks.createTaskRun(created.taskId, { actor: NAME, reason: 'e2e', expectedRevision: 2, idempotencyKey: 'k-run' })
  const phaseRun = await tasks.createPhaseRun(run.runId, 'main', { actor: NAME, reason: 'e2e', expectedRevision: 1, idempotencyKey: 'k-phase' })
  await tasks.startPhaseRun(phaseRun.phaseRunId, { actor: NAME, reason: 'e2e', expectedRevision: 1, idempotencyKey: 'k-phase-start' })
  return { created, run, phaseRun }
}

try {
  loadEnv(NAME)
  const ctx = await boot(NAME, resolveConfigPath(configArg, undefined))
  let eventsSeen = 0
  ctx.on('task/updated', () => { eventsSeen += 1 }, { global: true })
  const tasks = ctx.tasks
  const deliverables = ctx.deliverables
  const journal = ctx.workbenchJournal

  const input = await deliverables.saveVersion(DeliverableId('brief'), null, null)
  const submissionId = SubmissionId('sub-e2e-1')
  const output = await deliverables.saveVersion(DeliverableId('design-doc'), null, submissionId)
  const { created, run, phaseRun } = await lifecycle(ctx)
  const submission: PhaseSubmission = {
    submissionId,
    taskId: created.taskId,
    taskRunId: run.runId,
    phaseRunId: phaseRun.phaseRunId,
    phaseId: 'main',
    attempt: 1,
    pinnedRecipe: created.pinnedRecipe,
    sourceSessionId: 'e2e-session',
    sourceSeqRange: { start: 1, end: 5 },
    inputVersions: [{ deliverableId: DeliverableId('brief'), versionId: input.versionId }],
    outputVersions: [{ deliverableId: DeliverableId('design-doc'), versionId: output.versionId }],
    unresolvedIssues: [],
    result: 'completed',
    idempotencyKey: 'sub-e2e-k-1',
    submittedAt: Date.now(),
  }
  // Caller claims false currency; the provider derives the truth from the
  // deliverable service inside the write chain, so this is accepted anyway.
  await tasks.recordSubmission(submission, {
    submittedBy: NAME,
    sourceSeqPersisted: true,
    inputsCurrent: false,
    outputsValid: false,
  })
  const accepted = true

  let staleInput: string[] = []
  try {
    await deliverables.invalidateDownstream([input.versionId])
    await tasks.recordSubmission({ ...submission, submissionId: SubmissionId('sub-e2e-2'), idempotencyKey: 'sub-e2e-k-2', attempt: 2 }, {
      submittedBy: NAME,
      sourceSeqPersisted: true,
      inputsCurrent: true,
      outputsValid: true,
    })
  } catch (error) {
    staleInput = error instanceof TaskError ? [...error.problems ?? []] : ['none']
  }
  const registeredInputs = deliverables.listCurrentInputs(phaseRun.phaseRunId).length

  const gated = await tasks.startGate(submissionId, { actor: NAME, reason: 'e2e', expectedRevision: 3, idempotencyKey: 'k-gate' })
  const gate = { submissionId, checkId: 'main-submission-complete', passed: true, recordedAt: 424242 }
  await tasks.recordGateCheck(gate)
  await tasks.recordGateCheck(gate)
  const dedupedGates = (await tasks.listGateResults(submissionId)).length
  await tasks.markPhasePassed(gated.phaseRunId, { actor: NAME, reason: 'e2e', expectedRevision: 4, idempotencyKey: 'k-pass' })
  const completed = await tasks.completeTask(created.taskId, { actor: NAME, reason: 'e2e', expectedRevision: 3, idempotencyKey: 'k-complete' })
  const journalSeq = journal.checkpoint().journalSeq
  const taskFacts = journal.replay(0).filter(fact => fact.kind === 'task/updated').length

  // Restart on the same medium: dispose the whole app, boot again on the
  // same root, and observe recovery of projections, journal, gate results,
  // and phase-input registration.
  await ctx.fiber.dispose()
  const ctx2 = await boot(NAME, resolveConfigPath(configArg, undefined))
  const tasks2 = ctx2.tasks
  const recovered = await tasks2.getTask(created.taskId)
  const restartGates = (await tasks2.listGateResults(submissionId)).length
  const restartInputs = ctx2.deliverables.listCurrentInputs(phaseRun.phaseRunId).length
  const restartJournalSeq = ctx2.workbenchJournal.checkpoint().journalSeq
  await ctx2.fiber.dispose()

  const projection: Projection = {
    accepted,
    staleInput,
    registeredInputs,
    dedupedGates,
    completedState: completed.state,
    journalSeq,
    taskFacts,
    eventsSeen,
    restartState: recovered?.state ?? 'missing',
    restartJournalSeq,
    restartGates,
    restartInputs,
  }
  console.log(JSON.stringify(projection))
} catch (error) {
  console.error(String(error))
  process.exitCode = 1
} finally {
  uninstallFailLoud()
  await rm(root, { recursive: true, force: true })
}
