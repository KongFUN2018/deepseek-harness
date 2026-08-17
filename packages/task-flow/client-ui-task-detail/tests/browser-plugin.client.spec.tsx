// @vitest-environment jsdom
/**
 * The task-detail plugin's halves. Presentation: the owner-selected task id
 * loads on change, the ready state renders the task, phase runs, and gate
 * verdicts, a missing task shows the not-found line, an undefined selection
 * shows the empty state, and the idle/loading panels render their copy.
 * Browser half on a real SlotRegistry with a scripted tasks Remote: the
 * drawer seat entry registers (fiber teardown removes it — HMR safety) and
 * dictionaries register per locale. The node half is inert; the invariant
 * companion reserves ownership.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { makeTranslate, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { GateCheckResult, PhaseRunRecord, TaskRecord } from '@deepseek-ai/dsh-task/types'
import type { TaskDetailState } from '../src/client/detail.ts'
import { TaskDetailAction, type TaskDetailActionProps } from '../src/client/TaskDetailAction.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as DetailInvariant from '../src/invariant.ts'
import { en, NS, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh)

let seq = 0

/** One task projection fixture. */
function task(): TaskRecord {
  seq += 1
  return {
    taskId: `t-${seq}` as TaskRecord['taskId'],
    workspaceId: 'ws-1',
    pinnedRecipe: { recipeId: 'recipe-a' as never, revision: 1, schemaVersion: 1, contentHash: 'hash' },
    state: 'running',
    revision: 4,
    createdAt: seq * 10,
  }
}

/** Component props with a controllable detail-state source and a spy loader. */
function makeProps(state: TaskDetailState, taskId: string | undefined = 't-1'): {
  props: TaskDetailActionProps
  load: ReturnType<typeof vi.fn>
} {
  const load = vi.fn()
  const useDetail = <S,>(selector: (snapshot: TaskDetailState) => S) => selector(state)
  const unusedGlobal = { getSnapshot: () => ({}), subscribe: () => () => {} } as never
  const composed: TaskDetailActionProps = {
    taskId,
    t,
    useDetail,
    load,
    useSessions: unusedGlobal,
    useWorkspaces: unusedGlobal,
  }
  return { props: composed, load }
}

const idle = (): TaskDetailState => ({ status: 'idle', phaseRuns: [], gateResults: [], digest: undefined })

describe('TaskDetailAction', () => {
  it('loads the owner task id on mount and renders the task, phase runs, and verdicts', () => {
    const row = task()
    const phase: PhaseRunRecord = {
      phaseRunId: 'pr-1' as PhaseRunRecord['phaseRunId'],
      runId: 'r-1' as PhaseRunRecord['runId'],
      taskId: row.taskId,
      phaseId: 'phase-a',
      state: 'gate-running',
      revision: 1,
    }
    const gate: GateCheckResult = {
      submissionId: 's-1' as GateCheckResult['submissionId'],
      checkId: 'check-a',
      passed: true,
      recordedAt: 1,
    }
    const { props, load } = makeProps({ status: 'ready', task: row, phaseRuns: [phase], gateResults: [gate], digest: undefined }, String(row.taskId))
    render(<TaskDetailAction {...props} />)
    expect(load).toHaveBeenCalledWith(String(row.taskId))
    expect(screen.getByText('phase-a')).toBeTruthy()
    expect(screen.getByText('check-a')).toBeTruthy()
  })

  it('reloads when the owner switches the task id', () => {
    const row = task()
    const { props, load } = makeProps({ status: 'ready', task: row, phaseRuns: [], gateResults: [], digest: undefined }, 't-1')
    const { rerender } = render(<TaskDetailAction {...props} />)
    expect(load).toHaveBeenCalledWith('t-1')
    load.mockClear()
    rerender(<TaskDetailAction {...props} taskId="t-2" />)
    expect(load).toHaveBeenCalledWith('t-2')
  })

  it('renders the empty state while no task is selected and loads nothing', () => {
    const { props, load } = makeProps(idle())
    render(<TaskDetailAction {...props} taskId={undefined} />)
    expect(screen.getByText(zh.empty)).toBeTruthy()
    expect(load).not.toHaveBeenCalled()
  })

  it('shows the not-found line for a missing task', () => {
    const { props } = makeProps({ status: 'failed', error: 'not-found', phaseRuns: [], gateResults: [], digest: undefined })
    render(<TaskDetailAction {...props} />)
    expect(screen.getByRole('alert').textContent).toBe(zh['not-found'])
  })

  it('renders the loading panel', () => {
    const loading = makeProps({ status: 'loading', phaseRuns: [], gateResults: [], digest: undefined })
    render(<TaskDetailAction {...loading.props} />)
    expect(screen.getByText(zh.loading)).toBeTruthy()
  })

  it('marks every task state through the dot semantics', () => {
    const states = [
      'planning', 'running', 'completed', 'failed', 'awaiting-input',
      'awaiting-decision', 'pausing', 'paused', 'cancelling', 'cancelled',
    ] as const
    for (const state of states) {
      const row = task()
      const { props } = makeProps({ status: 'ready', task: { ...row, state }, phaseRuns: [], gateResults: [], digest: undefined })
      render(<TaskDetailAction {...props} />)
      const metas = screen.getAllByText((_, element) =>
        element?.textContent?.includes(state) === true && element.textContent.includes('版本'))
      expect(metas.length).toBeGreaterThan(0)
      cleanup()
    }
  })

  it('shows the load-failure line for a non-missing error', () => {
    const { props } = makeProps({ status: 'failed', error: 'unavailable', phaseRuns: [], gateResults: [], digest: undefined })
    render(<TaskDetailAction {...props} />)
    expect(screen.getByRole('alert').textContent).toContain('unavailable')
  })

  it('renders the load-failure line when a failure carries no code', () => {
    const { props } = makeProps({ status: 'failed', phaseRuns: [], gateResults: [], digest: undefined })
    render(<TaskDetailAction {...props} />)
    expect(screen.getByRole('alert').textContent).toContain(zh['error.load'].split('{code}')[0])
  })

  it('shows the none line for empty phase runs and verdicts', () => {
    const row = task()
    const { props } = makeProps({ status: 'ready', task: row, phaseRuns: [], gateResults: [], digest: undefined })
    render(<TaskDetailAction {...props} />)
    expect(screen.getAllByText(zh.none).length).toBe(2)
  })

  it('marks a failed verdict', () => {
    const row = task()
    const gate: GateCheckResult = {
      submissionId: 's-1' as GateCheckResult['submissionId'],
      checkId: 'check-a',
      passed: false,
      recordedAt: 1,
    }
    const { props } = makeProps({ status: 'ready', task: row, phaseRuns: [], gateResults: [gate], digest: undefined })
    render(<TaskDetailAction {...props} />)
    expect(screen.getByText(zh.failed)).toBeTruthy()
  })
})

/** Slot ledger reader: entry presence in the declared drawer seat. */
function seatRegistered(ctx: Context): boolean {
  return ctx.slots.entries('workbench.drawer.detail').length > 0
}

/** Boot the browser half over a real slot tree and a scripted tasks Remote. */
async function boot() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  // The drawer shell's seat declaration: the detail registers into it.
  ctx.slots.register({
    name: 'root',
    children: {
      'workbench.drawer.detail': { kind: 'single', scope: 'root' },
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
  ctx.provide('remote.digest', {
    digest: async () => ({ ok: true as const, value: {
      taskId: 't-1' as never, state: 'running', revision: 1, runs: [], timeline: [],
      phaseSummaries: [], decisionHistory: [], deliverableStates: [],
    } }),
  } as never)
  ctx.provide('remote.tasks', {
    getTask: async () => ({ ok: true as const, value: undefined }),
    listPhaseRuns: async () => ({ ok: true as const, value: [] }),
    listGateResults: async () => ({ ok: true as const, value: [] }),
  } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('task-detail browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.tasks', 'remote.digest', 'locale'])
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
    // 'empty' is namespace-exclusive: the common vocabulary also carries
    // generic words like 'loading', which would mask the namespace removal.
    expect(translate('empty')).toBe(en.empty)
    ctx.locale.setLocale('zh')
    expect(translate('empty')).toBe(zh.empty)
    await fiber.dispose()
    expect(translate('empty')).not.toBe(zh.empty)
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('wires the entry inject face to the controller load callback', async () => {
    const { ctx, fiber } = await boot()
    const entry = ctx.slots.entries('workbench.drawer.detail').at(0)
    expect(entry).toBeDefined()
    const injectFace = (entry as unknown as { inject?: () => unknown }).inject
    expect(injectFace).toBeTypeOf('function')
    const injected = injectFace?.() as {
      hooks: { detail: { getSnapshot(): TaskDetailState } }
      load: (taskId: string) => void
    }
    expect(injected.hooks.detail.getSnapshot().status).toBe('idle')
    expect(() => { injected.load('t-1') }).not.toThrow()
    await fiber.dispose()
  })
})

describe('task-detail node half', () => {
  it('contributes no host behavior', () => {
    expect(applyNode).not.toThrow()
  })
})

describe('task-detail invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(DetailInvariant)
    await fiber.await()
    expect(DetailInvariant.name).toBe('client-ui-task-detail-invariant')
    expect(DetailInvariant.inject).toEqual(['invariants'])
    await fiber.dispose()
  })
})
