// @vitest-environment jsdom
/**
 * The workbench-drawer plugin's halves. Presentation: the floating trigger
 * opens and closes the drawer, the badge renders the open-attention count
 * and the active dot follows the active-task count, tabs dispatch their
 * seats through the render share, a tab switch resets the width to the
 * tab's semantic width, the resize drag clamps within bounds, Escape
 * closes, and reopening keeps the selected tab. Browser half on a real
 * SlotRegistry with scripted Remotes: the overlay entry registers with
 * its three seat declarations (fiber teardown removes them — HMR safety),
 * dictionaries register per locale, and the badge boot load reaches both
 * Remotes. The node half is inert; the invariant companion reserves
 * ownership.
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
import { WorkbenchDrawer, type WorkbenchDrawerProps } from '../src/client/WorkbenchDrawer.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as DrawerInvariant from '../src/invariant.ts'
import { en, NS, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh)

/** Component props with a controllable badge source and a spying renderSlot. */
function makeProps(state: BadgeState): {
  props: WorkbenchDrawerProps
  renderSlot: ReturnType<typeof vi.fn>
} {
  const current = state
  const useBadge = <S,>(selector: (snapshot: BadgeState) => S) => selector(current)
  const renderSlot = vi.fn(() => null)
  const unusedGlobal = { getSnapshot: () => ({}), subscribe: () => () => {} } as never
  const composed: WorkbenchDrawerProps = {
    t,
    useBadge,
    renderSlot,
    useSessions: unusedGlobal,
    useWorkspaces: unusedGlobal,
  }
  return { props: composed, renderSlot }
}

const idle = (): BadgeState => ({ openCount: 0, activeCount: 0 })

describe('WorkbenchDrawer', () => {
  it('opens the drawer from the floating trigger and closes through the close control', () => {
    const { props } = makeProps(idle())
    render(<WorkbenchDrawer {...props} />)
    const trigger = screen.getByRole('button', { name: new RegExp(zh.trigger) })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh.close }))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape', () => {
    const { props } = makeProps(idle())
    render(<WorkbenchDrawer {...props} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.trigger) }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders the badge count and the active dot from the badge state', () => {
    const { props } = makeProps({ openCount: 3, activeCount: 2 })
    render(<WorkbenchDrawer {...props} />)
    const trigger = screen.getByRole('button', { name: new RegExp(zh.trigger) })
    expect(trigger.textContent).toContain('3')
    expect(screen.getByLabelText(zh['state.active'])).toBeTruthy()
  })

  it('hides the badge at zero and marks the idle state', () => {
    const { props } = makeProps(idle())
    render(<WorkbenchDrawer {...props} />)
    expect(screen.queryByLabelText(zh['badge.open'].replace('{count}', '0'))).toBeNull()
    expect(screen.getByLabelText(zh['state.idle'])).toBeTruthy()
  })

  it('dispatches the tasks seat on open and the inbox/detail seats on tab switch', () => {
    const { props, renderSlot } = makeProps(idle())
    render(<WorkbenchDrawer {...props} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.trigger) }))
    const [seat, owner] = renderSlot.mock.calls[0] as [string, { openDetail: (taskId: string) => void }]
    expect(seat).toBe('workbench.drawer.tasks')
    expect(owner.openDetail).toBeTypeOf('function')
    renderSlot.mockClear()
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(zh['tab.inbox']) }))
    expect(renderSlot).toHaveBeenCalledWith('workbench.drawer.inbox', expect.objectContaining({}))
    renderSlot.mockClear()
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(zh['tab.detail']) }))
    expect(renderSlot).toHaveBeenCalledWith('workbench.drawer.detail', expect.objectContaining({ taskId: undefined }))
  })

  it('passes the opened task id to the detail seat after openDetail', () => {
    const { props, renderSlot } = makeProps(idle())
    render(<WorkbenchDrawer {...props} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.trigger) }))
    const tasksCall = renderSlot.mock.calls.find(call => call[0] === 'workbench.drawer.tasks')
    const openDetail = (tasksCall as unknown as [string, { openDetail: (taskId: string) => void }])[1].openDetail
    act(() => { openDetail('t-42') })
    expect(renderSlot).toHaveBeenCalledWith('workbench.drawer.detail', expect.objectContaining({ taskId: 't-42' }))
    // The drawer switched to the detail tab while staying open.
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain(zh['tab.detail'])
  })

  it('marks the selected tab and keeps it after close and reopen', () => {
    const { props } = makeProps(idle())
    render(<WorkbenchDrawer {...props} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.trigger) }))
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(zh['tab.inbox']) }))
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain(zh['tab.inbox'])
    fireEvent.click(screen.getByRole('button', { name: zh.close }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.trigger) }))
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain(zh['tab.inbox'])
  })

  it('switching a tab returns to the semantic width and the drag clamps within bounds', () => {
    const { props } = makeProps(idle())
    const { container } = render(<WorkbenchDrawer {...props} />)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(zh.trigger) }))
    const dialog = screen.getByRole('dialog')
    // Tasks tab: semantic 600px.
    expect(dialog.style.width).toBe('600px')
    // jsdom does no layout, so the drawer's measured width is 0; anchor the
    // drag at the semantic width the same way a real browser would report it.
    Object.defineProperty(dialog, 'offsetWidth', { value: 600, configurable: true })
    // Drag the left edge 400px right of the anchor: 600 + 400 = 1000 → clamp 960.
    const resize = container.querySelector('[role="separator"]') as HTMLElement
    fireEvent.pointerDown(resize, { clientX: 500, pointerId: 1 })
    fireEvent.pointerMove(resize, { clientX: 100, pointerId: 1 })
    fireEvent.pointerUp(resize, { pointerId: 1 })
    expect(dialog.style.width).toBe('960px')
    // Switching tabs resets to the inbox semantic width.
    fireEvent.click(screen.getByRole('tab', { name: new RegExp(zh['tab.inbox']) }))
    expect(dialog.style.width).toBe('720px')
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
    expect(listSnapshot).toHaveBeenCalledTimes(1) // boot load
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
  // The layout's overlay declaration: the drawer registers into it.
  ctx.slots.register({
    name: 'root',
    children: {
      'shell.overlay': { kind: 'list', scope: 'root' },
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

  it('registers the overlay entry declaring the three seats, and teardown removes them (HMR safety)', async () => {
    const { ctx, fiber } = await boot()
    const entry = ctx.slots.entries('shell.overlay').find(e => e.options.id === 'workbench-drawer')
    expect(entry).toBeDefined()
    expect(ctx.slots.spec('workbench.drawer.tasks')).toBeDefined()
    expect(ctx.slots.spec('workbench.drawer.inbox')).toBeDefined()
    expect(ctx.slots.spec('workbench.drawer.detail')).toBeDefined()
    await fiber.dispose()
    expect(ctx.slots.entries('shell.overlay').find(e => e.options.id === 'workbench-drawer')).toBeUndefined()
    // Seat declarations collapse with the entry that declared them.
    expect(ctx.slots.spec('workbench.drawer.tasks')).toBeUndefined()
    expect(ctx.slots.spec('workbench.drawer.inbox')).toBeUndefined()
    expect(ctx.slots.spec('workbench.drawer.detail')).toBeUndefined()
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await boot()
    const translate = ctx.locale.bind(NS)
    // 'trigger' is namespace-exclusive: the common vocabulary also carries
    // generic words like 'close', which would mask the namespace removal.
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
      children: { 'shell.overlay': { kind: 'list', scope: 'root' } },
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

  it('wires the entry inject face to the badge store', async () => {
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
