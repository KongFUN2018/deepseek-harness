import { useCallback, useEffect, useRef, useState } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls ui-layout's SlotMap merge (the 'shell.overlay' entry and
// this package's three drawer seat declarations).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { BadgeState } from './badge.ts'
import { NS } from './locales.ts'
import css from './WorkbenchDrawer.module.css'

/** The drawer's tab ids; each dispatches one declared content seat. */
export type DrawerTab = 'tasks' | 'inbox' | 'detail'

/** Semantic drawer width per tab (px); user drag overrides within bounds. */
const TAB_WIDTH: Record<DrawerTab, number> = { tasks: 600, inbox: 720, detail: 800 }

/** Lower and upper width bounds for the user-resized drawer (px). */
const WIDTH_MIN = 480
const WIDTH_MAX = 960

/** Viewport share the width may never exceed, matching the CSS clamp. */
const VIEWPORT_SHARE = 0.94

/**
 * Registrant-private injected share (assembled in apply): the badge
 * aggregates as a hooks-compartment source (bound to `useBadge`). Plain
 * data only.
 */
export interface WorkbenchDrawerInjected {
  /** Badge state source; the renderer binds it to the useBadge selector hook. */
  hooks: { badge: HostObservable<BadgeState> }
}

/** Full props for the floating trigger and the drawer shell. */
export type WorkbenchDrawerProps =
  PropsRuntime<'shell.overlay'>
  & PropsRenderSlots<'workbench.drawer.tasks' | 'workbench.drawer.inbox' | 'workbench.drawer.detail'>
  & PropsLocale<typeof NS>
  & InjectFace<WorkbenchDrawerInjected>

/**
 * Render the workbench floating trigger and, when open, the right-side
 * drawer: three tabs dispatching the declared content seats. The component
 * stays mounted while the entry lives, so closing the drawer keeps the tab
 * selection, the selected detail task, and the user width in place.
 * @param props - composed slot props (locale, render share, inject face).
 * @returns the trigger; the open drawer sits beside it in the overlay layer.
 */
export function WorkbenchDrawer(props: WorkbenchDrawerProps) {
  const { t, useBadge, renderSlot } = props
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<DrawerTab>('tasks')
  const [detailTaskId, setDetailTaskId] = useState<string | undefined>(undefined)
  const [userWidth, setUserWidth] = useState<number | undefined>(undefined)
  const badge = useBadge(state => state)

  const drawerRef = useRef<HTMLDivElement>(null)
  const resizeRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; w: number } | null>(null)

  // Escape closes the open drawer; the listener exists only while open.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [open])

  const openDetail = useCallback((taskId: string) => {
    setDetailTaskId(taskId)
    setTab('detail')
  }, [])

  /** Switch the drawer to the inbox tab (KPI GATE/ASK cards drill down here). */
  const openInbox = useCallback(() => {
    setTab('inbox')
  }, [])

  // Switching a tab returns to that tab's semantic width; a user drag
  // overrides it only until the next switch.
  const selectTab = (next: DrawerTab) => {
    setTab(next)
    setUserWidth(undefined)
  }

  const onResizeDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragRef.current = { x: event.clientX, w: drawerRef.current?.offsetWidth ?? TAB_WIDTH[tab] }
    // jsdom lacks pointer-capture; keep the capture optional where the engine
    // implements it, so the drag handlers stay testable and browser-safe.
    const el = resizeRef.current
    if (el !== null && typeof el.setPointerCapture === 'function') {
      el.setPointerCapture(event.pointerId)
    }
  }
  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag === null) return
    const maxWidth = Math.min(WIDTH_MAX, window.innerWidth * VIEWPORT_SHARE)
    setUserWidth(Math.max(WIDTH_MIN, Math.min(maxWidth, drag.w + (drag.x - event.clientX))))
  }
  const onResizeUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    const el = resizeRef.current
    if (el !== null && typeof el.hasPointerCapture === 'function' && el.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId)
    }
  }

  const width = userWidth ?? TAB_WIDTH[tab]

  return (
    <>
      <button
        type="button"
        className={css.trigger}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(!open) }}
      >
        <span
          className={badge.activeCount > 0 ? css.dotActive : css.dotIdle}
          aria-label={t(badge.activeCount > 0 ? 'state.active' : 'state.idle')}
        />
        <span className={css.triggerLabel}>{t('trigger')}</span>
        {badge.openCount > 0 && (
          <span className={css.badge} aria-label={t('badge.open', { count: badge.openCount })}>
            {badge.openCount}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={drawerRef}
          className={css.drawer}
          style={{ width: `${width}px` }}
          role="dialog"
          aria-label={t('trigger')}
        >
          <div
            ref={resizeRef}
            className={css.resize}
            role="separator"
            aria-orientation="vertical"
            aria-label={t('resize')}
            onPointerDown={onResizeDown}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeUp}
          />
          <div className={css.head}>
            <span className={css.headTitle}>{t('trigger')}</span>
            <button type="button" className={css.close} onClick={() => { setOpen(false) }}>
              {t('close')}
            </button>
          </div>
          <div className={css.tabs} role="tablist">
            {(['tasks', 'inbox', 'detail'] as const).map(key => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? css.tabOn : css.tabOff}
                onClick={() => { selectTab(key) }}
              >
                {t(`tab.${key}` as const)}
                {key === 'tasks' && badge.activeCount > 0 && <span className={css.tabCount}>{badge.activeCount}</span>}
                {key === 'inbox' && badge.openCount > 0 && <span className={css.tabCountHot}>{badge.openCount}</span>}
              </button>
            ))}
          </div>
          <div className={css.body}>
            {tab === 'tasks' && renderSlot('workbench.drawer.tasks', { openDetail, openInbox })}
            {tab === 'inbox' && renderSlot('workbench.drawer.inbox', {})}
            {tab === 'detail' && renderSlot('workbench.drawer.detail', { taskId: detailTaskId })}
          </div>
        </div>
      )}
    </>
  )
}
