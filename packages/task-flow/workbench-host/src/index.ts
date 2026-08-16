/**
 * Workbench attention-channel host service: an in-memory versioned attention
 * inbox validating the host-client channel slice — snapshot reads,
 * compare-and-set Remote commands, and the forwarded push event — before the
 * M1 task engine lands its durable journal.
 * @module @deepseek-ai/dsh-workbench-host
 */

import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { WorkbenchItemId as WorkbenchItemIdValue } from './runtime.ts'
import type { WorkbenchItemId } from './types.ts'
import type {
  AttentionItemView,
  BatchConfirmItemResult,
  BatchConfirmRequest,
  BatchConfirmResponse,
  InvalidateItemRequest,
  InvalidateItemResponse,
  ResolveDecisionRequest,
  ResolveDecisionResponse,
  WorkbenchAttentionUpdate,
  WorkbenchItemId as WorkbenchItemIdType,  WorkbenchSnapshot,
} from './types.ts'

export { WorkbenchItemId } from './runtime.ts'
export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    workbenchHost: WorkbenchHostService
  }
}

/** Loader config: attention items seeded at boot for the channel slice. */
export interface Config {
  /** Items present at boot; ids must be unique and fields non-empty. */
  seedItems?: SeedItem[]
}

/** One attention item present in the inbox at boot. */
export interface SeedItem {
  /** Stable item identifier; unique within the seed list. */
  itemId: string
  /** Gate class of the item: B-class confirmations or C-class decisions. */
  kind: 'b-confirm' | 'c-decision'
  /** Human-readable inbox title for the item. */
  title: string
}

/** Mutable per-item state behind the immutable views. */
interface StoredItem {
  readonly itemId: WorkbenchItemId
  readonly kind: 'b-confirm' | 'c-decision'
  status: 'open' | 'invalidated' | 'resolved'
  entityRevision: number
  readonly title: string
  decision?: string
}

/** One committed change row carried by the push event. */
interface ChangedRow {
  readonly itemId: WorkbenchItemId
  readonly status: StoredItem['status']
  readonly entityRevision: number
}

/** Result of one compare-and-set attempt against the store, per target state. */
type TransitionResult<Next extends 'resolved' | 'invalidated'> =
  | { readonly outcome: Next; readonly item: StoredItem }
  | { readonly outcome: 'conflict' | 'stale' | 'already-resolved'; readonly item: StoredItem }
  | { readonly outcome: 'withdrawn' }

/** Validate one wire actor identity: non-empty after trim. */
function resolveActor(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError('workbench actor must be a non-empty string')
  }
  return value.trim()
}

/** Validate one wire compare-and-set revision. */
function resolveRevision(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`workbench ${field} must be a positive safe integer`)
  }
  return value
}

/** Validate one wire free-text field: non-empty after trim. */
function resolveText(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`workbench ${field} must be a non-empty string`)
  }
  return value.trim()
}

/** Materialize defaults and validate the boot seed list. */
function resolveSeeds(config: Config): Map<WorkbenchItemIdType, StoredItem> {
  const items = new Map<WorkbenchItemId, StoredItem>()
  for (const seed of config.seedItems ?? []) {
    const id = resolveText(seed.itemId, 'seed itemId')
    const key = WorkbenchItemIdValue(id)
    if (items.has(key)) {
      throw new TypeError(`workbench seed itemId "${id}" appears twice`)
    }
    items.set(key, {
      itemId: key,
      kind: seed.kind,
      status: 'open',
      entityRevision: 1,
      title: resolveText(seed.title, `seed item "${id}" title`),
    })
  }
  return items
}

/** Project one stored item into its immutable view. */
function viewOf(item: StoredItem): AttentionItemView {
  return {
    itemId: item.itemId,
    kind: item.kind,
    status: item.status,
    entityRevision: item.entityRevision,
    title: item.title,
    ...item.decision === undefined ? {} : { decision: item.decision },
  }
}

/** Workbench attention inbox (`ctx.workbenchHost`). */
export class WorkbenchHostService extends TypertRemoteService {
  static Config: z<Config> = z.object({
    seedItems: z.array(z.object({
      itemId: z.string(),
      kind: z.union(['b-confirm', 'c-decision'] as const),
      title: z.string(),
    })).default([]),
  })

  private readonly items: Map<WorkbenchItemId, StoredItem>
  private snapshotVersion: number

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'workbenchHost')
    this.items = resolveSeeds(config)
    this.snapshotVersion = this.items.size === 0 ? 0 : 1
  }

  /**
   * Read the whole inbox with per-item compare-and-set revisions.
   * @returns the current snapshot.
   */
  @Remote('listSnapshot')
  listSnapshot(): WorkbenchSnapshot {
    return {
      snapshotVersion: this.snapshotVersion,
      items: [...this.items.values()].map(viewOf),
    }
  }

  /**
   * Confirm a batch of B-class items in one commit: every still-open
   * revision-matching item resolves, and each target reports its own outcome.
   * @param request - actor plus the compare-and-set targets.
   * @returns per-item results and the post-commit snapshot version.
   */
  @Remote('confirmBatch')
  confirmBatch(request: BatchConfirmRequest): BatchConfirmResponse {
    resolveActor(request.actor)
    const changed: ChangedRow[] = []
    const results: BatchConfirmItemResult[] = request.items.map((target): BatchConfirmItemResult => {
      resolveRevision(target.expectedEntityRevision, 'expectedEntityRevision')
      const result = this.transition(target.itemId, target.expectedEntityRevision, 'resolved')
      if (result.outcome === 'withdrawn') return { itemId: target.itemId, outcome: 'withdrawn' }
      if (result.outcome === 'resolved') changed.push(changedRowOf(result.item))
      return { itemId: target.itemId, outcome: result.outcome, currentRevision: result.item.entityRevision }
    })
    return { snapshotVersion: this.commit(changed), results }
  }

  /**
   * Resolve one C-class decision item; C items are never batched.
   * @param request - compare-and-set target plus the recorded decision text.
   * @returns the single-item outcome and the post-commit snapshot version.
   */
  @Remote('resolveDecision')
  resolveDecision(request: ResolveDecisionRequest): ResolveDecisionResponse {
    resolveActor(request.actor)
    const decision = resolveText(request.decision, 'decision')
    resolveRevision(request.expectedEntityRevision, 'expectedEntityRevision')
    const result = this.transition(request.itemId, request.expectedEntityRevision, 'resolved')
    if (result.outcome === 'withdrawn') {
      return { snapshotVersion: this.snapshotVersion, outcome: 'withdrawn' }
    }
    if (result.outcome === 'resolved') result.item.decision = decision
    return {
      snapshotVersion: this.commit(result.outcome === 'resolved' ? [changedRowOf(result.item)] : []),
      outcome: result.outcome,
      currentRevision: result.item.entityRevision,
    }
  }

  /**
   * Invalidate one open item upstream: the stale-propagation trigger that
   * makes later confirms report `stale` instead of silently resolving.
   * @param request - compare-and-set target plus the recorded reason.
   * @returns the single-item outcome and the post-commit snapshot version.
   */
  @Remote('invalidateItem')
  invalidateItem(request: InvalidateItemRequest): InvalidateItemResponse {
    resolveActor(request.actor)
    resolveText(request.reason, 'reason')
    resolveRevision(request.expectedEntityRevision, 'expectedEntityRevision')
    const result = this.transition(request.itemId, request.expectedEntityRevision, 'invalidated')
    if (result.outcome === 'withdrawn') {
      return { snapshotVersion: this.snapshotVersion, outcome: 'withdrawn' }
    }
    return {
      snapshotVersion: this.commit(result.outcome === 'invalidated' ? [changedRowOf(result.item)] : []),
      outcome: result.outcome,
      currentRevision: result.item.entityRevision,
    }
  }

  /** Apply one compare-and-set transition against the mutable store. */
  private transition<Next extends 'resolved' | 'invalidated'>(
    itemId: WorkbenchItemId,
    expectedEntityRevision: number,
    next: Next,
  ): TransitionResult<Next> {
    const stored = this.items.get(itemId)
    if (stored === undefined) return { outcome: 'withdrawn' }
    if (stored.status === 'resolved') return { outcome: 'already-resolved', item: stored }
    if (stored.status === 'invalidated') return { outcome: 'stale', item: stored }
    if (stored.entityRevision !== expectedEntityRevision) return { outcome: 'conflict', item: stored }
    stored.status = next
    stored.entityRevision += 1
    return { outcome: next, item: stored }
  }

  /** Bump the snapshot version once per command and push the change set. */
  private commit(changed: readonly ChangedRow[]): number {
    if (changed.length === 0) return this.snapshotVersion
    this.snapshotVersion += 1
    const update: WorkbenchAttentionUpdate = { snapshotVersion: this.snapshotVersion, changed }
    // Contained fan-out, mirroring the credentials/settings commit events: a
    // broken observer never makes a committed inbox change look failed.
    for (const listener of this.ctx.events.dispatch('emit', ['workbench/attention-updated', update])) {
      try {
        listener(update)
      } catch (error) {
        this.ctx.logger.warn('workbench-host: an attention-updated listener failed: %s', error)
      }
    }
    return this.snapshotVersion
  }
}

export default WorkbenchHostService

/** Project one stored item into a push-event change row. */
function changedRowOf(item: StoredItem): ChangedRow {
  return { itemId: item.itemId, status: item.status, entityRevision: item.entityRevision }
}
