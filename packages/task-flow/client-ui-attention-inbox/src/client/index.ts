/**
 * Attention inbox plugin, browser half: one `sidebar.footer.action` entry
 * whose trigger opens the decision-inbox panel. All item data lives in the
 * React-free controller (`inbox.ts`): a snapshot load over the workbench-host
 * Remote, revision-gated folds of forwarded `workbench/attention-updated`
 * deliveries, a delta-stream replay on reconnect, and the batch-confirm /
 * single-decision verbs carrying each row's compare-and-set revision. The
 * component sees only the store snapshot and callbacks through the inject
 * face; a conflict, failure, or reconnect resyncs from the Remote (the host
 * projection stays authoritative and no non-resolved item is silently
 * removed).
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated workbenchHost/workbenchHostStream Remote
// namespaces and the forwarded-event key face into this compilation program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.footer.action' entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { BatchConfirmItem } from '@deepseek-ai/dsh-workbench-host/types'
import { AttentionInboxController } from './inbox.ts'
import { AttentionInboxAction } from './AttentionInboxAction.tsx'
import { en, NS, zh, type AttentionInboxKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The attention inbox's copy. */
    'attentionInbox': AttentionInboxKey
  }
}

/** Required services for the footer entry, the inbox Remotes, and copy. */
export const inject = ['slots', 'remote', 'remote.workbenchHost', 'remote.workbenchHostStream', 'locale']

/**
 * Client plugin body: the dictionaries, the controller, and the footer entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-attention-inbox: dictionaries')
  const inbox = new AttentionInboxController(ctx)
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'attention-inbox',
    // Beside the task board: after it, keeping the settings seat visually last.
    order: 11,
    locale: NS,
    inject: () => ({
      hooks: { inbox: inbox.store },
      refresh: () => { void inbox.refresh() },
      confirm: (targets: BatchConfirmItem[]) => { void inbox.confirm(targets) },
      decide: (itemId: string, decision: string) => {
        const item = inbox.store.getSnapshot().items.find(row => String(row.itemId) === itemId)
        if (item !== undefined) void inbox.decide(item, decision)
      },
    }),
  }, AttentionInboxAction))
}
