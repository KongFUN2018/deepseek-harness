/**
 * Task detail plugin, browser half: one `sidebar.footer.action` entry whose
 * trigger opens the on-demand per-task detail panel. All data lives in the
 * React-free controller (`detail.ts`): a getTask load over the tasks Remote,
 * then the phase runs of the current run and each active submission's gate
 * verdicts. The component sees only the store snapshot and the load callback
 * through the inject face; the host projections stay the single authority.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated tasks Remote namespace into this compilation program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls ui-sidebar's SlotMap merge (the 'sidebar.footer.action' entry).
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TaskDetailController } from './detail.ts'
import { TaskDetailAction } from './TaskDetailAction.tsx'
import { en, NS, zh, type TaskDetailKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The task detail's copy. */
    'taskDetail': TaskDetailKey
  }
}

/** Required services for the footer entry, the tasks Remote, and copy. */
export const inject = ['slots', 'remote', 'remote.tasks', 'locale']

/**
 * Client plugin body: the dictionaries, the controller, and the footer entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-task-detail: dictionaries')
  const detail = new TaskDetailController(ctx)
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'task-detail',
    // Beside the attention inbox: after it, keeping the settings seat visually last.
    order: 12,
    locale: NS,
    inject: () => ({
      hooks: { detail: detail.store },
      load: (taskId: string) => { void detail.load(taskId) },
    }),
  }, TaskDetailAction))
}
