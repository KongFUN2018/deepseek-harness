// @vitest-environment jsdom
/**
 * The attention-inbox plugin's halves. Presentation: the footer trigger
 * opens the panel, B rows select and batch-confirm, C rows carry a decision
 * input that fires the decide callback, the conflict line carries the
 * non-confirmed count, and the loading/empty/failed panels render their copy.
 * Browser half on a real SlotRegistry with a scripted workbench Remote: the
 * footer entry registers (fiber teardown removes it — HMR safety),
 * dictionaries register per locale, and the boot load reaches the Remotes.
 * The node half is inert; the invariant companion reserves ownership.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate, stubSettingsScope } from '@deepseek-ai/dsh-client-test-runtime'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { apply as applyLocale, inject as localeInject } from '@deepseek-ai/dsh-client-locale/client'
import type { AttentionItemView } from '@deepseek-ai/dsh-workbench-host/types'
import type { InboxState } from '../src/client/inbox.ts'
import { AttentionInboxAction, type AttentionInboxActionProps } from '../src/client/AttentionInboxAction.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as applyNode } from '../src/index.ts'
import * as InboxInvariant from '../src/invariant.ts'
import { en, NS, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh)

let seq = 0

/** One attention-item fixture; `over` overrides any field. */
function item(over: Partial<AttentionItemView> = {}): AttentionItemView {
  seq += 1
  return {
    itemId: `i-${seq}` as AttentionItemView['itemId'],
    kind: 'b-confirm',
    status: 'open',
    entityRevision: 1,
    title: `check-${seq}` ,
    ...over,
  }
}

/** Component props with a controllable inbox-state source and spy callbacks. */
function makeProps(state: InboxState, wide = true): {
  props: AttentionInboxActionProps
  confirm: ReturnType<typeof vi.fn>
  decide: ReturnType<typeof vi.fn>
  refresh: ReturnType<typeof vi.fn>
} {
  const confirm = vi.fn()
  const decide = vi.fn()
  const refresh = vi.fn()
  const useInbox = <S,>(selector: (snapshot: InboxState) => S) => selector(state)
  // The framework's global standard props (useSessions/useWorkspaces) are
  // unused by this component; stable no-op stubs satisfy the share contract.
  const unusedGlobal = { getSnapshot: () => ({}), subscribe: () => () => {} } as never
  const composed: AttentionInboxActionProps = {
    wide,
    t,
    useInbox,
    confirm,
    decide,
    refresh,
    useSessions: unusedGlobal,
    useWorkspaces: unusedGlobal,
  }
  return { props: composed, confirm, decide, refresh }
}

const ready = (items: readonly AttentionItemView[], over: Partial<InboxState> = {}): InboxState => ({
  status: 'ready', items, snapshotVersion: 1, cursor: 0, conflictCount: 0, updatedAt: 1, ...over,
})

describe('AttentionInboxAction', () => {
  it('opens the panel and batch-confirms the selected B rows', () => {
    const first = item({ title: 'gate-a' })
    const second = item({ title: 'gate-b' })
    const { props, confirm } = makeProps(ready([first, second]))
    render(<AttentionInboxAction {...props} />)
    const trigger = screen.getByRole('button', { name: zh.trigger })
    fireEvent.click(trigger)
    expect(screen.getByText('gate-a')).toBeTruthy()
    const checkbox = screen.getAllByRole('checkbox')[0] as HTMLElement
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: zh.confirm }))
    expect(confirm).toHaveBeenCalledWith([{ itemId: String(first.itemId), expectedEntityRevision: 1 }])
  })

  it('fires the decide callback for a C row with the entered decision', () => {
    const row = item({ kind: 'c-decision', title: 'review' })
    const { props, decide } = makeProps(ready([row]))
    render(<AttentionInboxAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    const input = screen.getByPlaceholderText(zh['decision.placeholder'])
    fireEvent.change(input, { target: { value: 'approve' } })
    fireEvent.click(screen.getByRole('button', { name: zh.decide }))
    expect(decide).toHaveBeenCalledWith(String(row.itemId), 'approve')
  })

  it('keeps the decide button disabled for an empty decision', () => {
    const row = item({ kind: 'c-decision' })
    const { props, decide } = makeProps(ready([row]))
    render(<AttentionInboxAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.decide }).disabled).toBe(true)
    expect(decide).not.toHaveBeenCalled()
  })

  it('shows the conflict line with the non-confirmed count', () => {
    const { props } = makeProps(ready([item()], { conflictCount: 2, error: 'conflict:2' }))
    render(<AttentionInboxAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('2')
  })

  it('renders the loading, empty, and failed panels', () => {
    const loading = makeProps({ status: 'loading', items: [], snapshotVersion: 0, cursor: 0, conflictCount: 0, updatedAt: 0 })
    render(<AttentionInboxAction {...loading.props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    expect(screen.getByText(zh.loading)).toBeTruthy()
    cleanup()

    const empty = makeProps(ready([]))
    render(<AttentionInboxAction {...empty.props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    expect(screen.getByText(zh.empty)).toBeTruthy()
    cleanup()

    const failed = makeProps({ status: 'failed', items: [], snapshotVersion: 0, cursor: 0, conflictCount: 0, error: 'unavailable', updatedAt: 0 })
    render(<AttentionInboxAction {...failed.props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    expect(screen.getByRole('alert').textContent).toContain('unavailable')
  })

  it('renders the rail variant when the sidebar is collapsed', () => {
    const rail = makeProps(ready([]), false)
    render(<AttentionInboxAction {...rail.props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    expect(screen.getByText(zh.empty)).toBeTruthy()
  })

  it('closes through the close control', () => {
    const { props } = makeProps(ready([]))
    render(<AttentionInboxAction {...props} />)
    const trigger = screen.getByRole('button', { name: zh.trigger })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: zh.close }))
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('labels every status and kind through the dictionary', () => {
    const rows = [
      item({ kind: 'b-confirm', status: 'open', title: 'b-open' }),
      item({ kind: 'b-confirm', status: 'resolved', title: 'b-resolved' }),
      item({ kind: 'b-confirm', status: 'invalidated', title: 'b-invalidated' }),
      item({ kind: 'b-confirm', status: 'stale', title: 'b-stale' }),
      item({ kind: 'c-decision', status: 'open', title: 'c-open' }),
      item({ kind: 'clarification', status: 'open', title: 'cl-open' }),
      item({ kind: 'recovery', status: 'open', title: 'r-open' }),
    ]
    const { props } = makeProps(ready(rows))
    render(<AttentionInboxAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    const words = [
      zh['kind.b-confirm'], zh['kind.c-decision'], zh['kind.clarification'], zh['kind.recovery'],
      zh['status.open'], zh['status.resolved'], zh['status.invalidated'], zh['status.stale'],
    ]
    for (const word of words) {
      const metas = screen.getAllByText((_, element) =>
        element?.textContent?.includes(word) === true && element.textContent.includes('版本'))
      expect(metas.length).toBeGreaterThan(0)
    }
  })

  it('deselects a toggled batch row and disables the confirm button', () => {
    const row = item({ title: 'gate-a' })
    const { props } = makeProps(ready([row]))
    render(<AttentionInboxAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    const checkbox = screen.getAllByRole('checkbox')[0] as HTMLElement
    fireEvent.click(checkbox)
    fireEvent.click(checkbox)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: zh.confirm }).disabled).toBe(true)
  })

  it('shows the command-failure line with the code', () => {
    const { props } = makeProps(ready([item()], { error: 'stale-revision' }))
    render(<AttentionInboxAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('stale-revision')
    expect(alert.textContent).toContain('已重新同步')
  })

  it('hides the conflict line when the count is zero', () => {
    const { props } = makeProps(ready([item()], { error: 'conflict:0', conflictCount: 0 }))
    render(<AttentionInboxAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('fires refresh from the read-only footer', () => {
    const { props, refresh } = makeProps(ready([item({ kind: 'clarification' })]))
    render(<AttentionInboxAction {...props} />)
    fireEvent.click(screen.getByRole('button', { name: zh.trigger }))
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})

/** Slot ledger reader: entry ids currently registered in the footer list. */
function footerEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots
    .entries('sidebar.footer.action')
    .map(entry => entry.options.id)
}

/** Boot the browser half over a real slot tree and a scripted workbench Remote. */
async function boot(options: { loadFails?: boolean; items?: AttentionItemView[] } = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.footer.action': { kind: 'list', scope: 'root' },
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
    confirmBatch: async () => ({ ok: true as const, value: { snapshotVersion: 1, results: [] } }),
    resolveDecision: async () => ({ ok: true as const, value: { snapshotVersion: 1, outcome: 'resolved' } }),
  } as never)
  ctx.provide('remote.workbenchHostStream', {
    listIncremental: async () => ({ ok: true as const, value: { streamId: 'stream-1', cursor: 0, events: [] } }),
  } as never)
  ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
  await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
}

describe('attention-inbox browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'remote', 'remote.workbenchHost', 'remote.workbenchHostStream', 'locale'])
  })

  it('registers the footer entry, and fiber teardown removes it (HMR safety)', async () => {
    const { ctx, fiber } = await boot()
    expect(footerEntryIds(ctx)).toContain('attention-inbox')
    await fiber.dispose()
    expect(footerEntryIds(ctx)).not.toContain('attention-inbox')
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

  it('issues the boot load through both Remotes', async () => {
    const listSnapshot = vi.fn(async () => ({ ok: true as const, value: { snapshotVersion: 0, items: [] } }))
    const listIncremental = vi.fn(async () => ({ ok: true as const, value: { streamId: 'stream-1', cursor: 0, events: [] } }))
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
    ctx.provide('remote.workbenchHost', { listSnapshot, confirmBatch: async () => ({ ok: true as const, value: { snapshotVersion: 1, results: [] } }), resolveDecision: async () => ({ ok: true as const, value: { snapshotVersion: 1, outcome: 'resolved' } }) } as never)
    ctx.provide('remote.workbenchHostStream', { listIncremental } as never)
    ctx.provide('settingsScope', { bind: () => stubSettingsScope().scope } as never)
    await ctx.plugin({ inject: localeInject, apply: applyLocale }).await()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(listSnapshot).toHaveBeenCalledTimes(1)
    expect(listIncremental).toHaveBeenCalledTimes(1)
    await fiber.dispose()
  })

  it('wires the entry inject face to the controller callbacks', async () => {
    const first = item()
    const { ctx, fiber } = await boot({ items: [first] })
    const entry = ctx.slots.entries('sidebar.footer.action').find(e => e.options.id === 'attention-inbox')
    expect(entry).toBeDefined()
    const injectFace = (entry as unknown as { inject?: () => unknown }).inject
    expect(injectFace).toBeTypeOf('function')
    const injected = injectFace?.() as {
      hooks: { inbox: { getSnapshot(): InboxState } }
      refresh: () => void
      confirm: (targets: unknown[]) => void
      decide: (itemId: string, decision: string) => void
    }
    expect(injected.hooks.inbox.getSnapshot().status).toBe('ready')
    expect(() => { injected.refresh() }).not.toThrow()
    expect(() => { injected.confirm([]) }).not.toThrow()
    expect(() => { injected.decide('i-absent', 'approve') }).not.toThrow()
    expect(() => { injected.decide(String(first.itemId), 'approve') }).not.toThrow()
    await fiber.dispose()
  })
})

describe('attention-inbox node half', () => {
  it('contributes no host behavior', () => {
    expect(applyNode).not.toThrow()
  })
})

describe('attention-inbox invariant companion', () => {
  it('reserves package ownership under its declared companion name', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry, { enabled: true })
    const fiber = ctx.plugin(InboxInvariant)
    await fiber.await()
    expect(InboxInvariant.name).toBe('client-ui-attention-inbox-invariant')
    expect(InboxInvariant.inject).toEqual(['invariants'])
    await fiber.dispose()
  })
})
