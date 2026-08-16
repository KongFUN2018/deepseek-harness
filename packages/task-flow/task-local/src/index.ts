/**
 * Task-local durable task provider (`ctx.tasks`): implements the TaskHandle
 * storage hooks over one storageDomain unit. Each write appends its journal
 * fact first - the append is the commit point of the write - then persists
 * the projection, so replay rebuilds projections and Cordis events stay
 * droppable wake-ups. Submission acceptance validates deliverable refs
 * inside the task write chain through the injected minimal deliverable
 * service.
 * @module @deepseek-ai/dsh-task-local
 */

import { Service } from '@deepseek-ai/cordis'
import { TaskError, TaskHandle } from '@deepseek-ai/dsh-task'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { JournalPayload } from '@deepseek-ai/dsh-workbench-journal/types'
import '@deepseek-ai/dsh-workbench-journal'
import '@deepseek-ai/dsh-deliverable-minimal'
import { taskFactKey, taskLocalDomainSpec } from './spec.ts'
import type { TaskLocalFactKind } from './types.ts'
import type {
  GateCheckResult,
  PhaseRunId,
  PhaseRunRecord,
  PhaseSubmission,
  SubmissionEnvironmentFacts,
  SubmissionId,
  TaskId,
  TaskRecord,
  TaskRunId,
  TaskRunRecord,
  WriteProvenance,
} from '@deepseek-ai/dsh-task/types'

export type * from './types.ts'
export {
  taskFactKey,
  taskLocalDomainSpec,
  gateResultsSchema,
  phaseRunRecordSchema,
  phaseSubmissionSchema,
  taskRecordSchema,
  taskRunRecordSchema,
} from './spec.ts'

/** One journal fact the task write chain appends at the commit point of a write. */
interface FactInput {
  readonly kind: TaskLocalFactKind
  readonly taskId: TaskId
  readonly entityId: string
  readonly entityRevision: number
  readonly provenance: WriteProvenance
  /** JSON value at the wire boundary; branded record ids widen to plain strings here. */
  readonly payload: unknown
}

/** Durable TaskHandle provider over one storageDomain unit. */
export class LocalTaskService extends TaskHandle {
  /** The provider opens its domain, the journal, and the deliverable service. */
  static inject = ['storageDomain', 'workbenchJournal', 'deliverables']

  private tasks?: KvTable<string, TaskRecord>
  private runs?: KvTable<string, TaskRunRecord>
  private phaseRuns?: KvTable<string, PhaseRunRecord>
  private submissions?: KvTable<string, PhaseSubmission>
  private gateResults?: KvTable<string, GateCheckResult[]>

  /**
   * @param ctx - Host context carrying the storage-domain facility, the
   * workbench journal, and the deliverable service.
   */
  /** Open and own the task-local domain tables. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(taskLocalDomainSpec)
    this.ctx.effect(() => async () => {
      await domain.close()
    }, 'task-local.domainClose')
    this.tasks = domain.table('tasks')
    this.runs = domain.table('task_runs')
    this.phaseRuns = domain.table('phase_runs')
    this.submissions = domain.table('submissions')
    this.gateResults = domain.table('gate_results')
  }

  protected loadTask(taskId: TaskId): Promise<TaskRecord | undefined> {
    return Promise.resolve(this.require(this.tasks).get(taskId))
  }

  protected loadTaskByIdempotencyKey(key: string): Promise<TaskRecord | undefined> {
    for (const [, task] of this.require(this.tasks).entries()) {
      if (task.idempotencyKey === key) return Promise.resolve(task)
    }
    return Promise.resolve(undefined)
  }

  protected loadAllTasks(): Promise<TaskRecord[]> {
    return Promise.resolve([...this.require(this.tasks).entries()].map(([, task]) => task))
  }

  protected async saveTask(task: TaskRecord, provenance: WriteProvenance): Promise<boolean> {
    const stored = this.require(this.tasks).get(task.taskId)
    if (stored !== undefined && stored.revision !== task.revision - 1) return false
    await this.appendFact({
      kind: 'task/updated',
      taskId: task.taskId,
      entityId: task.taskId,
      entityRevision: task.revision,
      provenance,
      payload: task,
    })
    await this.require(this.tasks).put(task.taskId, task)
    return true
  }

  protected loadRun(runId: TaskRunId): Promise<TaskRunRecord | undefined> {
    return Promise.resolve(this.require(this.runs).get(runId))
  }

  protected async saveRun(run: TaskRunRecord, provenance: WriteProvenance): Promise<boolean> {
    const stored = this.require(this.runs).get(run.runId)
    if (stored !== undefined && stored.revision !== run.revision - 1) return false
    await this.appendFact({
      kind: 'task-run/updated',
      taskId: run.taskId,
      entityId: run.runId,
      entityRevision: run.revision,
      provenance,
      payload: run,
    })
    await this.require(this.runs).put(run.runId, run)
    return true
  }

  protected loadPhaseRun(phaseRunId: PhaseRunId): Promise<PhaseRunRecord | undefined> {
    return Promise.resolve(this.require(this.phaseRuns).get(phaseRunId))
  }

  protected loadPhaseRunsOfRun(runId: TaskRunId): Promise<PhaseRunRecord[]> {
    return Promise.resolve([...this.require(this.phaseRuns).entries()]
      .map(([, phase]) => phase)
      .filter(phase => phase.runId === runId))
  }

  protected async savePhaseRun(phaseRun: PhaseRunRecord, provenance: WriteProvenance): Promise<boolean> {
    const stored = this.require(this.phaseRuns).get(phaseRun.phaseRunId)
    if (stored !== undefined && stored.revision !== phaseRun.revision - 1) return false
    await this.appendFact({
      kind: 'phase-run/updated',
      taskId: phaseRun.taskId,
      entityId: phaseRun.phaseRunId,
      entityRevision: phaseRun.revision,
      provenance,
      payload: phaseRun,
    })
    await this.require(this.phaseRuns).put(phaseRun.phaseRunId, phaseRun)
    return true
  }

  protected loadSubmission(submissionId: SubmissionId): Promise<PhaseSubmission | undefined> {
    return Promise.resolve(this.require(this.submissions).get(submissionId))
  }

  protected loadSubmissionByIdempotencyKey(key: string): Promise<PhaseSubmission | undefined> {
    for (const [, submission] of this.require(this.submissions).entries()) {
      if (submission.idempotencyKey === key) return Promise.resolve(submission)
    }
    return Promise.resolve(undefined)
  }

  protected async saveSubmission(submission: PhaseSubmission, provenance: WriteProvenance): Promise<void> {
    await this.appendFact({
      kind: 'submission/recorded',
      taskId: submission.taskId,
      entityId: submission.submissionId,
      entityRevision: 1,
      provenance,
      payload: submission,
    })
    await this.require(this.submissions).put(submission.submissionId, submission)
  }

  protected loadGateResults(submissionId: SubmissionId): Promise<GateCheckResult[]> {
    return Promise.resolve([...this.require(this.gateResults).get(submissionId) ?? []])
  }

  protected async saveGateResult(result: GateCheckResult, provenance: WriteProvenance): Promise<void> {
    const submission = this.require(this.submissions).get(result.submissionId)
    if (submission === undefined) {
      throw new TaskError('not-found', 'submission of a gate check is not stored')
    }
    const existing = this.require(this.gateResults).get(result.submissionId) ?? []
    if (existing.some(stored => sameGateCheck(stored, result))) return
    const next = [...existing, result]
    await this.appendFact({
      kind: 'gate-check/recorded',
      taskId: submission.taskId,
      entityId: result.submissionId,
      entityRevision: next.length,
      provenance,
      payload: result,
    })
    await this.require(this.gateResults).put(result.submissionId, next)
  }

  protected override resolveSubmissionEnvironment(
    submission: PhaseSubmission,
    environment: SubmissionEnvironmentFacts,
  ): Promise<SubmissionEnvironmentFacts> {
    const deliverables = this.ctx.deliverables
    const inputsCurrent = submission.inputVersions.every((ref) => {
      const version = deliverables.getVersion(ref.versionId)
      return version !== undefined && version.deliverableId === ref.deliverableId && version.state === 'current'
    })
    const outputsValid = submission.outputVersions.every((ref) => {
      const version = deliverables.getVersion(ref.versionId)
      return version !== undefined && version.deliverableId === ref.deliverableId
        && version.sourceSubmissionId === submission.submissionId
    })
    return Promise.resolve({ ...environment, inputsCurrent, outputsValid })
  }

  protected override async onSubmissionAccepted(submission: PhaseSubmission): Promise<void> {
    if (submission.inputVersions.length === 0) return
    await this.ctx.deliverables.recordPhaseInputs(
      submission.phaseRunId,
      submission.inputVersions.map(ref => ref.versionId),
    )
  }

  /**
   * Append one journal fact; the durable append is the commit point of
   * the write, so the projection put that follows can rebuild from replay.
   * @param input - the fact fields; the journal assigns the envelope.
   */
  private async appendFact(input: FactInput): Promise<void> {
    await this.ctx.workbenchJournal.append({
      taskId: input.taskId,
      kind: input.kind,
      actor: input.provenance.actor,
      idempotencyKey: taskFactKey(input.kind, input.entityId, input.entityRevision),
      entityRevision: input.entityRevision,
      payload: input.payload as JournalPayload,
    })
  }

  /** The opened table; absent before service start or after disposal. */
  private require<V>(table: KvTable<string, V> | undefined): KvTable<string, V> {
    if (table === undefined) {
      throw new TaskError('invalid-argument', 'task-local storage is not open')
    }
    return table
  }
}

/** Whether two stored gate-check verdicts are the same recording. */
function sameGateCheck(stored: GateCheckResult, result: GateCheckResult): boolean {
  return stored.submissionId === result.submissionId
    && stored.checkId === result.checkId
    && stored.recordedAt === result.recordedAt
}

export default LocalTaskService
