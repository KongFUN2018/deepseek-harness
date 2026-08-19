// @vitest-environment jsdom
/**
 * The recipe library plugin's halves. Presentation: cards show the recipe
 * name and the derived phase/check/deliverable counts, the `使用模板新建`
 * action fires the owner's openCreate callback (no recipe pre-selection — the
 * drawer's openCreate takes none), the loading/empty/failed panels render
 * their copy, and refresh reaches its callback. Browser half on a real
 * SlotRegistry with a scripted recipes Remote: the drawer seat entry registers
 * (fiber teardown removes it — HMR safety), dictionaries register per locale,
 * and the boot load reaches the Remote. The node half is inert; the invariant
 * companion reserves ownership.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { RecipeRevision } from '@deepseek-ai/dsh-recipe/types'
import type { RecipeLibraryState } from '../src/client/recipeLibrary.ts'
import { RecipeLibraryAction, type RecipeLibraryActionProps } from '../src/client/RecipeLibraryAction.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as LibraryInvariant from '../src/invariant.ts'
import { en, NS, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh)

/** One recipe revision fixture; `over` overrides any field. */
function recipe(over: Partial<RecipeRevision> = {}): RecipeRevision {
  return {
    recipeId: 'recipe-a' as RecipeRevision['recipeId'],
    revision: 1,
    schemaVersion: 1,
    contentHash: 'hash-a',
    registeredAt: 0,
    payload: {
      phases: [
        { phaseId: 'p0', kind: 'work', goal: '收集', inputs: [], outputs: ['draft'], submissionCriteria: [] },
        { phaseId: 'p1', kind: 'work', goal: '分析', inputs: [], outputs: ['analysis'], submissionCriteria: [] },
      ],
      gateChecks: [
        { checkId: 'c0', phaseId: 'p0', kind: 'A', machineScope: [], humanAction: [] },
      ],
      defaults: { batchConfirm: 'per-phase-single', clarify: { maxRounds: 3, splitMustDefault: false }, draftPolicy: 'block-finalize-not-draft' },
      p4Mode: { mode: 'auto' },
    },
    ...over,
  }
}

/** Component props with a controllable state source and spy callbacks. */
function makeProps(state: RecipeLibraryState): {
  props: RecipeLibraryActionProps
  openCreate: ReturnType<typeof vi.fn>
  setState: (next: RecipeLibraryState) => void
} {
  let current = state
  const openCreate = vi.fn()
  const refresh = vi.fn(() => Promise.resolve())
  const useLibrary = <S,>(selector: (snapshot: RecipeLibraryState) => S) => selector(current)
  const unusedGlobal = { getSnapshot: () => ({}), subscribe: () => () => {} } as never
  const composed: RecipeLibraryActionProps = {
    openInbox: vi.fn(),
    initialRecipeId: undefined,
    openDetail: vi.fn(),
    openCreate,
    t,
    useLibrary,
    refresh,
    useSessions: unusedGlobal,
    useWorkspaces: unusedGlobal,
  }
  return { props: composed, openCreate, setState: (next) => { current = next } }
}

const ready = (cards: RecipeLibraryState['cards']): RecipeLibraryState =>
  ({ status: 'ready', cards, updatedAt: 1 })

function cardsFixture(): RecipeLibraryState['cards'] {
  // Recompute the same derivations the controller does so the component spec
  // asserts the rendered strings without depending on the controller.
  const revisions = [
    recipe(),
    { ...recipe({ recipeId: 'recipe-b' as RecipeRevision['recipeId'] }), ...({ payload: {
      phases: [{ phaseId: 'p0', kind: 'work', goal: '复现', inputs: [], outputs: [], submissionCriteria: [] }],
      gateChecks: [],
      defaults: { batchConfirm: 'per-phase-single', clarify: { maxRounds: 3, splitMustDefault: false }, draftPolicy: 'block-finalize-not-draft' },
      p4Mode: { mode: 'auto' },
    } as RecipeRevision['payload'] }) },
  ]
  return revisions.map(rev => ({
    recipeId: String(rev.recipeId),
    phases: rev.payload.phases.length,
    checks: rev.payload.gateChecks.length,
    deliverables: new Set(rev.payload.phases.flatMap(phase => phase.outputs)).size,
    description: rev.payload.phases.map(phase => phase.goal).slice(0, 3).join(' · '),
  }))
}

describe('RecipeLibraryAction', () => {
  it('renders cards with name and derived counts', () => {
    const cards = cardsFixture()
    render(<RecipeLibraryAction {...makeProps(ready(cards)).props} />)
    expect(screen.getByText('recipe-a')).toBeTruthy()
    expect(screen.getByText('recipe-b')).toBeTruthy()
    expect(screen.getByText(zh.meta.replace('{phases}', '2').replace('{checks}', '1').replace('{deliverables}', '2'))).toBeTruthy()
    expect(screen.getByText(zh.meta.replace('{phases}', '1').replace('{checks}', '0').replace('{deliverables}', '0'))).toBeTruthy()
  })

  it('shows the phase-goal description on a card', () => {
    render(<RecipeLibraryAction {...makeProps(ready(cardsFixture())).props} />)
    expect(screen.getByText(zh.description.replace('{phases}', '2').replace('{goals}', '收集 · 分析'))).toBeTruthy()
  })

  it('fires openCreate when 使用模板新建 is pressed', () => {
    const { props, openCreate } = makeProps(ready(cardsFixture()))
    render(<RecipeLibraryAction {...props} />)
    fireEvent.click(screen.getAllByRole('button', { name: zh.use })[0]!)
    expect(openCreate).toHaveBeenCalledTimes(1)
  })

  it('renders the loading, empty, failed, and refresh panels', async () => {
    const loading = makeProps({ status: 'loading', cards: [], updatedAt: 0 })
    render(<RecipeLibraryAction {...loading.props} />)
    expect(screen.getByText(zh.loading)).toBeTruthy()
    cleanup()

    const empty = makeProps(ready([]))
    render(<RecipeLibraryAction {...empty.props} />)
    expect(screen.getByText(zh.empty)).toBeTruthy()
    expect(screen.getByRole('button', { name: zh.refresh })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    cleanup()

    const failed = makeProps({ status: 'failed', cards: [], error: 'unavailable', updatedAt: 0 })
    render(<RecipeLibraryAction {...failed.props} />)
    expect(screen.getByRole('alert').textContent).toContain('unavailable')
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

/** Slot ledger reader: entry presence in the declared drawer seat. */
function seatRegistered(ctx: Context): boolean {
  return ctx.slots.entries('workbench.drawer.recipeLibrary').length > 0
}

/** Boot the browser half over a real slot tree and a scripted recipes Remote. */
async function boot(options: { loadFails?: boolean } = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  // The drawer shell's seat declaration: the library registers into it.
  ctx.slots.register({
    name: 'root',
    children: {
      'workbench.drawer.recipeLibrary': { kind: 'single', scope: 'root' },
    },
  } as never, () => null)
  ctx.provide('connection', { api: { settings: {} }, isLoopback: false } as never)
  // A real Service instance routes ctx.remote.recipes through the Service
  // tracker's associate path (a plain object would leave the nested read
  // undefined), matching the board/task-create boot pattern.
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }

    $on(): () => void {
      return () => {}
    }
  }
  new RemoteService(ctx)
  ctx.provide('remote.recipes', {
    listDetails: options.loadFails
      ? async () => ({ ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } })
      : async () => ({ ok: true as const, value: [recipe()] }),
  } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('recipe-library browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.recipes', 'locale'])
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
    expect(translate('refresh')).toBe(en.refresh)
    ctx.locale.setLocale('zh')
    expect(translate('refresh')).toBe(zh.refresh)
    await fiber.dispose()
    expect(translate('refresh')).not.toBe(zh.refresh)
  })

  it('wires the entry inject face to the controller store', async () => {
    const { ctx, fiber } = await boot()
    const entry = ctx.slots.entries('workbench.drawer.recipeLibrary').at(0)
    expect(entry).toBeDefined()
    const injectFace = (entry as unknown as { inject?: () => unknown }).inject
    expect(injectFace).toBeTypeOf('function')
    const injected = injectFace?.() as {
      hooks: { library: { getSnapshot(): RecipeLibraryState } }
      refresh: () => void
    }
    const snapshot = injected.hooks.library.getSnapshot()
    expect(snapshot.status).toBe('ready')
    expect(snapshot.cards).toHaveLength(1)
    expect(() => { injected.refresh() }).not.toThrow()
    await fiber.dispose()
  })

  it('issues the boot load through the recipes Remote', async () => {
    const listDetails = vi.fn(async () => ({ ok: true as const, value: [recipe()] }))
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({
      name: 'root',
      children: { 'workbench.drawer.recipeLibrary': { kind: 'single', scope: 'root' } },
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
    ctx.provide('remote.recipes', { listDetails } as never)
    ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(listDetails).toHaveBeenCalledTimes(1)
    await fiber.dispose()
  })
})

describe('recipe-library node half', () => {
  it('contributes no host behavior', () => {
    expect(applyNode).not.toThrow()
  })
})

describe('recipe-library invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(LibraryInvariant)
    await fiber.await()
    expect(LibraryInvariant.name).toBe('client-ui-recipe-library-invariant')
    expect(LibraryInvariant.inject).toEqual(['invariants'])
    await fiber.dispose()
  })
})
