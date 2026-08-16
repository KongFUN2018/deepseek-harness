/**
 * Task board object layer: a React-free controller that owns the board's
 * task list state, folds forwarded `task/updated` deliveries against the
 * loaded snapshot's revisions, and issues the pause/resume/cancel verbs
 * through the tasks Remote with compare-and-set revisions. The component
 * layer reads only the store snapshot and the command callbacks; the
 * journal-backed host projections stay the single authority (a failed or
 * dropped delivery resyncs through `refresh()`).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated tasks Remote namespace and the forwarded-event
// key face into this compilation program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { TaskMutationContext, TaskRecord } from '@deepseek-ai/dsh-task/types'

/** Lifecycle of the board's task-list load. */
export type TaskBoardStatus = 'loading' | 'ready' | 'failed'

/** Snapshot state the board component renders. */
export interface TaskBoardState {
  /** Load status of the task list. */
  readonly status: TaskBoardStatus
  /** Known task projections, freshest first; folds keep it revision-coherent. */
  readonly tasks: readonly TaskRecord[]
  /** Failure code of the last failed load or command, shown until the next success. */
  readonly error?: string | undefined
  /** Epoch ms of the last successful load or fold. */
  readonly updatedAt: number
}

/** Monotonic seed for idempotency keys; collisions within a page are impossible. */
let idempotencySeq = 0

/** Fresh idempotency key for one board command. */
function nextIdempotencyKey(verb: string, taskId: string): string {
  idempotencySeq += 1
  return `task-board-${verb}-${taskId}-${Date.now().toString(36)}-${idempotencySeq}`
}

/** Compare-and-set mutation context for one board verb over the row's revision. */
function mutationOf(verb: string, task: TaskRecord): TaskMutationContext {
  return {
    actor: 'task-board',
    reason: `task-board ${verb}`,
    expectedRevision: task.revision,
    idempotencyKey: nextIdempotencyKey(verb, task.taskId),
  }
}

/** Order the board rows: newest creation first, taskId as the stable tiebreak. */
function byCreation(left: TaskRecord, right: TaskRecord): number {
  return right.createdAt - left.createdAt || (left.taskId < right.taskId ? -1 : 1)
}

/** Task states whose row offers Resume; Paused is the only resumable one. */
function resumable(state: TaskRecord['state']): boolean {
  return state === 'paused'
}

/** Task states whose row offers Pause; only an actively running task pauses. */
function pausable(state: TaskRecord['state']): boolean {
  return state === 'running'
}

/** Task states whose row offers Cancel; terminal rows act on nothing. */
function cancellable(state: TaskRecord['state']): boolean {
  return state === 'planning' || state === 'running' || state === 'pausing' || state === 'paused'
}

/** Board verbs; each is gated on the row's current state by the caller. */
export type TaskBoardVerb = 'pause' | 'resume' | 'cancel'

/**
 * Verbs each task state offers the board row.
 * @param task - the task projection whose state gates the verb set.
 * @returns the verbs the row may dispatch, in display order.
 */
export function verbsFor(task: TaskRecord): readonly TaskBoardVerb[] {
  const verbs: TaskBoardVerb[] = []
  if (pausable(task.state)) verbs.push('pause')
  if (resumable(task.state)) verbs.push('resume')
  if (cancellable(task.state)) verbs.push('cancel')
  return verbs
}

/**
 * The board's state owner. Created once per plugin fiber in `apply`; the
 * snapshot store it exposes is the inject `hooks` source, so components
 * subscribe through the renderer-bound hook and never see this object.
 */
export class TaskBoardController {
  /** The board's snapshot source; revision-coherent task list plus load state. */
  readonly store: SnapshotStore<TaskBoardState>

  private readonly ctx: ClientContext

  /**
   * @param ctx - owning client root context; subscriptions and refreshes ride
   * this fiber's lifetime.
   */
  constructor(ctx: ClientContext) {
    this.ctx = ctx
    this.store = createSnapshotStore<TaskBoardState>({ status: 'loading', tasks: [], updatedAt: 0 })
    ctx.effect(() => ctx.remote.$on('task/updated', (task) => { this.fold(task) }), 'task-board: task/updated fold')
    // A reconnect may have missed forwarded deliveries; the projection is
    // authoritative, so resync from the Remote instead of trusting the fold.
    ctx.on('connection/reset', () => { void this.refresh() })
    void this.refresh()
  }

  /**
   * Fold one forwarded task projection: newer revisions replace the row,
   * unknown tasks join the list, and stale or repeated deliveries drop.
   * @param task - the post-commit task projection the host forwarded.
   */
  fold(task: TaskRecord): void {
    const { tasks } = this.store.getSnapshot()
    const index = tasks.findIndex(row => row.taskId === task.taskId)
    const existing = index >= 0 ? tasks[index] : undefined
    if (existing !== undefined && existing.revision >= task.revision) return
    const next = index >= 0 ? tasks.with(index, task) : [...tasks, task]
    next.sort(byCreation)
    this.store.set({ ...this.store.getSnapshot(), tasks: next, updatedAt: Date.now() })
  }

  /**
   * Reload the full task list from the tasks Remote.
   * @returns when the load settles; failures land in the state's error.
   */
  async refresh(): Promise<void> {
    const result = await this.ctx.remote.tasks.listTasks()
    if (!result.ok) {
      this.store.set({ ...this.store.getSnapshot(), status: 'failed', error: result.error.code })
      return
    }
    const tasks = [...result.value].sort(byCreation)
    // A resync keeps any recorded command failure: the line reads as history
    // ("failed with X, since resynced"), and only a later successful command
    // or load-failure code replaces it.
    const { error } = this.store.getSnapshot()
    this.store.set({ status: 'ready', tasks, error, updatedAt: Date.now() })
  }

  /**
   * Issue one board verb against a task row.
   * @param taskId - the row's task id.
   * @param verb - the verb to issue.
   * @returns when the command settles; the row folds on success, and a
   * failure records the code and resyncs through {@link refresh} (the
   * compare-and-set revision is the guard, never a client-side fence).
   */
  async command(taskId: string, verb: TaskBoardVerb): Promise<void> {
    const task = this.store.getSnapshot().tasks.find(row => row.taskId === taskId)
    if (task === undefined) return
    const mutation = mutationOf(verb, task)
    const result = verb === 'pause'
      ? await this.ctx.remote.tasks.requestPause(taskId, mutation)
      : verb === 'resume'
        ? await this.ctx.remote.tasks.resume(taskId, mutation)
        : await this.ctx.remote.tasks.requestCancel(taskId, mutation)
    if (result.ok) {
      this.fold(result.value)
      this.store.set({ ...this.store.getSnapshot(), error: undefined })
      return
    }
    this.store.set({ ...this.store.getSnapshot(), error: result.error.code })
    await this.refresh()
  }
}
