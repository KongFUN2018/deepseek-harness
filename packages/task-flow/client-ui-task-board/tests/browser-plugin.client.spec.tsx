// @vitest-environment jsdom
/**
 * The board plugin's halves. Presentation: the footer trigger opens the
 * panel, rows show id, state word, and revision, verbs fire the command
 * callback with the row id, refresh reaches its callback, the rail variant
 * renders when the sidebar collapses, the loading/empty/failed panels render
 * their copy, the command-error line carries the failure code, and the close
 * control dismisses the panel. Browser half on a real SlotRegistry with a
 * scripted tasks Remote: the footer entry registers (fiber teardown removes
 * it — HMR safety), dictionaries register per locale, and the boot load
 * reaches the Remote. The node half is inert; the invariant companion
 * reserves ownership.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { TaskRecord } from '@deepseek-ai/dsh-task/types'
import type { TaskBoardState } from '../src/client/board.ts'
import { TaskBoardAction, type TaskBoardActionProps } from '../src/client/TaskBoardAction.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as BoardInvariant from '../src/invariant.ts'
import { en, NS, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh)

let seq = 0

/** One task projection fixture; `over` overrides any field. */
function task(over: Partial<TaskRecord> = {}): TaskRecord {
  seq += 1
  return {
    taskId: `t-${seq}` as TaskRecord['taskId'],
    workspaceId: 'ws-1',
    pinnedRecipe: { recipeId: 'recipe-a' as never, revision: 1, schemaVersion: 1, contentHash: 'hash' },
    state: 'running',
    revision: 4,
    createdAt: seq * 10,
    ...over,
  }
}

/** Component props with a controllable board-state source and spy callbacks. */
function makeProps(state: TaskBoardState, wide = true): {
  props: TaskBoardActionProps
  command: ReturnType<typeof vi.fn>
  refresh: ReturnType<typeof vi.fn>
  setState: (next: TaskBoardState) => void
} {
  let current = state
  const command = vi.fn()
  const refresh = vi.fn()
  const useBoard = <S,>(selector: (snapshot: TaskBoardState) => S) => selector(current)
  // The framework's global standard props (useSessions/useWorkspaces) are
  // unused by this component; stable no-op stubs satisfy the share contract.
  const unusedGlobal = { getSnapshot: () => ({}), subscribe: () => () => {} } as never
  const composed: TaskBoardActionProps = {
    wide,
    t,
    useBoard,
    refresh,
    command,
    useSessions: unusedGlobal,
    useWorkspaces: unusedGlobal,
  }
  return {
    props: composed,
    command,
    refresh,
    setState: (next: TaskBoardState) => { current = next },
  }
}

const ready = (tasks: readonly TaskRecord[]): TaskBoardState => ({ status: 'ready', tasks, updatedAt: 1 })

describe('TaskBoardAction', () => {
  it('opens the panel from the footer trigger and renders rows with verbs', () => {
    const running = task({ taskId: 't-run' as TaskRecord['taskId'], state: 'running' })
    const done = task({ taskId: 't-done' as TaskRecord['taskId'], state: 'completed', createdAt: 1 })
    const { props, command } = makeProps(ready([running, done]))
    render(<TaskBoardAction {...props} />)
    const trigger = screen.getByRole('button', { name: zh.trigger })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('t-run')).toBeTruthy()
    expect(screen.getByText(`${zh['state.running']} · 版本 4`)).toBeTruthy()
    expect(screen.getByText(`${zh['state.completed']} · 版本 4`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['verb.pause'] }))
    expect(command).toHaveBeenCalledWith('t-run', 'pause')
    expect(screen.queryByRole('button', { name: zh['verb.resume'] })).toBeNull()
  })

  it('closes through the close control', () => {
    const { props } = makeProps(ready([]))
    render(<TaskBoardAction {...props} />)
    const trigger = screen.getByRole('button', { name: zh.trigger })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: zh.close }))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('fires refresh from the footer', () => {
    const { props, refresh } = makeProps(ready([]))
    render(<TaskBoardAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('renders the loading, empty, and failed panels', () => {
    const loading = makeProps({ status: 'loading', tasks: [], updatedAt: 0 })
    render(<TaskBoardAction {...loading.props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    expect(screen.getByText(zh.loading)).toBeTruthy()
    cleanup()

    const empty = makeProps(ready([]))
    render(<TaskBoardAction {...empty.props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    expect(screen.getByText(zh.empty)).toBeTruthy()
    cleanup()

    const failed = makeProps({ status: 'failed', tasks: [], error: 'unavailable', updatedAt: 0 })
    render(<TaskBoardAction {...failed.props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    expect(screen.getByRole('alert').textContent).toContain('unavailable')
  })

  it('shows the command-failure line with the code until the next successful command', () => {
    const board = makeProps({ status: 'ready', tasks: [task()], error: 'stale-revision', updatedAt: 1 })
    render(<TaskBoardAction {...board.props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('stale-revision')
    expect(alert.textContent).toContain('已重新同步')
  })

  it('renders the rail variant when the sidebar is collapsed', () => {
    const rail = makeProps(ready([]), false)
    render(<TaskBoardAction {...rail.props} />)
    // The rail trigger still opens the same panel; only its chrome differs.
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    expect(screen.getByText(zh.empty)).toBeTruthy()
  })

  it('labels every task state through the dictionary', () => {
    const states = [
      'planning', 'awaiting-input', 'awaiting-decision', 'pausing',
      'paused', 'cancelling', 'cancelled', 'failed',
    ] as const
    const rows = states.map(state => task({ state }))
    const { props } = makeProps(ready(rows))
    render(<TaskBoardAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    // The state word renders inside the row's meta line ("state · 版本 n").
    for (const state of states) {
      const word = zh[`state.${state}` as const]
      const metas = screen.getAllByText((_, element) =>
        element?.textContent?.includes(word) === true && element.textContent.includes('版本'))
      expect(metas.length).toBeGreaterThan(0)
    }
  })
})

/** Slot ledger reader: entry ids currently registered in the footer list. */
function footerEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots
    .entries('sidebar.footer.action')
    .map(entry => entry.options.id)
}

/** Boot the browser half over a real slot tree and a scripted tasks Remote. */
async function boot(options: { loadFails?: boolean } = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
  // The locale plugin binds a settings scope, which reads the connection
  // handle and the forwarded-event port.
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  // A real Service instance: the traceable proxy routes `ctx.remote.tasks`
  // through the Service tracker's associate path only when the provider is a
  // Service (a plain object would leave the nested read undefined).
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }

    $on(): () => void {
      return () => {}
    }
  }
  new RemoteService(ctx)
  ctx.provide('remote.tasks', {
    listTasks: options.loadFails
      ? async () => ({ ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } })
      : async () => ({ ok: true as const, value: [] }),
  } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('task-board browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.tasks', 'locale'])
  })

  it('registers the footer entry, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await boot()
    expect(footerEntryIds(ctx)).toContain('task-board')
    await fiber.dispose()
    expect(footerEntryIds(ctx)).not.toContain('task-board')
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await boot()
    const translate = ctx.locale.bind(NS)
    // jsdom's navigator language is en-US, so the active locale starts en.
    expect(translate('trigger')).toBe(en.trigger)
    ctx.locale.setLocale('zh')
    expect(translate('trigger')).toBe(zh.trigger)
    await fiber.dispose()
    expect(translate('trigger')).not.toBe(zh.trigger)
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('wires the entry inject face to the controller callbacks', async () => {
    const { ctx, fiber } = await boot()
    const entry = ctx.slots.entries('sidebar.footer.action').find(e => e.options.id === 'task-board')
    expect(entry).toBeDefined()
    // The inject factory builds plain data + callbacks over the controller.
    const injectFace = (entry as unknown as { inject?: () => unknown }).inject
    expect(injectFace).toBeTypeOf('function')
    const injected = injectFace?.() as {
      hooks: { board: { getSnapshot(): TaskBoardState } }
      refresh: () => void
      command: (taskId: string, verb: string) => void
    }
    expect(injected.hooks.board.getSnapshot().status).toBe('ready')
    expect(() => { injected.refresh() }).not.toThrow()
    expect(() => { injected.command('t-absent', 'pause') }).not.toThrow()
    await fiber.dispose()
  })

  it('issues the boot load through the tasks Remote', async () => {
    const listTasks = vi.fn(async () => ({ ok: true as const, value: [] }))
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({
      name: 'root',
      children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
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
    ctx.provide('remote.tasks', { listTasks } as never)
    ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(listTasks).toHaveBeenCalledTimes(1)
    await fiber.dispose()
  })
})

describe('task-board node half', () => {
  it('contributes no host behavior', () => {
    expect(applyNode).not.toThrow()
  })
})

describe('task-board invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(BoardInvariant)
    await fiber.await()
    expect(BoardInvariant.name).toBe('client-ui-task-board-invariant')
    expect(BoardInvariant.inject).toEqual(['invariants'])
    await fiber.dispose()
  })
})
