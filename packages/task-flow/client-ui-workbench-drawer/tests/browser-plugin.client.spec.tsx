// @vitest-environment jsdom
/**
 * The workbench-drawer plugin's halves. Presentation: the store-driven drawer
 * panel opens/closes through the shared store, tabs dispatch their seats
 * through the render share, a tab switch returns to the conversation-relative
 * default width, the resize drag clamps within bounds, and the create tab
 * selects the create seat. The sidebar.entry trigger toggles the same store.
 * Browser half on a real SlotRegistry with scripted Remotes: both entries
 * (sidebar.entry trigger + shell.overlay drawer) register with the four seat
 * declarations (fiber teardown removes them — HMR safety), dictionaries
 * register per locale, and the badge boot load reaches both Remotes. The
 * node half is inert; the invariant companion reserves ownership.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { BadgeState } from '../src/client/badge.ts'
import { BadgeController } from '../src/client/badge.ts'
import { WorkbenchDrawer, defaultWidthFor, type WorkbenchDrawerProps } from '../src/client/WorkbenchDrawer.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as DrawerInvariant from '../src/invariant.ts'
import { en, NS, zh } from '../src/client/locales.ts'
import { createWorkbenchStore, type WorkbenchState } from '../src/client/store.ts'

afterEach(cleanup)

const t = makeTranslate(zh)

type DrawerStoreInstance = ReturnType<ReturnType<typeof createWorkbenchStore>['create']>

/** Component props for the store-driven drawer with a spying renderSlot. */
function makeProps(state: BadgeState, store: DrawerStoreInstance = createWorkbenchStore().create()): {
  props: WorkbenchDrawerProps
  renderSlot: ReturnType<typeof vi.fn>
} {
  const current = state
  const useBadge = <S,>(selector: (snapshot: BadgeState) => S) => selector(current)
  // The renderer binds useStore to the store's snapshot; here we synthesize the
  // selector read over the instance's live snapshot.
  const useStore = <S,>(selector: (snapshot: WorkbenchState) => S) => selector(store.getSnapshot())
  const renderSlot = vi.fn(() => null)
  const unusedGlobal = { getSnapshot: () => ({}), subscribe: () => () => {} } as never
  const composed: WorkbenchDrawerProps = {
    t,
    useBadge,
    useStore,
    actions: store.actions,
    renderSlot,
    useSessions: unusedGlobal,
    useWorkspaces: unusedGlobal,
  }
  return { props: composed, renderSlot }
}

const idle = (): BadgeState => ({ openCount: 0, activeCount: 0 })

describe('WorkbenchDrawer (store-driven panel)', () => {
  it('opens when the shared store says open and closes via the close control', () => {
    const store = createWorkbenchStore().create()
    act(() => { store.actions.openDrawer() })
    const { props } = makeProps(idle(), store)
    const { rerender } = render(<WorkbenchDrawer {...props} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    // The synthesized useStore reads the live snapshot; re-render after a store
    // mutation reflects it (the renderer's real useStore subscribes and does this).
    fireEvent.click(screen.getByRole('button', { name: zh.close }))
    rerender(<WorkbenchDrawer {...props} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders nothing while the store is closed', () => {
    const props = makeProps(idle()).props
    const { container } = render(<WorkbenchDrawer {...props} />)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders the four tabs and dispatches their seats on selection', () => {
    const store = createWorkbenchStore().create()
    act(() => { store.actions.openDrawer() })
    const { props, renderSlot } = makeProps(idle(), store)
    const { rerender } = render(<WorkbenchDrawer {...props} />)
    // Default tab: tasks.
    expect(renderSlot).toHaveBeenCalledWith('workbench.drawer.tasks', expect.objectContaining({ openDetail: expect.any(Function) }))
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(zh['tab.inbox']) }))
    rerender(<WorkbenchDrawer {...props} />)
    expect(renderSlot).toHaveBeenCalledWith('workbench.drawer.inbox', expect.objectContaining({}))
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(zh['tab.detail']) }))
    rerender(<WorkbenchDrawer {...props} />)
    expect(renderSlot).toHaveBeenCalledWith('workbench.drawer.detail', expect.objectContaining({ taskId: undefined }))
    // The new create tab dispatches the create seat.
    renderSlot.mockClear()
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(zh['tab.create']) }))
    rerender(<WorkbenchDrawer {...props} />)
    expect(renderSlot).toHaveBeenCalledWith('workbench.drawer.create', expect.anything())
  })

  it('passes the opened task id to the detail seat after openDetail', () => {
    const store = createWorkbenchStore().create()
    act(() => { store.actions.openDrawer() })
    const { props, renderSlot } = makeProps(idle(), store)
    const { rerender } = render(<WorkbenchDrawer {...props} />)
    const tasksCall = renderSlot.mock.calls.find(call => call[0] === 'workbench.drawer.tasks')
    const openDetail = (tasksCall as unknown as [string, { openDetail: (taskId: string) => void }])[1].openDetail
    act(() => { openDetail('t-42') })
    rerender(<WorkbenchDrawer {...props} />)
    expect(renderSlot).toHaveBeenCalledWith('workbench.drawer.detail', expect.objectContaining({ taskId: 't-42' }))
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain(zh['tab.detail'])
  })

  it('defaults to the conversation-relative width and the drag clamps within bounds', () => {
    const store = createWorkbenchStore().create()
    act(() => { store.actions.openDrawer() })
    const { props } = makeProps(idle(), store)
    const { container } = render(<WorkbenchDrawer {...props} />)
    const viewport = window.innerWidth
    const dialog = screen.getByRole('dialog')
    // All tabs share one conversation-relative default for the current viewport.
    expect(dialog.style.width).toBe(defaultWidthFor(viewport) + 'px')
    const resize = container.querySelector('[role="separator"]') as HTMLElement
    fireEvent.pointerDown(resize, { clientX: 500, pointerId: 1 })
    // A wide drag from the current default clamps at the viewport-share cap.
    fireEvent.pointerMove(resize, { clientX: -500, pointerId: 1 })
    fireEvent.pointerUp(resize, { pointerId: 1 })
    // The clamp mirrors the component: drag from the current default, then
    // clamped to min(WIDTH_MAX, viewport * VIEWPORT_SHARE).
    const moved = defaultWidthFor(viewport) + (500 - -500)
    const clamped = Math.max(360, Math.min(Math.min(1320, viewport * 0.94), moved))
    expect(dialog.style.width).toBe(String(clamped) + 'px')
    // Switching any tab returns to the conversation-relative default.
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(zh['tab.inbox']) }))
    expect(dialog.style.width).toBe(defaultWidthFor(viewport) + 'px')
  })
})

describe('BadgeController', () => {
  it('reads both aggregates from the Remotes on boot and on forwarded updates', async () => {
    const listSnapshot = vi.fn(async () => ({ ok: true as const, value: { snapshotVersion: 1, items: [{}, {}] } }))
    const listTasks = vi.fn(async () => ({
      ok: true as const,
      value: [
        { state: 'running' },
        { state: 'planning' },
        { state: 'paused' },
        { state: 'completed' },
      ],
    }))
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
    class RemoteService extends Service {
      constructor(serviceCtx: Context) {
        super(serviceCtx, 'remote')
      }

      $on(): () => void {
        return () => {}
      }
    }
    new RemoteService(ctx)
    ctx.provide('remote.workbenchHost', { listSnapshot } as never)
    ctx.provide('remote.tasks', { listTasks } as never)
    const badge = new BadgeController(ctx)
    expect(listSnapshot).toHaveBeenCalledTimes(1)
    expect(listTasks).toHaveBeenCalledTimes(1)
    await badge.refresh()
    expect(listSnapshot).toHaveBeenCalledTimes(2)
    expect(listTasks).toHaveBeenCalledTimes(2)
    expect(badge.store.getSnapshot().openCount).toBe(2)
    expect(badge.store.getSnapshot().activeCount).toBe(2)
  })

  it('records the failure code of a failed aggregate read', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
    class RemoteService extends Service {
      constructor(serviceCtx: Context) {
        super(serviceCtx, 'remote')
      }

      $on(): () => void {
        return () => {}
      }
    }
    new RemoteService(ctx)
    ctx.provide('remote.workbenchHost', {
      listSnapshot: async () => ({ ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } }),
    } as never)
    ctx.provide('remote.tasks', { listTasks: async () => ({ ok: true as const, value: [] }) } as never)
    const badge = new BadgeController(ctx)
    await badge.refresh()
    expect(badge.store.getSnapshot().error).toBe('unavailable')
  })
})

/** Boot the browser half over a real slot tree and scripted Remotes. */
async function boot() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  // Both declaration surfaces the drawer wires into.
  ctx.slots.register({
    name: 'root',
    children: {
      'shell.overlay': { kind: 'list', scope: 'root' },
      'sidebar.entry': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }

    $on(): () => void {
      return () => {}
    }
  }
  new RemoteService(ctx)
  ctx.provide('remote.workbenchHost', {
    listSnapshot: async () => ({ ok: true as const, value: { snapshotVersion: 0, items: [] } }),
  } as never)
  ctx.provide('remote.tasks', { listTasks: async () => ({ ok: true as const, value: [] }) } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('workbench-drawer browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.workbenchHost', 'remote.tasks', 'locale'])
  })

  it('registers both entries declaring the four seats, and teardown removes them (HMR safety)', async () => {
    const { ctx, fiber } = await boot()
    expect(ctx.slots.entries('shell.overlay').find(e => e.options.id === 'workbench-drawer')).toBeDefined()
    expect(ctx.slots.entries('sidebar.entry').find(e => e.options.id === 'workbench-drawer-trigger')).toBeDefined()
    expect(ctx.slots.spec('workbench.drawer.tasks')).toBeDefined()
    expect(ctx.slots.spec('workbench.drawer.inbox')).toBeDefined()
    expect(ctx.slots.spec('workbench.drawer.detail')).toBeDefined()
    expect(ctx.slots.spec('workbench.drawer.create')).toBeDefined()
    await fiber.dispose()
    expect(ctx.slots.entries('shell.overlay').find(e => e.options.id === 'workbench-drawer')).toBeUndefined()
    expect(ctx.slots.entries('sidebar.entry').find(e => e.options.id === 'workbench-drawer-trigger')).toBeUndefined()
    expect(ctx.slots.spec('workbench.drawer.tasks')).toBeUndefined()
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await boot()
    const translate = ctx.locale.bind(NS)
    expect(translate('trigger')).toBe(en.trigger)
    ctx.locale.setLocale('zh')
    expect(translate('trigger')).toBe(zh.trigger)
    await fiber.dispose()
    expect(translate('trigger')).not.toBe(zh.trigger)
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('issues the badge boot load through both Remotes', async () => {
    const listSnapshot = vi.fn(async () => ({ ok: true as const, value: { snapshotVersion: 0, items: [] } }))
    const listTasks = vi.fn(async () => ({ ok: true as const, value: [] }))
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({
      name: 'root',
      children: { 'shell.overlay': { kind: 'list', scope: 'root' }, 'sidebar.entry': { kind: 'list', scope: 'root' } },
    } as never, () => null)
    ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
    class RemoteService extends Service {
      constructor(serviceCtx: Context) {
        super(serviceCtx, 'remote')
      }

      $on(): () => void {
        return () => {}
      }
    }
    new RemoteService(ctx)
    ctx.provide('remote.workbenchHost', { listSnapshot } as never)
    ctx.provide('remote.tasks', { listTasks } as never)
    ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(listSnapshot).toHaveBeenCalledTimes(1)
    expect(listTasks).toHaveBeenCalledTimes(1)
    await fiber.dispose()
  })

  it('wires the overlay entry inject face to the badge store', async () => {
    const { ctx, fiber } = await boot()
    const entry = ctx.slots.entries('shell.overlay').find(e => e.options.id === 'workbench-drawer')
    const injectFace = (entry as unknown as { inject?: () => unknown }).inject
    expect(injectFace).toBeTypeOf('function')
    const injected = injectFace?.() as {
      hooks: { badge: { getSnapshot(): BadgeState } }
    }
    expect(injected.hooks.badge.getSnapshot().openCount).toBe(0)
    await fiber.dispose()
  })

  it('wires the sidebar trigger entry inject face to the same badge store', async () => {
    const { ctx, fiber } = await boot()
    const entry = ctx.slots.entries('sidebar.entry').find(e => e.options.id === 'workbench-drawer-trigger')
    const injectFace = (entry as unknown as { inject?: () => unknown }).inject
    expect(injectFace).toBeTypeOf('function')
    const injected = injectFace?.() as {
      hooks: { badge: { getSnapshot(): BadgeState } }
    }
    expect(injected.hooks.badge.getSnapshot().openCount).toBe(0)
    await fiber.dispose()
  })
})

describe('workbench-drawer node half', () => {
  it('contributes no host behavior', () => {
    expect(applyNode).not.toThrow()
  })
})

describe('workbench-drawer invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(DrawerInvariant)
    await fiber.await()
    expect(DrawerInvariant.name).toBe('client-ui-workbench-drawer-invariant')
    expect(DrawerInvariant.inject).toEqual(['invariants'])
    await fiber.dispose()
  })
})
