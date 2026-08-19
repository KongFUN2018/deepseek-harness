// @vitest-environment jsdom
/**
 * The board plugin's halves. Presentation: rows show id, state word, and
 * revision, verbs fire the command callback with the row id (without
 * opening the row), refresh reaches its callback, opening a row fires the
 * owner's openDetail callback with the row id, the loading/empty/failed
 * panels render their copy, and the command-error line carries the failure
 * code. Browser half on a real SlotRegistry with a scripted tasks Remote:
 * the drawer seat entry registers (fiber teardown removes it — HMR
 * safety), dictionaries register per locale, and the boot load reaches the
 * Remote. The node half is inert; the invariant companion reserves
 * ownership.
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
function makeProps(state: TaskBoardState): {
  props: TaskBoardActionProps
  command: ReturnType<typeof vi.fn>
  refresh: ReturnType<typeof vi.fn>
  openDetail: ReturnType<typeof vi.fn>
  setState: (next: TaskBoardState) => void
} {
  let current = state
  const command = vi.fn()
  const refresh = vi.fn(() => Promise.resolve())
  const openDetail = vi.fn()
  const useBoard = <S,>(selector: (snapshot: TaskBoardState) => S) => selector(current)
  // The framework's global standard props (useSessions/useWorkspaces) are
  // unused by this component; stable no-op stubs satisfy the share contract.
  const unusedGlobal = { getSnapshot: () => ({}), subscribe: () => () => {} } as never
  const openInbox = vi.fn()
  const openCreate = vi.fn()
  const composed: TaskBoardActionProps = {
    openInbox,
    openCreate,
    initialRecipeId: undefined,
    openDetail,
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
    openDetail,
    setState: (next: TaskBoardState) => { current = next },
  }
}

const ready = (tasks: readonly TaskRecord[]): TaskBoardState => ({ status: 'ready', tasks, metrics: undefined, phaseProgress: new Map(), taskGates: new Map(), updatedAt: 1 })

describe('TaskBoardAction', () => {
  it('renders rows with state words and verbs', () => {
    const running = task({ taskId: 't-run' as TaskRecord['taskId'], state: 'running' })
    const done = task({ taskId: 't-done' as TaskRecord['taskId'], state: 'completed', createdAt: 1 })
    const { props, command } = makeProps(ready([running, done]))
    render(<TaskBoardAction {...props} />)
    expect(screen.getByText('t-run')).toBeTruthy()
    expect(screen.getByText(`${zh['state.running']} · 版本 4 · ${zh.recipe.replace('{recipeId}', 'recipe-a')}`)).toBeTruthy()
    expect(screen.getByText(`${zh['state.completed']} · 版本 4 · ${zh.recipe.replace('{recipeId}', 'recipe-a')}`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh['verb.pause'] }))
    expect(command).toHaveBeenCalledWith('t-run', 'pause')
    expect(screen.queryByRole('button', { name: zh['verb.resume'] })).toBeNull()
  })

  it('fires the owner openDetail when a row is opened, and verbs do not open', () => {
    const { props, openDetail } = makeProps(ready([task({ taskId: 't-open' as TaskRecord['taskId'] })]))
    render(<TaskBoardAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.open.replace('{taskId}', 't-open') }))
    expect(openDetail).toHaveBeenCalledWith('t-open')
    openDetail.mockClear()
    fireEvent.click(screen.getByRole('button', { name: zh['verb.pause'] }))
    expect(openDetail).not.toHaveBeenCalled()
  })

  it('fires refresh from the footer and confirms with a synced line', async () => {
    const { props, refresh } = makeProps(ready([]))
    render(<TaskBoardAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    expect(refresh).toHaveBeenCalledTimes(1)
    // The button settles back to "刷新" and a success-toned synced line appears.
    expect(await screen.findByText(new RegExp(zh['synced'].replace('{time}', '.*')))).toBeTruthy()
    expect(screen.getByRole('button', { name: zh.refresh })).toBeTruthy()
  })

  it('renders the throughput sparkline and gate pass-rate bars from metrics', () => {
    const state: TaskBoardState = {
      status: 'ready',
      tasks: [],
      metrics: {
        live: 1, gate: 0, ask: 0, asset: 2,
        throughput: [{ day: '2026-01-01', completedPhases: 2 }, { day: '2026-01-02', completedPhases: 5 }],
        gatePassRate: { a: 1, b: 0.5, c: 0.25 },
      },
      phaseProgress: new Map(),
      taskGates: new Map(),
      updatedAt: 1,
    }
    const { props } = makeProps(state)
    render(<TaskBoardAction {...props} />)
    expect(screen.getByRole('img', { name: zh['chart.throughput'] })).toBeTruthy()
    expect(screen.getByRole('img', { name: zh['chart.gateRate'] })).toBeTruthy()
    expect(screen.getByText(zh['chart.throughput'])).toBeTruthy()
    expect(screen.getByText(zh['chart.gateRate'])).toBeTruthy()
  })

  it('renders the loading, empty, and failed panels', () => {
    const loading = makeProps({ status: 'loading', tasks: [], metrics: undefined, phaseProgress: new Map(), taskGates: new Map(), updatedAt: 0 })
    render(<TaskBoardAction {...loading.props} />)
    expect(screen.getByText(zh.loading)).toBeTruthy()
    cleanup()

    const empty = makeProps(ready([]))
    render(<TaskBoardAction {...empty.props} />)
    expect(screen.getByText(zh.empty)).toBeTruthy()
    cleanup()

    const failed = makeProps({ status: 'failed', tasks: [], metrics: undefined, phaseProgress: new Map(), taskGates: new Map(), error: 'unavailable', updatedAt: 0 })
    render(<TaskBoardAction {...failed.props} />)
    expect(screen.getByRole('alert').textContent).toContain('unavailable')
  })

  it('shows the command-failure line with the code until the next successful command', () => {
    const board = makeProps({ status: 'ready', tasks: [task()], metrics: undefined, phaseProgress: new Map(), taskGates: new Map(), error: 'stale-revision', updatedAt: 1 })
    render(<TaskBoardAction {...board.props} />)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('stale-revision')
    expect(alert.textContent).toContain('已重新同步')
  })

  it('labels every task state through the dictionary', () => {
    const states = [
      'planning', 'awaiting-input', 'awaiting-decision', 'pausing',
      'paused', 'cancelling', 'cancelled', 'failed',
    ] as const
    const rows = states.map(state => task({ state }))
    const { props } = makeProps(ready(rows))
    render(<TaskBoardAction {...props} />)
    // The state word renders inside the row's meta line ("state · 版本 n").
    for (const state of states) {
      const word = zh[`state.${state}` as const]
      const metas = screen.getAllByText((_, element) =>
        element?.textContent?.includes(word) === true && element.textContent.includes('版本'))
      expect(metas.length).toBeGreaterThan(0)
    }
  })
})

/** Slot ledger reader: entry presence in the declared drawer seat. */
function seatRegistered(ctx: Context): boolean {
  return ctx.slots.entries('workbench.drawer.tasks').length > 0
}

/** Boot the browser half over a real slot tree and a scripted tasks Remote. */
async function boot(options: { loadFails?: boolean } = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  // The drawer shell's seat declaration: the board registers into it.
  ctx.slots.register({
    name: 'root',
    children: {
      'workbench.drawer.tasks': { kind: 'single', scope: 'root' },
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
    listPhaseRuns: async () => ({ ok: true as const, value: [] }),
  } as never)
  ctx.provide('remote.metrics', {
    metrics: async () => ({
      ok: true as const,
      value: { live: 0, gate: 0, ask: 0, asset: 0, throughput: [], gatePassRate: { a: 0, b: 0, c: 0 } },
    }),
  } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('task-board browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.tasks', 'remote.metrics', 'locale'])
  })

  it('registers the drawer seat entry, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await boot()
    expect(seatRegistered(ctx)).toBe(true)
    await fiber.dispose()
    expect(seatRegistered(ctx)).toBe(false)
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    const { ctx, fiber } = await boot()
    const translate = ctx.locale.bind(NS)
    // jsdom's navigator language is en-US, so the active locale starts en.
    expect(translate('refresh')).toBe(en.refresh)
    ctx.locale.setLocale('zh')
    expect(translate('refresh')).toBe(zh.refresh)
    await fiber.dispose()
    expect(translate('refresh')).not.toBe(zh.refresh)
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('wires the entry inject face to the controller callbacks', async () => {
    const { ctx, fiber } = await boot()
    const entry = ctx.slots.entries('workbench.drawer.tasks').at(0)
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
      children: { 'workbench.drawer.tasks': { kind: 'single', scope: 'root' } },
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
    ctx.provide('remote.tasks', { listTasks, listPhaseRuns: async () => ({ ok: true, value: [] }) } as never)
    ctx.provide('remote.metrics', {
      metrics: async () => ({
        ok: true,
        value: { live: 0, gate: 0, ask: 0, asset: 0, throughput: [], gatePassRate: { a: 0, b: 0, c: 0 } },
      }),
    } as never)
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
