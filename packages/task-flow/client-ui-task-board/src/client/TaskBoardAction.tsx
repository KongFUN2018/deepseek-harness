import { useState } from 'react'
import type { TaskRecord } from '@deepseek-ai/dsh-task/types'
import { Button, Modal, StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.footer.action' entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { verbsFor, type TaskBoardState, type TaskBoardVerb } from './board.ts'
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

/** Full props for the sidebar-foot board trigger and panel. */
export type TaskBoardActionProps =
  PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS> & InjectFace<TaskBoardActionInjected>

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

/** One task row: state dot, identity, state word, revision, and verb buttons. */
function TaskRow({ task, t, onCommand }: {
  task: TaskRecord
  t: TranslateNS<typeof NS>
  onCommand: (taskId: string, verb: TaskBoardVerb) => void
}) {
  const verbs = verbsFor(task)
  return (
    <li className={css.row}>
      <StateDot state={dotState(task.state)} className={css.rowDot} />
      <div className={css.rowMain}>
        <span className={css.taskId}>{task.taskId}</span>
        <span className={css.meta}>{stateLabel(task.state, t)} · {t('revision', { revision: task.revision })}</span>
      </div>
      {verbs.length > 0 && (
        <div className={css.verbs}>
          {verbs.map(verb => (
            <Button key={verb} size="sm" variant="ghost" onClick={() => { onCommand(task.taskId, verb) }}>
              {t(`verb.${verb}` as const)}
            </Button>
          ))}
        </div>
      )}
    </li>
  )
}

/**
 * Render the sidebar-foot board trigger and, when open, the task panel.
 * @param props - composed slot props (owner wide state, locale, inject face).
 * @returns the trigger element; the open panel portals through Modal.
 */
export function TaskBoardAction(props: TaskBoardActionProps) {
  const { wide, t, useBoard, refresh, command } = props
  const [open, setOpen] = useState(false)
  const board = useBoard(state => state)
  return (
    <>
      <button
        type="button"
        className={wide ? css.trigger : css.triggerRail}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(!open) }}
      >
        {t('trigger')}
      </button>
      <Modal open={open} onClose={() => { setOpen(false) }} title={t('title')} closeLabel={t('close')}>
        <div className={css.panel}>
          {board.status === 'loading' && <p className={css.statusLine}>{t('loading')}</p>}
          {board.error !== undefined && (
            <p className={css.errorLine} role="alert">
              {t(board.status === 'failed' ? 'error.load' : 'error.command', { code: board.error })}
            </p>
          )}
          {board.status !== 'loading' && board.tasks.length === 0 && <p className={css.statusLine}>{t('empty')}</p>}
          {board.tasks.length > 0 && (
            <ul className={css.list}>
              {board.tasks.map(task => <TaskRow key={task.taskId} task={task} t={t} onCommand={command} />)}
            </ul>
          )}
          <div className={css.footer}>
            <Button size="sm" variant="outline" onClick={refresh}>{t('refresh')}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
