#!/usr/bin/env node
/** Loader-driver for the task service: boot the real `cordis.yml` (which
 * loads the recipe registry), mount the abstract TaskHandle on a driver-local
 * in-memory provider, and drive one full lifecycle plus the acceptance
 * rejections, streaming one JSON projection. Imports the built package root
 * so plain-Node lib mode never loads decorator-bearing source. */

import type { Context } from '@deepseek-ai/cordis'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { EMPTY_TEMPLATE_RECIPE_ID } from '@deepseek-ai/dsh-recipe'
import { TaskError, TaskHandle } from '@deepseek-ai/dsh-task'
import type {
  GateCheckResult,
  PhaseRunId,
  PhaseRunRecord,
  PhaseSubmission,
  SubmissionId,
  TaskId,
  TaskRunId,
  TaskRunRecord,
  TaskRecord,
  WriteProvenance,
} from '@deepseek-ai/dsh-task/types'

/** In-memory TaskHandle storage; the durable provider lands with task-local. */
class DriverTaskStore extends TaskHandle {
  private readonly tasks = new Map<string, TaskRecord>()
  private readonly runs = new Map<string, TaskRunRecord>()
  private readonly phaseRuns = new Map<string, PhaseRunRecord>()
  private readonly submissions = new Map<string, PhaseSubmission>()
  private readonly gateResults: GateCheckResult[] = []

  protected async loadTask(taskId: TaskId): Promise<TaskRecord | undefined> {
    return this.tasks.get(taskId)
  }

  protected async loadTaskByIdempotencyKey(key: string): Promise<TaskRecord | undefined> {
    return [...this.tasks.values()].find(task => task.idempotencyKey === key)
  }

  protected async loadAllTasks(): Promise<TaskRecord[]> {
    return [...this.tasks.values()]
  }

  protected async saveTask(task: TaskRecord, _provenance: WriteProvenance): Promise<boolean> {
    return this.cas(this.tasks, task.taskId, task)
  }

  protected async loadRun(runId: TaskRunId): Promise<TaskRunRecord | undefined> {
    return this.runs.get(runId)
  }

  protected async saveRun(run: TaskRunRecord, _provenance: WriteProvenance): Promise<boolean> {
    return this.cas(this.runs, run.runId, run)
  }

  protected async loadPhaseRun(phaseRunId: PhaseRunId): Promise<PhaseRunRecord | undefined> {
    return this.phaseRuns.get(phaseRunId)
  }

  protected async loadPhaseRunsOfRun(runId: TaskRunId): Promise<PhaseRunRecord[]> {
    return [...this.phaseRuns.values()].filter(phase => phase.runId === runId)
  }

  protected async savePhaseRun(phaseRun: PhaseRunRecord, _provenance: WriteProvenance): Promise<boolean> {
    return this.cas(this.phaseRuns, phaseRun.phaseRunId, phaseRun)
  }

  protected async loadSubmission(submissionId: SubmissionId): Promise<PhaseSubmission | undefined> {
    return this.submissions.get(submissionId)
  }

  protected async loadSubmissionByIdempotencyKey(key: string): Promise<PhaseSubmission | undefined> {
    return [...this.submissions.values()].find(submission => submission.idempotencyKey === key)
  }

  protected async saveSubmission(submission: PhaseSubmission, _provenance: WriteProvenance): Promise<void> {
    this.submissions.set(submission.submissionId, submission)
  }

  protected async loadGateResults(submissionId: SubmissionId): Promise<GateCheckResult[]> {
    return this.gateResults.filter(result => result.submissionId === submissionId)
  }

  protected async staleGateChecks(
    submissionId: SubmissionId,
    checkIds: readonly string[],
    _provenance: WriteProvenance,
  ): Promise<GateCheckResult[]> {
    const wanted = new Set(checkIds)
    const staled: GateCheckResult[] = []
    for (const result of this.gateResults) {
      if (result.submissionId !== submissionId || !wanted.has(result.checkId) || result.stale === true) continue
      const next: GateCheckResult = { ...result, stale: true }
      this.gateResults[this.gateResults.indexOf(result)] = next
      staled.push(next)
    }
    return staled
  }

  protected async saveGateResult(result: GateCheckResult, _provenance: WriteProvenance): Promise<void> {
    this.gateResults.push(result)
  }

  private cas<V extends { readonly revision: number }>(map: Map<string, V>, key: string, next: V): boolean {
    const stored = map.get(key)
    if (stored !== undefined && stored.revision !== next.revision - 1) return false
    map.set(key, next)
    return true
  }
}

const NAME = 'task-test-driver'
const [configPath] = process.argv.slice(2)
if (configPath === undefined || configPath.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const uninstallFailLoud = installFailLoud(NAME)
let ctx: Context | undefined
try {
  loadEnv(NAME)
  ctx = await boot(NAME, resolveConfigPath(configPath, undefined))
  const store = new DriverTaskStore(ctx)
  const mutation = (expectedRevision: number) => ({
    actor: NAME,
    reason: 'e2e',
    expectedRevision,
    idempotencyKey: `e2e-${expectedRevision}`,
  })

  let unknownRecipe = ''
  try {
    await store.createTask('ghost-recipe', 'w-1', NAME, 'ghost-k')
  } catch (error) {
    unknownRecipe = error instanceof TaskError ? error.code : 'none'
  }

  const created = await store.createTask(EMPTY_TEMPLATE_RECIPE_ID, 'w-1', NAME, 'create-k')
  await store.startTask(created.taskId, mutation(1))
  const run = await store.createTaskRun(created.taskId, mutation(2))
  const phaseRun = await store.createPhaseRun(run.runId, 'main', mutation(1))
  await store.startPhaseRun(phaseRun.phaseRunId, mutation(1))
  const submission: PhaseSubmission = {
    submissionId: crypto.randomUUID() as SubmissionId,
    taskId: created.taskId,
    taskRunId: run.runId,
    phaseRunId: phaseRun.phaseRunId,
    phaseId: 'main',
    attempt: 1,
    pinnedRecipe: created.pinnedRecipe,
    sourceSessionId: 'e2e-session',
    sourceSeqRange: { start: 1, end: 5 },
    inputVersions: [],
    outputVersions: [],
    unresolvedIssues: [],
    result: 'completed',
    idempotencyKey: 'e2e-sub-1',
    submittedAt: Date.now(),
  }
  const rejected = await store.recordSubmission(submission, {
    submittedBy: NAME,
    sourceSeqPersisted: false,
    inputsCurrent: true,
    outputsValid: true,
  }).then(() => ({ code: '', problems: [] as string[] }), (error: unknown) => ({
    code: error instanceof TaskError ? error.code : 'none',
    problems: error instanceof TaskError ? [...error.problems ?? []] : [],
  }))
  const stored = await store.recordSubmission(submission, {
    submittedBy: NAME,
    sourceSeqPersisted: true,
    inputsCurrent: true,
    outputsValid: true,
  })
  const replay = await store.recordSubmission(submission, {
    submittedBy: NAME,
    sourceSeqPersisted: true,
    inputsCurrent: true,
    outputsValid: true,
  })
  const gated = await store.startGate(stored.submissionId, mutation(3))
  await store.recordGateCheck({
    submissionId: stored.submissionId,
    checkId: 'main-submission-complete',
    passed: true,
    recordedAt: Date.now(),
  })
  const passed = await store.markPhasePassed(gated.phaseRunId, mutation(4))
  const completed = await store.completeTask(created.taskId, mutation(3))

  process.stdout.write(`${JSON.stringify({
    pinned: {
      recipeId: created.pinnedRecipe.recipeId,
      revision: created.pinnedRecipe.revision,
      hashLength: created.pinnedRecipe.contentHash.length,
    },
    lifecycle: { task: completed.state, phase: passed.state, gate: gated.state },
    rejected,
    replayEqual: replay.submissionId === stored.submissionId,
    unknownRecipe,
  })}\n`)
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  await ctx?.fiber.dispose()
  uninstallFailLoud()
}
