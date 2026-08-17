/**
 * Task detail object layer: a React-free controller that loads one task
 * projection on demand through the tasks Remote, then its phase runs and the
 * gate verdicts of each phase's active submission. The component layer reads
 * only the store snapshot and the load callback; the journal-backed host
 * projections stay the single authority (a failed load records the code).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated tasks Remote namespace into this compilation program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { GateCheckResult, PhaseRunRecord, TaskRecord } from '@deepseek-ai/dsh-task/types'
import type { TaskDigest } from '@deepseek-ai/dsh-digest/types'

/** Lifecycle of the detail panel's load. */
export type TaskDetailStatus = 'idle' | 'loading' | 'ready' | 'failed'

/** Snapshot state the detail component renders. */
export interface TaskDetailState {
  /** Load status of the detail projection. */
  readonly status: TaskDetailStatus
  /** The loaded task projection, present once ready. */
  readonly task?: TaskRecord | undefined
  /** Phase runs of the task's current run, in recording order. */
  readonly phaseRuns: readonly PhaseRunRecord[]
  /** Gate verdicts across the loaded phase runs, in recording order. */
  readonly gateResults: readonly GateCheckResult[]
  /** Journal-derived digest of the task: run branches and timeline; absent when the digest read fails. */
  readonly digest: TaskDigest | undefined
  /** Failure code of the last failed load. */
  readonly error?: string | undefined
}

/**
 * The detail panel's state owner. Created once per plugin fiber in `apply`;
 * the snapshot store it exposes is the inject `hooks` source.
 */
export class TaskDetailController {
  /** The detail's snapshot source; per-task projection plus load state. */
  readonly store: SnapshotStore<TaskDetailState>

  private readonly ctx: ClientContext

  /**
   * @param ctx - owning client root context; loads ride this fiber's lifetime.
   */
  constructor(ctx: ClientContext) {
    this.ctx = ctx
    this.store = createSnapshotStore<TaskDetailState>({ status: 'idle', phaseRuns: [], gateResults: [], digest: undefined })
  }

  /**
   * Load one task, its phase runs, and the gate verdicts of each active
   * submission on demand. A missing task lands in the not-found error state.
   * @param taskId - the task to inspect.
   * @returns when the load settles; failures land in the state's error.
   */
  async load(taskId: string): Promise<void> {
    const id = taskId.trim()
    if (id === '') return
    this.store.set({ status: 'loading', phaseRuns: [], gateResults: [], digest: undefined })
    const task = await this.ctx.remote.tasks.getTask(id)
    if (!task.ok) {
      this.store.set({ status: 'failed', error: task.error.code, phaseRuns: [], gateResults: [], digest: undefined })
      return
    }
    if (task.value === undefined) {
      this.store.set({ status: 'failed', error: 'not-found', phaseRuns: [], gateResults: [], digest: undefined })
      return
    }
    const runId = task.value.currentRunId
    const phases = runId === undefined
      ? { ok: true as const, value: [] as PhaseRunRecord[] }
      : await this.ctx.remote.tasks.listPhaseRuns(String(runId))
    if (!phases.ok) {
      this.store.set({ status: 'failed', error: phases.error.code, task: task.value, phaseRuns: [], gateResults: [], digest: undefined })
      return
    }
    const gateResults: GateCheckResult[] = []
    for (const phase of phases.value) {
      if (phase.activeSubmissionId === undefined) continue
      const gates = await this.ctx.remote.tasks.listGateResults(String(phase.activeSubmissionId))
      if (gates.ok) gateResults.push(...gates.value)
    }
    // The digest rides the same load as an enrichment: a failed digest read
    // keeps the projection usable without run branches and timeline.
    const digestResult = await this.ctx.remote.digest.digest(id)
    const digest = digestResult.ok ? digestResult.value : undefined
    this.store.set({ status: 'ready', task: task.value, phaseRuns: phases.value, gateResults, digest, error: undefined })
  }
}
