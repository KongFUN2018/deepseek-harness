import { useEffect, useState } from 'react'
import type { TaskRecord } from '@deepseek-ai/dsh-task/types'
import { Button, StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the drawer shell's SlotMap merge (the 'workbench.drawer.detail' seat).
import type {} from '@deepseek-ai/dsh-client-ui-workbench-drawer/client'
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

/** Full props for the drawer's task-detail tab body. */
export type TaskDetailActionProps =
  PropsRuntime<'workbench.drawer.detail'> & PropsLocale<typeof NS> & InjectFace<TaskDetailActionInjected>

/** Locale keys of the three gate classes, keyed by the GateCheckResult kind. */
const GATE_CLASS_KEYS = { A: 'gate.class.a', B: 'gate.class.b', C: 'gate.class.c' } as const

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
 * Render the drawer's task-detail tab body: the owner-selected task's
 * projection, phase runs, and gate verdicts. A `taskId` change reloads
 * through the controller; no selection renders the empty state.
 * @param props - composed slot props (owner taskId, locale, inject face).
 * @returns the detail panel filling the drawer's tab body.
 */
export function TaskDetailAction(props: TaskDetailActionProps) {
  const { taskId, t, useDetail, load } = props
  const detail = useDetail(state => state)
  const [hint, setHint] = useState<'patch' | 'rewind' | undefined>(undefined)
  useEffect(() => {
    if (taskId !== undefined) load(taskId)
  }, [taskId, load])
  return (
    <div className={css.panel}>
      {taskId === undefined && <p className={css.statusLine}>{t('empty')}</p>}
      {taskId !== undefined && detail.status === 'loading' && <p className={css.statusLine}>{t('loading')}</p>}
      {taskId !== undefined && detail.status === 'failed' && (
        <p className={css.errorLine} role="alert">
          {detail.error === 'not-found' ? t('not-found') : t('error.load', { code: detail.error ?? '' })}
        </p>
      )}
      {taskId !== undefined && detail.status === 'ready' && detail.task !== undefined && (
        <div className={css.body}>
          <div className={css.taskRow}>
            <StateDot state={dotState(detail.task.state)} className={css.rowDot} />
            <span className={css.itemId}>{detail.task.taskId}</span>
            <span className={css.meta}>{detail.task.state} · {t('revision', { revision: detail.task.revision })}</span>
          </div>
          {detail.digest !== undefined && detail.digest.runs.length > 1 && (
            <p className={css.runLine}>
              {t('runs.current', { runId: (detail.digest.runs[0]?.runId ?? '') })}
              {detail.digest.runs.slice(1).map(run => ' · ' + t('runs.archived', { runId: run.runId }))}
            </p>
          )}
          <p className={css.section}>{t('phases')}</p>
          {detail.phaseRuns.length === 0 && <p className={css.statusLine}>{t('none')}</p>}
          <ol className={css.timeline}>
            {detail.phaseRuns.map((phase) => {
              const archived = phase.state === 'superseded' || phase.state === 'stale' || phase.state === 'cancelled'
              return (
                <li key={phase.phaseRunId} className={archived ? css.archivedPhase : undefined}>
                  <span className={css.itemId}>{phase.phaseId}</span>
                  <span className={css.meta}>
                    {phase.state === 'superseded' ? t('phase.superseded') : phase.state}
                    {' '}· {t('revision', { revision: phase.revision })}
                  </span>
                </li>
              )
            })}
          </ol>
          <p className={css.section}>{t('gates')}</p>
          {detail.gateResults.length === 0 && <p className={css.statusLine}>{t('none')}</p>}
          {(['A', 'B', 'C'] as const).map((kind) => {
            const checks = detail.gateResults.filter(gate => (gate.kind ?? 'A') === kind)
            if (checks.length === 0) return null
            return (
              <div key={kind} className={css.gateGroup}>
                <p className={css.gateClass}>{t(GATE_CLASS_KEYS[kind])}</p>
                <ul className={css.list}>
                  {checks.map(gate => (
                    <li key={`${String(gate.submissionId)}:${gate.checkId}`} className={css.row}>
                      <span className={css.itemId}>{gate.checkId}</span>
                      <span className={css.meta}>
                        {gate.passed ? t('passed') : t('failed')}
                        {gate.stale === true ? t('gate.stale') : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
          <div className={css.verbRow}>
            <Button size="sm" variant="outline" onClick={() => { setHint('patch') }}>{t('verb.patch')}</Button>
            <Button size="sm" variant="primary" onClick={() => { setHint('rewind') }}>{t('verb.rewind')}</Button>
          </div>
          {hint !== undefined && (
            <p className={css.hintLine} role="status">{t(hint === 'patch' ? 'hint.patch' : 'hint.rewind')}</p>
          )}
        </div>
      )}
    </div>
  )
}
