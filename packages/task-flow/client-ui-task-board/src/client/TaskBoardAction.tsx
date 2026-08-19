import { useState } from 'react'
import type { GatePassRate, WorkbenchMetrics } from '@deepseek-ai/dsh-metrics/types'
import type { TaskRecord } from '@deepseek-ai/dsh-task/types'
import { Button, StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the drawer shell's SlotMap merge (the 'workbench.drawer.tasks' seat).
import type {} from '@deepseek-ai/dsh-client-ui-workbench-drawer/client'
import { verbsFor, type GatePause, type PhaseProgress, type TaskBoardState, type TaskBoardVerb } from './board.ts'
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
  /** Reload the task list from the tasks Remote; resolves when the load settles. */
  refresh: () => Promise<void>
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

/** One task row: state dot, identity, recipe, phase progress, gate pause, verbs. */
function TaskRow({ task, progress, gate, t, onCommand, onOpen }: {
  task: TaskRecord
  progress: PhaseProgress | undefined
  gate: GatePause
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
          {gate !== undefined && <span className={css.gateBadge}>{t('gate.badge', { kind: gate })}</span>}
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
 * Token-only charts under the KPI row: a last-7-day throughput sparkline and
 * per-class Gate pass-rate bars, both derived from the loaded metrics.
 * @param metrics - the loaded workbench metrics projection.
 * @param t - board namespace translate.
 */
function MetricsCharts({ metrics, t }: { metrics: WorkbenchMetrics; t: TranslateNS<typeof NS> }) {
  const w = 160
  const h = 44
  const days = metrics.throughput
  const max = days.reduce((peak, day) => Math.max(peak, day.completedPhases), 0)
  const pts = days.map((day, i) => {
    const x = days.length === 1 ? w / 2 : w * (i / (days.length - 1))
    const y = max === 0 ? h : h - (h * day.completedPhases) / max
    return '' + x + ',' + y
  }).join(' ')
  const rate: [keyof GatePassRate, 'A' | 'B' | 'C'][] = [['a', 'A'], ['b', 'B'], ['c', 'C']]
  return (
    <div className={css.chartRow}>
      <div className={css.chartCard}>
        <span className={css.chartTitle}>{t('chart.throughput')}</span>
        {pts !== '' ? (
          <svg className={css.sparkline} viewBox={'0 0 ' + w + ' ' + h} role="img" aria-label={t('chart.throughput')}>
            <polyline points={pts} fill="none" className={css.sparkLine} />
          </svg>
        ) : (
          <span className={css.chartEmpty}>{t('kpi.empty')}</span>
        )}
        <span className={css.chartHint}>{t('chart.throughputHint')}</span>
      </div>
      <div className={css.chartCard}>
        <span className={css.chartTitle}>{t('chart.gateRate')}</span>
        <div className={css.bars} role="img" aria-label={t('chart.gateRate')}>
          {rate.map(([key, label]) => {
            const pct = Math.round((metrics.gatePassRate[key] ?? 0) * 100)
            return (
              <div key={key} className={css.barCol}>
                <div className={css.barTrack}>
                  <div className={css.barFill} style={{ height: pct + '%' }} />
                </div>
                <span className={css.barLabel}>{label} {pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
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
  // Refresh is an explicit user gesture: the button shows a brief ongoing
  // state, then a "synced" confirmation, so a click that re-reads unchanged
  // data still gives visible feedback.
  const [refreshing, setRefreshing] = useState(false)
  const [syncedAt, setSyncedAt] = useState<number | undefined>(undefined)
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refresh()
      setSyncedAt(Date.now())
    } finally {
      setRefreshing(false)
    }
  }
  return (
    <div className={css.panel}>
      {board.status === 'loading' && <p className={css.statusLine}>{t('loading')}</p>}
      {board.metrics !== undefined && (
        <>
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
          <MetricsCharts metrics={board.metrics} t={t} />
        </>
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
              gate={board.taskGates.get(String(task.taskId))}
              t={t}
              onCommand={command}
              onOpen={openDetail}
            />
          ))}
        </ul>
      )}
      <div className={css.footer}>
        <Button size="sm" variant="outline" disabled={refreshing} onClick={() => { void handleRefresh() }}>
          {refreshing ? t('refreshing') : t('refresh')}
        </Button>
        {syncedAt !== undefined && !refreshing && (
          <span className={css.syncedLine} role="status">
            {t('synced', { time: new Date(syncedAt).toLocaleTimeString() })}
          </span>
        )}
      </div>
    </div>
  )
}
