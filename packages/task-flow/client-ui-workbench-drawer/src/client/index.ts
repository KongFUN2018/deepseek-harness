/**
 * Workbench drawer plugin, browser half: one `shell.overlay` entry that
 * renders the floating trigger and the right-side drawer, and declares the
 * three content seats (`workbench.drawer.tasks` / `.inbox` / `.detail`) the
 * task-flow content packages register into. The badge aggregates (open
 * attention count, active task count) live in the React-free controller
 * (`badge.ts`) over the workbench-host and tasks Remotes; the component sees
 * only the store snapshot through the inject face. The drawer is
 * non-modal — no mask, the conversation stays interactive — and stays
 * mounted while the entry lives, so closing and reopening keeps the tab
 * selection and the user width.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the generated workbenchHost/tasks Remote namespaces and
// the forwarded-event key face into this compilation program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls ui-layout's SlotMap merge (the 'shell.overlay' entry).
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { BadgeController } from './badge.ts'
import { WorkbenchDrawer } from './WorkbenchDrawer.tsx'
import { en, NS, zh, type WorkbenchDrawerKey } from './locales.ts'
// Type-only: pulls this package's SlotMap merge (the three drawer seats) and
// re-exports the owner shares the drawer's content packages consume.
export type { DrawerTasksOwnerProps, DrawerDetailOwnerProps } from './slots.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The workbench drawer's copy. */
    'workbenchDrawer': WorkbenchDrawerKey
  }
}

/** Required services for the overlay entry, the badge Remotes, and copy. */
export const inject = ['slots', 'remote', 'remote.workbenchHost', 'remote.tasks', 'locale']

/**
 * Client plugin body: the dictionaries, the badge controller, and the
 * overlay entry with the three content-seat declarations.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-workbench-drawer: dictionaries')
  const badge = new BadgeController(ctx)
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'workbench-drawer',
    // The workbench drawer sits beside any other overlay entries, after them.
    order: 100,
    locale: NS,
    children: {
      'workbench.drawer.tasks': { kind: 'single', scope: 'root' },
      'workbench.drawer.inbox': { kind: 'single', scope: 'root' },
      'workbench.drawer.detail': { kind: 'single', scope: 'root' },
    },
    inject: () => ({
      hooks: { badge: badge.store },
    }),
  }, WorkbenchDrawer))
}
