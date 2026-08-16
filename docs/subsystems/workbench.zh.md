# 工作台注意力收件箱

[English](workbench.md) | 中文

[dsh-workbench-host](../../packages/task-flow/workbench-host) 的跨会话注意力收件箱：B 类批量确认、C 类单条决策、compare-and-set 版本号，由浏览器工作台经 Typert 网关消费。包 README 拥有 Remote 方法契约；本页记录来自 [`packages/task-flow/workbench-host/src/types.ts`](../../packages/task-flow/workbench-host/src/types.ts) 的 wire 类型。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxworkbenchhost--workbenchhostservice"></a>

### `ctx.workbenchHost` — `WorkbenchHostService`

Workbench attention inbox (`ctx.workbenchHost`).

```ts cordis-catalog
/**
 * Read the whole inbox with per-item compare-and-set revisions.
 * @returns the current snapshot.
 */
@Remote('listSnapshot') listSnapshot(): WorkbenchSnapshot

/**
 * Confirm a batch of B-class items in one commit: every still-open
 * revision-matching item resolves, and each target reports its own outcome.
 * @param request - actor plus the compare-and-set targets.
 * @returns per-item results and the post-commit snapshot version.
 */
@Remote('confirmBatch') confirmBatch(request: BatchConfirmRequest): BatchConfirmResponse

/**
 * Resolve one C-class decision item; C items are never batched.
 * @param request - compare-and-set target plus the recorded decision text.
 * @returns the single-item outcome and the post-commit snapshot version.
 */
@Remote('resolveDecision') resolveDecision(request: ResolveDecisionRequest): ResolveDecisionResponse

/**
 * Invalidate one open item upstream: the stale-propagation trigger that
 * makes later confirms report `stale` instead of silently resolving.
 * @param request - compare-and-set target plus the recorded reason.
 * @returns the single-item outcome and the post-commit snapshot version.
 */
@Remote('invalidateItem') invalidateItem(request: InvalidateItemRequest): InvalidateItemResponse
```

Source: [`packages/task-flow/workbench-host/src/index.ts:132`](../../packages/task-flow/workbench-host/src/index.ts)

<a id="workbench-events"></a>

### `workbench/*` events

<a id="workbenchattention-updated--emit"></a>

#### `workbench/attention-updated` — emit

Committed change to the workbench attention inbox: one or more items resolved, invalidated, or otherwise revised by a Remote command. Emitted after the in-memory store commits, with synchronous listener failures contained and logged by the emitting service.

```ts cordis-catalog
/**
 * Committed change to the workbench attention inbox: one or more items
 * resolved, invalidated, or otherwise revised by a Remote command.
 * Emitted after the in-memory store commits, with synchronous listener
 * failures contained and logged by the emitting service.
 * @param update - snapshot version plus each changed item's new state.
 * @mode emit
 */
'workbench/attention-updated'(update: WorkbenchAttentionUpdate): void
```

Source: [`packages/task-flow/workbench-host/src/types.ts:145`](../../packages/task-flow/workbench-host/src/types.ts)
<!-- END GENERATED cordis-surface -->
