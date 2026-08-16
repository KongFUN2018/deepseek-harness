import { useState } from 'react'
import type { TaskRecord } from '@deepseek-ai/dsh-task/types'
import { Button, Input, Modal, StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.footer.action' entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { TaskDetailState } from './detail.ts'
import { NS } from './locales.ts'
import css from './TaskDetailAction.module.css'

/**
 * Registrant-private injected share (assembled in apply): the detail state
 * as a hooks-compartment source (bound to `useDetail`), plus the load
 * callback over the controller. Plain data and callbacks only.
 */
export interface TaskDetailActionInjected {
  /** Detail state source; the renderer binds it to the useDetail selector hook. */
  hooks: { detail: HostObservable<TaskDetailState> }
  /** Load one task's projection, phase runs, and gate verdicts. */
  load: (taskId: string) => void
}

/** Full props for the sidebar-foot detail trigger and panel. */
export type TaskDetailActionProps =
  PropsRuntime<'sidebar.footer.action'> & PropsLocale<typeof NS> & InjectFace<TaskDetailActionInjected>

/** Closed-union exhaustiveness fence for the wire task-state set. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a state is forged */
function assertNever(value: never): never {
  throw new Error(`unhandled task state: ${JSON.stringify(value)}`)
}

/** Status marker semantics for the task row. */
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

/**
 * Render the sidebar-foot detail trigger and, when open, the per-task panel.
 * @param props - composed slot props (owner wide state, locale, inject face).
 * @returns the trigger element; the open panel portals through Modal.
 */
export function TaskDetailAction(props: TaskDetailActionProps) {
  const { wide, t, useDetail, load } = props
  const [open, setOpen] = useState(false)
  const [taskId, setTaskId] = useState('')
  const detail = useDetail(state => state)
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
          <div className={css.search}>
            <Input value={taskId} placeholder={t('placeholder')} onChange={(event) => { setTaskId(event.target.value) }} />
            <Button size="sm" variant="primary" disabled={taskId.trim() === ''} onClick={() => { load(taskId.trim()) }}>{t('load')}</Button>
          </div>
          {detail.status === 'idle' && <p className={css.statusLine}>{t('empty')}</p>}
          {detail.status === 'loading' && <p className={css.statusLine}>{t('loading')}</p>}
          {detail.status === 'failed' && (
            <p className={css.errorLine} role="alert">
              {detail.error === 'not-found' ? t('not-found') : t('error.load', { code: detail.error ?? '' })}
            </p>
          )}
          {detail.status === 'ready' && detail.task !== undefined && (
            <div className={css.body}>
              <div className={css.taskRow}>
                <StateDot state={dotState(detail.task.state)} className={css.rowDot} />
                <span className={css.itemId}>{detail.task.taskId}</span>
                <span className={css.meta}>{detail.task.state} · {t('revision', { revision: detail.task.revision })}</span>
              </div>
              <p className={css.section}>{t('phases')}</p>
              {detail.phaseRuns.length === 0 && <p className={css.statusLine}>{t('none')}</p>}
              <ul className={css.list}>
                {detail.phaseRuns.map(phase => (
                  <li key={String(phase.phaseRunId)} className={css.row}>
                    <span className={css.itemId}>{phase.phaseId}</span>
                    <span className={css.meta}>{phase.state} · {t('revision', { revision: phase.revision })}</span>
                  </li>
                ))}
              </ul>
              <p className={css.section}>{t('gates')}</p>
              {detail.gateResults.length === 0 && <p className={css.statusLine}>{t('none')}</p>}
              <ul className={css.list}>
                {detail.gateResults.map(gate => (
                  <li key={`${String(gate.submissionId)}:${gate.checkId}`} className={css.row}>
                    <span className={css.itemId}>{gate.checkId}</span>
                    <span className={css.meta}>{gate.passed ? t('passed') : t('failed')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}
