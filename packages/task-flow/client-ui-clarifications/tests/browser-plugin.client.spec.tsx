// @vitest-environment jsdom
/**
 * The clarification-queue plugin's halves. Presentation: open clarification
 * rows render read-only with their source and state, non-clarification or
 * non-open rows are absent, and the loading/empty/failed panels render their
 * copy. Browser half on a real SlotRegistry with a scripted workbenchHost
 * Remote: the drawer seat entry registers (fiber teardown removes it — HMR
 * safety), dictionaries register per locale, and the boot load reaches the
 * Remote. The node half is inert; the invariant companion reserves ownership.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { AttentionItemView } from '@deepseek-ai/dsh-workbench-host/types'
import type { ClarificationsState } from '../src/client/clarifications.ts'
import { ClarificationsAction, type ClarificationsActionProps } from '../src/client/ClarificationsAction.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as ClarificationsInvariant from '../src/invariant.ts'
import { en, NS, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh)

let seq = 0

/** One open-clarification fixture; `over` overrides any field. */
function item(over: Partial<AttentionItemView> = {}): AttentionItemView {
  seq += 1
  return {
    itemId: `i-${seq}` as AttentionItemView['itemId'],
    kind: 'clarification',
    status: 'open',
    entityRevision: 1,
    title: `clarify-${seq}`,
    ...over,
  }
}

/** Component props with a controllable state source and a spy refresh. */
function makeProps(state: ClarificationsState): {
  props: ClarificationsActionProps
  refresh: ReturnType<typeof vi.fn>
} {
  const refresh = vi.fn()
  const useClarifications = <S,>(selector: (snapshot: ClarificationsState) => S) => selector(state)
  // The framework's global standard props (useSessions/useWorkspaces) are
  // unused by this component; stable no-op stubs satisfy the share contract.
  const unusedGlobal = { getSnapshot: () => ({}), subscribe: () => () => {} } as never
  const composed: ClarificationsActionProps = {
    t,
    useClarifications,
    refresh,
    useSessions: unusedGlobal,
    useWorkspaces: unusedGlobal,
  }
  return { props: composed, refresh }
}

const ready = (items: readonly AttentionItemView[], over: Partial<ClarificationsState> = {}): ClarificationsState => ({
  status: 'ready', items, snapshotVersion: 1, updatedAt: 1, ...over,
})

describe('ClarificationsAction', () => {
  it('renders the source, status, and revision of every open clarification row', () => {
    const row = item({ title: 'scope ambiguity', entityRevision: 4 })
    const { props } = makeProps(ready([row]))
    render(<ClarificationsAction {...props} />)
    expect(screen.getByText('scope ambiguity')).toBeTruthy()
    // The meta line carries status and revision copy; count leaf matches (the
    // matcher reports each element containing the text, so assert > 0).
    expect(screen.getAllByText(/版本 4/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(new RegExp(zh['status.open'])).length).toBeGreaterThan(0)
  })

  it('skips non-clarification and non-open rows', () => {
    const open = item({ title: 'kept' })
    const decision = item({ kind: 'c-decision', title: 'dropped-decision' })
    const resolved = item({ status: 'resolved', title: 'dropped-resolved' })
    const recovery = item({ kind: 'recovery', title: 'dropped-recovery' })
    const { props } = makeProps(ready([open, decision, resolved, recovery]))
    render(<ClarificationsAction {...props} />)
    expect(screen.getByText('kept')).toBeTruthy()
    expect(screen.queryByText('dropped-decision')).toBeNull()
    expect(screen.queryByText('dropped-resolved')).toBeNull()
    expect(screen.queryByText('dropped-recovery')).toBeNull()
  })

  it('renders the loading, empty, and failed panels', () => {
    const loading = makeProps({ status: 'loading', items: [], snapshotVersion: 0, updatedAt: 0 })
    render(<ClarificationsAction {...loading.props} />)
    expect(screen.getByText(zh.loading)).toBeTruthy()
    cleanup()

    const empty = makeProps(ready([]))
    render(<ClarificationsAction {...empty.props} />)
    expect(screen.getByText(zh.empty)).toBeTruthy()
    cleanup()

    const failed = makeProps({ status: 'failed', items: [], snapshotVersion: 0, error: 'unavailable', updatedAt: 0 })
    render(<ClarificationsAction {...failed.props} />)
    expect(screen.getByRole('alert').textContent).toContain('unavailable')
  })

  it('renders the section title when rows are present', () => {
    const { props } = makeProps(ready([item()]))
    render(<ClarificationsAction {...props} />)
    expect(screen.getByText(zh['section.clarifications'])).toBeTruthy()
  })

  it('fires refresh from the footer', () => {
    const { props, refresh } = makeProps(ready([item()]))
    render(<ClarificationsAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

/** Slot ledger reader: entry presence in the declared drawer seat. */
function seatRegistered(ctx: Context, seat: 'workbench.drawer.clarifications'): boolean {
  return ctx.slots.entries(seat).length > 0
}

/** Boot the browser half over a real slot tree and a scripted workbench Remote. */
async function boot(options: { loadFails?: boolean; items?: AttentionItemView[] } = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  // The drawer shell's seat declaration: the clarifications queue registers into it.
  ctx.slots.register({
    name: 'root',
    children: {
      'workbench.drawer.clarifications': { kind: 'single', scope: 'root' },
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
    listSnapshot: options.loadFails
      ? async () => ({ ok: false as const, error: { code: 'unavailable', message: 'x', details: {} } })
      : async () => ({ ok: true as const, value: { snapshotVersion: 0, items: options.items ?? [] } }),
  } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('clarification-queue browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.workbenchHost', 'locale'])
  })

  it('registers the drawer seat entry, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await boot()
    expect(seatRegistered(ctx, 'workbench.drawer.clarifications')).toBe(true)
    await fiber.dispose()
    expect(seatRegistered(ctx, 'workbench.drawer.clarifications')).toBe(false)
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

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('issues the boot load through the workbenchHost Remote', async () => {
    const listSnapshot = vi.fn(async () => ({ ok: true as const, value: { snapshotVersion: 0, items: [] } }))
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.slots.register({
      name: 'root',
      children: { 'workbench.drawer.clarifications': { kind: 'single', scope: 'root' } },
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
    ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(listSnapshot).toHaveBeenCalledTimes(1)
    await fiber.dispose()
  })

  it('wires the entry inject face to the filtered controller state', async () => {
    const open = item({ title: 'kept' })
    const other = item({ kind: 'b-confirm', title: 'dropped' })
    const { ctx, fiber } = await boot({ items: [open, other] })
    const entry = ctx.slots.entries('workbench.drawer.clarifications').at(0)
    expect(entry).toBeDefined()
    const injectFace = (entry as unknown as { inject?: () => unknown }).inject
    expect(injectFace).toBeTypeOf('function')
    const injected = injectFace?.() as {
      hooks: { clarifications: { getSnapshot(): ClarificationsState } }
      refresh: () => void
    }
    const state = injected.hooks.clarifications.getSnapshot()
    expect(state.status).toBe('ready')
    expect(state.items.map(i => i.title)).toEqual(['kept'])
    expect(() => { injected.refresh() }).not.toThrow()
    await fiber.dispose()
  })
})

describe('clarification-queue node half', () => {
  it('contributes no host behavior', () => {
    expect(applyNode).not.toThrow()
  })
})

describe('clarification-queue invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(ClarificationsInvariant)
    await fiber.await()
    expect(ClarificationsInvariant.name).toBe('client-ui-clarifications-invariant')
    expect(ClarificationsInvariant.inject).toEqual(['invariants'])
    await fiber.dispose()
  })
})
