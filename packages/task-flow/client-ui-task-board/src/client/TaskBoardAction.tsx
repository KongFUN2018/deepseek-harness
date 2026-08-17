import type { TaskRecord } from '@deepseek-ai/dsh-task/types'
import { Button, StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the drawer shell's SlotMap merge (the 'workbench.drawer.tasks' seat).
import type {} from '@deepseek-ai/dsh-client-ui-workbench-drawer/client'
import { verbsFor, type PhaseProgress, type TaskBoardState, type TaskBoardVerb } from './board.ts'
import { NS } from './locales.ts'
import css from './TaskBoardAction.module.css'

/**
 * Registrant-private injected share (assembled in apply): the board state as
 * a hooks-compartment source (bound to `useBoard`), plus the refresh and
 * command callbacks over the controller. Plain data and callbacks only.
 */
export interface TaskBoardActionInjected {
  /** Board state source; the renderer binds it to the useBoard selector hook. */
  hooks: { board: HostObservable<TaskBoardState> }
  /** Reload the task list from the tasks Remote. */
  refresh: () => void
  /** Issue one pause/resume/cancel verb against a task row. */
  command: (taskId: string, verb: TaskBoardVerb) => void
}

/** Full props for the drawer's task-list tab body. */
export type TaskBoardActionProps =
  PropsRuntime<'workbench.drawer.tasks'> & PropsLocale<typeof NS> & InjectFace<TaskBoardActionInjected>

/** Closed-union exhaustiveness fence for the wire state set. */
function assertNever(value: never): never {
  /* v8 ignore next -- unreachable while the wire state union stays closed */
  throw new Error(`unhandled task state: ${JSON.stringify(value)}`)
}

/** Status marker semantics for one task row. */
function dotState(state: TaskRecord['state']): StateDotState {
  switch (state) {
    case 'planning': return 'ongoing'
    case 'running': return 'ongoing'
    case 'completed': return 'done'
    case 'failed': return 'error'
    case 'awaiting-input': return 'warning'
    case 'awaiting-decision': return 'warning'
    case 'pausing': return 'warning'
    case 'paused': return 'warning'
    case 'cancelling': return 'warning'
    case 'cancelled': return 'warning'
    /* v8 ignore next -- closed wire state union */
    default: return assertNever(state)
  }
}

/** Human status word for one task row. */
function stateLabel(state: TaskRecord['state'], t: TranslateNS<typeof NS>): string {
  switch (state) {
    case 'planning': return t('state.planning')
    case 'running': return t('state.running')
    case 'awaiting-input': return t('state.awaiting-input')
    case 'awaiting-decision': return t('state.awaiting-decision')
    case 'pausing': return t('state.pausing')
    case 'paused': return t('state.paused')
    case 'cancelling': return t('state.cancelling')
    case 'cancelled': return t('state.cancelled')
    case 'completed': return t('state.completed')
    case 'failed': return t('state.failed')
    /* v8 ignore next -- closed wire state union */
    default: return assertNever(state)
  }
}

/** One task row: state dot, identity, recipe, phase progress, and verb buttons. */
function TaskRow({ task, progress, t, onCommand, onOpen }: {
  task: TaskRecord
  progress: PhaseProgress | undefined
  t: TranslateNS<typeof NS>
  onCommand: (taskId: string, verb: TaskBoardVerb) => void
  onOpen: (taskId: string) => void
}) {
  const verbs = verbsFor(task)
  return (
    <li
      className={css.row}
      tabIndex={0}
      role="button"
      aria-label={t('open', { taskId: task.taskId })}
      onClick={() => { onOpen(task.taskId) }}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen(task.taskId) }}
    >
      <StateDot state={dotState(task.state)} className={css.rowDot} />
      <div className={css.rowMain}>
        <span className={css.taskId}>{task.taskId}</span>
        <span className={css.meta}>
          {stateLabel(task.state, t)} · {t('revision', { revision: task.revision })}
          {' '}· {t('recipe', { recipeId: String(task.pinnedRecipe.recipeId) })}
          {progress !== undefined && progress.total > 0 && [' · ', t('phase.progress', { current: String(progress.current), total: String(progress.total) })]}
        </span>
      </div>
      {verbs.length > 0 && (
        <div className={css.verbs}>
          {verbs.map(verb => (
            <Button key={verb} size="sm" variant="ghost" onClick={(event) => {
              event.stopPropagation()
              onCommand(task.taskId, verb)
            }}>
              {t(`verb.${verb}` as const)}
            </Button>
          ))}
        </div>
      )}
    </li>
  )
}

/**
 * Render the drawer's task-list tab body: the cross-session task list with
 * per-row verbs; opening a row switches the drawer to that task's detail.
 * @param props - composed slot props (owner openDetail, locale, inject face).
 * @returns the task list panel filling the drawer's tab body.
 */
export function TaskBoardAction(props: TaskBoardActionProps) {
  const { openDetail, openInbox, t, useBoard, refresh, command } = props
  const board = useBoard(state => state)
  return (
    <div className={css.panel}>
      {board.status === 'loading' && <p className={css.statusLine}>{t('loading')}</p>}
      {board.metrics !== undefined && (
        <div className={css.kpiRow}>
          <div className={css.kpiCard}>
            <span className={css.kpiValue}>{board.metrics.live}</span>
            <span className={css.kpiLabel}>{t('kpi.live')}</span>
          </div>
          <button type="button" className={css.kpiCard} onClick={openInbox}>
            <span className={css.kpiValue}>{board.metrics.gate}</span>
            <span className={css.kpiLabel}>{t('kpi.gate')}</span>
          </button>
          <button type="button" className={css.kpiCard} onClick={openInbox}>
            <span className={css.kpiValue}>{board.metrics.ask}</span>
            <span className={css.kpiLabel}>{t('kpi.ask')}</span>
          </button>
          <div className={css.kpiCard}>
            <span className={css.kpiValue}>{board.metrics.asset}</span>
            <span className={css.kpiLabel}>{t('kpi.asset')}</span>
          </div>
        </div>
      )}
      {board.error !== undefined && (
        <p className={css.errorLine} role="alert">
          {t(board.status === 'failed' ? 'error.load' : 'error.command', { code: board.error })}
        </p>
      )}
      {board.status !== 'loading' && board.tasks.length === 0 && <p className={css.statusLine}>{t('empty')}</p>}
      {board.tasks.length > 0 && (
        <ul className={css.list}>
          {board.tasks.map(task => (
            <TaskRow
              key={task.taskId}
              task={task}
              progress={board.phaseProgress.get(String(task.taskId))}
              t={t}
              onCommand={command}
              onOpen={openDetail}
            />
          ))}
        </ul>
      )}
      <div className={css.footer}>
        <Button size="sm" variant="outline" onClick={refresh}>{t('refresh')}</Button>
      </div>
    </div>
  )
}
