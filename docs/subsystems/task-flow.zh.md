# 任务流程工作台域

[English](task-flow.md) | 中文

跨会话任务流程域：不可变 Recipe revision、task/run/phase 投影、append-only 工作台 journal、deliverable 版本，以及调度阶段运行并驱动“提交—门检—通过”链的 recipe 引擎。[recipe 注册表](../../packages/task-flow/recipe/README.md)、task 服务与 [recipe 引擎](../../packages/task-flow/recipe-engine-core/README.md) 拥有各自的方法契约；本页按落地进度记录来自 [`packages/task-flow/recipe/src/types.ts`](../../packages/task-flow/recipe/src/types.ts) 的 wire 类型。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxattention--attentionservice"></a>

### `ctx.attention` — `AttentionService`

Attention service: the M4 persistent-decision domain, with idempotent item creation, optimistic decision and batch-confirm commands, and upstream invalidation.

```ts cordis-catalog
/**
 * Create one attention item. Idempotent: replaying a caller key returns
 * the stored item; a replay with a different itemId fails loud.
 * @param input - the item fields; `itemId` is caller-supplied and stable.
 * @param actor - the actor opening the item.
 * @param idempotencyKey - caller-owned replay key.
 * @returns the stored item.
 */
@Remote('createItem') createItem(input: CreateItemInput, actor: string, idempotencyKey: string): Promise<AttentionItem>

/**
 * List every open item, in open order.
 * @returns the open items.
 */
@Remote('listOpen') listOpen(): AttentionItem[]

/**
 * Read one attention item.
 * @param itemId - the item identity.
 * @returns the item, or undefined when unknown.
 */
@Remote('getItem') getItem(itemId: string): AttentionItem | undefined

/**
 * Resolve one decision item against the given option. Idempotent: a replay
 * with the same option returns `resolved`; a different option reports
 * `already-resolved`. A stale, withdrawn, or revision-conflicted item never
 * resolves silently.
 * @param itemId - the item to decide.
 * @param expectedEntityRevision - the revision this decision satisfies.
 * @param optionId - one of the item's options.
 * @param actor - the deciding actor.
 * @param idempotencyKey - caller-owned replay key.
 * @returns the outcome and the revision to retry against when present.
 */
@Remote('resolveDecision') resolveDecision( itemId: string, expectedEntityRevision: number, optionId: string, actor: string, idempotencyKey: string, ): Promise<DecisionResult>

/**
 * Confirm a batch of B-class items in one pass: every still-open
 * revision-matching item resolves, and each target reports its own outcome.
 * @param targets - the compare-and-set targets.
 * @param actor - the confirming actor.
 * @param idempotencyKey - caller-owned replay key.
 * @returns per-item results, in request order.
 */
@Remote('confirmBatch') confirmBatch( targets: ConfirmTarget[], actor: string, idempotencyKey: string, ): Promise<ConfirmResult[]>

/**
 * Invalidate one open item upstream: the stale-propagation trigger that
 * makes later decisions report `stale` instead of silently resolving.
 * @param itemId - the item to invalidate.
 * @param expectedEntityRevision - the revision this invalidation satisfies.
 * @param reason - non-empty reason recorded with the invalidation.
 * @param actor - the invalidating actor.
 * @param idempotencyKey - caller-owned replay key.
 * @returns the outcome and the revision to retry against when present.
 */
@Remote('invalidateItem') invalidateItem( itemId: string, expectedEntityRevision: number, reason: string, actor: string, idempotencyKey: string, ): Promise<InvalidateResult>
```

Source: [`packages/task-flow/attention/src/index.ts:53`](../../packages/task-flow/attention/src/index.ts)

<a id="ctxbudget--budgetservice"></a>

### `ctx.budget` — `BudgetService`

Budget service: the M5 explicit task ledger with threshold decisions.

```ts cordis-catalog
/**
 * Provision one task's ledger. One record per task; explicit limits only —
 * an absent dimension is unlimited, not defaulted.
 * @param taskId - the task the ledger tracks.
 * @param limits - explicit limits; at least one dimension.
 * @param actor - provisioning actor.
 * @param idempotencyKey - caller-owned replay key.
 * @returns the stored ledger record.
 */
@Remote('provisionBudget') async provisionBudget(taskId: string, limits: BudgetLimits, actor: string, idempotencyKey: string): Promise<BudgetRecord>

/**
 * Append budget: raise explicit limits and re-arm the warning latch.
 * @param taskId - the task whose ledger grows.
 * @param deltas - the limit increases per dimension; at least one positive.
 * @param expectedRevision - the ledger revision the caller read.
 * @param actor - appending actor.
 * @param idempotencyKey - caller-owned replay key.
 * @returns the post-append ledger record.
 */
@Remote('appendBudget') async appendBudget( taskId: string, deltas: BudgetLimits, expectedRevision: number, actor: string, idempotencyKey: string, ): Promise<BudgetRecord>

/**
 * Record one explicit usage intake and evaluate thresholds per dimension.
 * @param taskId - the task whose ledger accumulates.
 * @param usage - the spend delta; absent dimensions spend nothing.
 * @param actor - recording actor.
 * @param idempotencyKey - caller-owned replay key.
 * @returns the post-intake ledger record.
 */
@Remote('recordUsage') async recordUsage(taskId: string, usage: BudgetUsage, actor: string, idempotencyKey: string): Promise<BudgetRecord>

/**
 * Read one task's ledger.
 * @param taskId - the task the ledger tracks.
 * @returns the ledger record, or undefined when never provisioned.
 */
@Remote('getBudget') getBudget(taskId: string): BudgetRecord | undefined

/**
 * Land one resolved budget-exceeded decision on the task plane: the
 * append-budget outcome grows the ledger and resumes the task; pause and
 * cancel route to the task commands. The item must already be resolved —
 * no silent landing of an open decision.
 * @param itemId - the resolved budget-exceeded item.
 * @param deltas - the limit increases (append-budget only; at least one).
 * @param taskRevision - the task revision the caller read.
 * @param actor - landing actor.
 * @param idempotencyKey - caller-owned replay key.
 */
@Remote('applyBudgetDecision') async applyBudgetDecision( itemId: string, deltas: BudgetLimits, taskRevision: number, actor: string, idempotencyKey: string, ): Promise<void>
```

Source: [`packages/task-flow/budget/src/index.ts:56`](../../packages/task-flow/budget/src/index.ts)

<a id="ctxclarifications--clarificationservice"></a>

### `ctx.clarifications` — `ClarificationService`

Clarification service: the M3 persistent-clarification domain, with idempotent request creation, idempotent per-question partial answers, and recovered answer injection into the phase session.

```ts cordis-catalog
/**
 * Create one clarification request over a phase run. Idempotent: replaying a
 * caller key with the same questions returns the stored request; a replay
 * with different questions fails loud with conflict.
 * @param phaseRunId - the phase run the request clarifies.
 * @param questions - the question definitions, in request order.
 * @param actor - the actor opening the request.
 * @param idempotencyKey - caller-owned replay key.
 * @returns the stored request with its assigned questions.
 */
@Remote('createRequest') createRequest( phaseRunId: string, questions: ClarificationQuestionInput[], actor: string, idempotencyKey: string, ): Promise<ClarificationRequest>

/**
 * Record one answer for a question, at the question's current revision.
 * Idempotent: replaying the same question revision with the same value
 * returns the stored answer; a different value fails loud with conflict.
 * When the answer completes every required question, the service injects
 * the answer summary and resumes the phase run.
 * @param questionId - the question to answer.
 * @param expectedRevision - the question revision the answer satisfies.
 * @param answer - the answer text; may be empty.
 * @param actor - the actor supplying the answer.
 * @param idempotencyKey - caller-owned replay key for the journal fact.
 * @returns the stored answer.
 */
@Remote('answerPartial') answerPartial( questionId: string, expectedRevision: number, answer: string, actor: string, idempotencyKey: string, ): Promise<Answer>

/**
 * Read one clarification request.
 * @param requestId - the request identity.
 * @returns the request, or undefined when unknown.
 */
@Remote('getRequest') getRequest(requestId: string): ClarificationRequest | undefined

/**
 * List the open requests of one phase run, in creation order.
 * @param phaseRunId - the phase run.
 * @returns the open requests.
 */
@Remote('listOpen') listOpen(phaseRunId: string): ClarificationRequest[]
```

Source: [`packages/task-flow/clarification/src/index.ts:89`](../../packages/task-flow/clarification/src/index.ts)

<a id="ctxdeliverables--deliverableservice"></a>

### `ctx.deliverables` — `DeliverableService`

Deliverable-local service: the M2 deliverable domain behind the M1 service key and Remote surface, with idempotent saves, write-chain-owned dependency edges, and persisted multi-root impact closures.

```ts cordis-catalog
/**
 * Create one immutable version of a deliverable. The caller names the base
 * version it built on; a base that is no longer the latest version rejects
 * with `stale-write`. A staled head remains chainable: the successor
 * re-validates the deliverable after an impact retires the head's
 * conclusions. A save replaying a caller idempotency key with identical
 * fields returns the stored version; with different fields it fails loud
 * with `idempotency-conflict`, the same rule the journal applies to facts.
 * @param deliverableId - raw deliverable identifier.
 * @param expectedBaseVersion - the latest version the caller built on; `null` on a root version.
 * @param sourceSubmissionId - raw submission identifier that produced the version, when known.
 * @param idempotencyKey - caller-owned replay key; omit for a fresh save.
 * @returns the stored immutable version.
 */
@Remote('saveVersion') saveVersion( deliverableId: string, expectedBaseVersion: string | null, sourceSubmissionId: string | null, idempotencyKey?: string | null, ): Promise<DeliverableVersion>

/**
 * List the current input versions of one phase run: every registered input
 * whose state is `current`, in registration order. Stale, invalid,
 * superseded, and cancelled branch products are excluded.
 * @param phaseRunId - raw phase-run identifier.
 * @returns the current input versions.
 */
@Remote('listCurrentInputs') listCurrentInputs(phaseRunId: string): DeliverableVersion[]

/**
 * List every deliverable version in registration order. The metrics
 * service filters current/valid products from this; no aggregation here.
 * @returns all stored versions.
 */
@Remote('listVersions') listVersions(): DeliverableVersion[]

/**
 * Invalidate everything downstream of the named roots: each root and its
 * transitive consumers over `dependsOn` edges transition to `stale`;
 * already-stale subgraphs are skipped, and chain lineage alone is not an
 * impact edge — an upstream edit's own successor survives. The closure is
 * persisted as an `ImpactSnapshot` covering the newly staled versions
 * grouped per deliverable, the phase runs whose registered inputs lost
 * currency, and the recorded gate verdicts those runs' submissions
 * produced.
 * @param rootVersionIds - raw version ids whose downstream loses currency.
 * @returns the persisted impact snapshot.
 */
@Remote('invalidateDownstream') invalidateDownstream(rootVersionIds: string[]): Promise<ImpactSnapshot>

/**
 * Register (or replace) the input versions of one phase run. Host-side seam:
 * the task write chain records a submission's input refs here at acceptance.
 * @param phaseRunId - raw phase-run identifier.
 * @param versionIds - raw input version ids in stable order.
 */
async recordPhaseInputs(phaseRunId: string, versionIds: string[]): Promise<void>

/**
 * List the phase runs whose registered inputs include one version. Host-side
 * seam: the edit-lock service freezes exactly these runs while the version
 * is under a lease.
 * @param targetVersionId - raw version id the runs consume.
 * @returns the consuming phase-run ids.
 */
listConsumingPhaseRuns(targetVersionId: string): PhaseRunId[]

/**
 * Register the dependency edges of one version: the input versions its
 * producing submission consumed. Host-side seam owned by the task write
 * chain at acceptance — executors never declare edges. Registering the same
 * refs twice is a no-op; different refs for the same version fail loud.
 * @param versionId - raw version identifier the edges complete.
 * @param dependsOn - the input version refs the producing submission consumed.
 */
async registerVersionDependencies(versionId: string, dependsOn: readonly DeliverableVersionRef[]): Promise<void>

/**
 * Read one version by identity; `undefined` when absent. Host-side seam for
 * the task write chain's output-exists and source-matches checks.
 * @param versionId - raw version id.
 * @returns the stored version, or `undefined`.
 */
getVersion(versionId: string): DeliverableVersion | undefined

/**
 * Read one persisted impact snapshot by identity; `undefined` when absent.
 * Host-side read for impact consumers and replay.
 * @param snapshotId - raw snapshot id.
 * @returns the stored snapshot, or `undefined`.
 */
getImpactSnapshot(snapshotId: string): ImpactSnapshot | undefined
```

Source: [`packages/task-flow/deliverable-local/src/index.ts:78`](../../packages/task-flow/deliverable-local/src/index.ts)

<a id="ctxdigest--digestservice"></a>

### `ctx.digest` — `DigestService`

The digest service: one read-only Remote per task.

```ts cordis-catalog
/**
 * Derive one task's digest from the journal and the entity projections.
 * @param taskId - the task to digest.
 * @returns the full digest projection.
 */
@Remote('digest') async digest(taskId: string): Promise<TaskDigest>
```

Source: [`packages/task-flow/digest/src/index.ts:38`](../../packages/task-flow/digest/src/index.ts)

<a id="ctxeditlock--editlockservice"></a>

### `ctx.editLock` — `EditLockService`

Edit-lock service: durable lease records over deliverable versions.

```ts cordis-catalog
/**
 * Acquire a lease on one deliverable version. First write wins: a held
 * target fails loud with the current holder and expiry. Acquiring also
 * freezes scheduling of the phase runs that consume the target version.
 * @param deliverableId - raw deliverable identifier.
 * @param targetVersionId - raw version the holder edits; must belong to the deliverable.
 * @param owner - actor holding the lease.
 * @param ttlMs - lease time-to-live in milliseconds.
 * @param taskId - optional owning task; cancelled tasks release their leases.
 * @returns the stored lease.
 */
@Remote('acquire') async acquire(deliverableId: string, targetVersionId: string, owner: string, ttlMs: number, taskId?: string | null): Promise<EditLease>

/**
 * Renew a lease: advance renewedAt and expiresAt. A lapsed lease fails loud.
 * @param leaseId - raw lease identifier.
 * @param expectedRevision - the lease's current compare-and-set revision.
 * @param ttlMs - renewed time-to-live in milliseconds.
 * @returns the renewed lease.
 */
@Remote('renew') async renew(leaseId: string, expectedRevision: number, ttlMs: number): Promise<EditLease>

/**
 * Release a lease explicitly and clear the consumer freezes it holds.
 * Releasing an already-released or expired lease returns it unchanged.
 * @param leaseId - raw lease identifier.
 * @param expectedRevision - the lease's current compare-and-set revision.
 * @param actor - actor releasing the lease.
 * @returns the released lease.
 */
@Remote('release') async release(leaseId: string, expectedRevision: number, actor: string): Promise<EditLease>

/**
 * List active leases, optionally filtered to one task.
 * @param taskId - optional owning task filter.
 * @returns the active leases, newest expiry last in no particular order.
 */
@Remote('listActive') listActive(taskId?: string | null): EditLease[]
```

Source: [`packages/task-flow/edit-lock/src/index.ts:53`](../../packages/task-flow/edit-lock/src/index.ts)

<a id="ctxgate--gateservice"></a>

### `ctx.gate` — `GateService`

Watches gate-running phase runs and parks any run whose recipe declares a B/C check for the phase, awaiting an external decision. A-check-only runs pass through untouched so the engine can settle them.

Source: [`packages/task-flow/gate/src/index.ts:33`](../../packages/task-flow/gate/src/index.ts)

<a id="ctximpactpropagation--impactpropagationservice"></a>

### `ctx.impactPropagation` — `ImpactPropagationService`

Impact-propagation service: composes the frozen task commands over one snapshot; owns no durable state of its own.

```ts cordis-catalog
/**
 * Apply one impact snapshot to the task plane. Phase runs the snapshot
 * covers move into terminal `stale` (already-stale runs are skipped), then
 * the covered gate verdicts are annotated stale. The engine wakes on the
 * committed phase-run changes and re-opens covered phases as new runs.
 * @param snapshot - the impact snapshot `invalidateDownstream` returned.
 * @param mutation - actor, reason, idempotency key of the applying flow.
 * @returns the task-plane writes this call performed.
 */
@Remote('apply') async apply(snapshot: ImpactSnapshot, mutation: TaskMutationContext): Promise<ImpactApplication>
```

Source: [`packages/task-flow/impact-propagation/src/index.ts:32`](../../packages/task-flow/impact-propagation/src/index.ts)

<a id="ctxmetrics--metricsservice"></a>

### `ctx.metrics` — `MetricsService`

The metrics service: read-only KPI and per-task measures.

```ts cordis-catalog
/**
 * Fold the whole-workbench KPI projection.
 * @returns the KPI counts, throughput buckets, and gate pass rates.
 */
@Remote('metrics') async metrics(): Promise<WorkbenchMetrics>

/**
 * Fold one task's measures.
 * @param taskId - the task to measure.
 * @returns the per-task measures.
 */
@Remote('taskMetrics') async taskMetrics(taskId: string): Promise<TaskMetrics>
```

Source: [`packages/task-flow/metrics/src/index.ts:39`](../../packages/task-flow/metrics/src/index.ts)

<a id="ctxrecipeengine--recipeenginecore"></a>

### `ctx.recipeEngine` — `RecipeEngineCore`

Schedules one task through its pinned recipe: opens the run and phase runs, executes each phase via the contributed executor, records the submission, runs the deterministic gate, and advances or settles the task. Pause and cancel are barriers observed between atomic actions; restart recovery rebuilds from the durable bindings and journal.

```ts cordis-catalog
/**
 * Register the single phase executor. Disposal proves removal (HMR-safe).
 * @param executor - the executor that performs every scheduled phase.
 * @returns the disposer clearing this registration.
 */
registerExecutor(executor: PhaseExecutor): () => void

/**
 * Wake the scheduler for one task. Wakes queue per task, so concurrent
 * events never interleave scheduling steps for the same task.
 * @param taskId - the task to schedule.
 */
async trigger(taskId: TaskId): Promise<void>

/**
 * Reconcile recovery: validate each non-terminal task's journal head
 * against its projection revision, then wake every non-terminal task.
 * Scheduling itself resumes submitted-but-ungated phases and re-executes
 * phase runs whose executor died mid-flight.
 */
async recover(): Promise<void>
```

Source: [`packages/task-flow/recipe-engine-core/src/index.ts:73`](../../packages/task-flow/recipe-engine-core/src/index.ts)

<a id="ctxrecipemultiphase--recipemultiphaseservice"></a>

### `ctx.recipeMultiphase` — `RecipeMultiphaseService`

Registers executors by phase kind and dispatches each phase assignment to the executor registered for its kind. On construction it registers one aggregating executor into the recipe engine, so the engine's single slot fans out by `RecipePhaseSpec.kind` without any engine change.

```ts cordis-catalog
/**
 * Register one executor for a phase kind. Disposal removes it (HMR-safe).
 * @param phaseKind - the `RecipePhaseSpec.kind` value this executor serves.
 * @param executor - the executor performing every phase of that kind.
 * @returns the disposer removing the registration.
 */
registerExecutor(phaseKind: string, executor: PhaseExecutor): () => void

/**
 * The aggregating executor to register into the engine's single slot. It
 * dispatches each assignment to the executor registered for the assignment
 * phase's kind.
 * @returns a `PhaseExecutor` routing by `assignment.phase.kind`.
 */
aggregatingExecutor(): PhaseExecutor

/**
 * The phase kinds with a registered executor, in registration order.
 * @returns the registered kinds.
 */
listKinds(): string[]
```

Source: [`packages/task-flow/recipe-multiphase/src/index.ts:31`](../../packages/task-flow/recipe-multiphase/src/index.ts)

<a id="ctxrecipes--reciperegistry"></a>

### `ctx.recipes` — `RecipeRegistry`

Immutable recipe revision registry.

```ts cordis-catalog
/**
 * Register one immutable revision; the same payload under the same identity
 * is idempotent, a different payload under a taken identity fails. The id is
 * trimmed to its canonical form before keying, so padded spellings of one id
 * address the same revision.
 * @param recipeId - recipe identifier; surrounding whitespace is trimmed.
 * @param revision - positive revision number.
 * @param payload - canonical revision payload.
 * @returns the stored revision.
 */
@Remote('register') register(recipeId: string, revision: number, payload: RecipePayload): RecipeRevision

/**
 * Read one pinned identity, verifying the stored hash against the payload.
 * @param identity - recipe id plus exact revision; the id is trimmed to the
 * canonical form before keying, matching `register`.
 * @returns the stored revision.
 */
@Remote('getPinned') getPinned(identity: RecipeIdentity): RecipeRevision

/**
 * Highest registered revision of one recipe; new-task creation only.
 * @param recipeId - recipe identifier; surrounding whitespace is trimmed.
 * @returns the latest revision, or `undefined` when the recipe is unknown.
 */
@Remote('latest') latest(recipeId: string): RecipeRevision | undefined

/**
 * Every registered identity, for registry inspection.
 * @returns identity list ordered by registration.
 */
@Remote('list') list(): RecipeIdentity[]

/**
 * Every recipe's latest revision with its full payload, for the task-creation
 * wizard's linked phase preview. One read per recipe, newest revision wins.
 * @returns latest revisions ordered by registration.
 */
@Remote('listDetails') listDetails(): RecipeRevision[]
```

Source: [`packages/task-flow/recipe/src/index.ts:133`](../../packages/task-flow/recipe/src/index.ts)

<a id="ctxreviewpolicy--reviewpolicyservice"></a>

### `ctx.reviewPolicy` — `ReviewPolicyService`

Review-policy service: trust tiers, completion guards, and repair fuses.

```ts cordis-catalog
/**
 * Set one task's trust tier; unprovisioned tasks read as strict.
 * @param taskId - the task whose tier changes.
 * @param tier - the new tier.
 * @param actor - setting actor.
 * @param idempotencyKey - caller-owned replay key.
 * @returns the stored tier record.
 */
@Remote('setTier') async setTier(taskId: string, tier: TrustTier, actor: string, idempotencyKey: string): Promise<ReviewPolicyRecord>

/**
 * Read one task's tier.
 * @param taskId - the task to read.
 * @returns the stored tier, or strict when unprovisioned.
 */
@Remote('getTier') getTier(taskId: string): TrustTier

/**
 * The gate service's read: whether B-class batch confirmation may run
 * ahead (trusted tier only). C-class checks always block.
 * @param taskId - the task being gated.
 * @returns true only when the task runs the trusted tier.
 */
@Remote('defersBatchConfirm') defersBatchConfirm(taskId: string): boolean

/**
 * Land one resolved breaker decision on the task plane: continue-repair
 * resets the counter and resumes the parked run; pause and cancel route to
 * the task commands; patch only journals the choice.
 * @param itemId - the resolved breaker-tripped item.
 * @param phaseRunRevision - the parked phase run's revision the caller read.
 * @param actor - landing actor.
 * @param idempotencyKey - caller-owned replay key.
 */
@Remote('applyBreakerDecision') async applyBreakerDecision(itemId: string, phaseRunRevision: number, actor: string, idempotencyKey: string): Promise<void>
```

Source: [`packages/task-flow/review-policy/src/index.ts:46`](../../packages/task-flow/review-policy/src/index.ts)

<a id="ctxrewind--rewindservice"></a>

### `ctx.rewind` — `RewindService`

Rewind service: preview-through-decision branch replacement.

```ts cordis-catalog
/**
 * Request one rewind: compute the impact closure, persist the preview, and
 * open the decision item. No task-plane write happens before the decision.
 * @param taskId - the task whose branch the rewind would replace.
 * @param rootVersionIds - the deliverable versions the upstream edit staled.
 * @param actor - requesting actor.
 * @param idempotencyKey - caller-owned replay key.
 * @returns the open rewind decision item.
 */
@Remote('requestRewind') async requestRewind( taskId: string, rootVersionIds: string[], actor: string, idempotencyKey: string, ): Promise<RewindPreview & { itemId: string }>

/**
 * Apply one resolved rewind decision: create the successor run, supersede
 * the retired branch's phase runs, and journal the branch fact.
 * @param itemId - the resolved rewind decision item.
 * @param taskRevision - the task revision the caller read.
 * @param actor - applying actor.
 * @param idempotencyKey - caller-owned replay key.
 * @returns the new run and the retired phase runs.
 */
@Remote('applyRewind') async applyRewind(itemId: string, taskRevision: number, actor: string, idempotencyKey: string): Promise<RewindApplication>
```

Source: [`packages/task-flow/rewind/src/index.ts:40`](../../packages/task-flow/rewind/src/index.ts)

<a id="ctxtasks--taskhandle-abstract-seam"></a>

### `ctx.tasks` — `TaskHandle` (abstract seam)

Task service: durable task/run/phase projections and guarded commands.

```ts cordis-catalog
/**
 * Register one completion guard: `completeTask` runs every registered guard
 * on the serial write chain after the state check passes; a throwing guard
 * rejects the command before any durable write. Contributors own their
 * disposal — the returned handle removes the guard.
 * @param guard - async veto over one task about to complete.
 * @returns the disposer that unregisters the guard.
 */
registerCompletionGuard(guard: (task: TaskRecord) => Promise<void>): () => void

/**
 * Create a task pinned to the latest registered revision of one recipe.
 * @param recipeId - raw recipe identifier.
 * @param workspaceId - raw workspace identifier.
 * @param actor - creating actor, recorded with the creation.
 * @param idempotencyKey - deduplication key; a replay with the same key
 * returns the original task.
 * @returns the new task in `planning`.
 */
@Remote('createTask') async createTask(recipeId: string, workspaceId: string, actor: string, idempotencyKey: string): Promise<TaskRecord>

/**
 * Confirm a session-initiated task creation (entry B): create the task
 * idempotently, derive the inherited discussion seed, and persist it durably so the
 * engine can append it to the first-phase session when it opens.
 * @param recipeId - the inferred recipe id.
 * @param goal - the caller's goal summary; the leading seed message.
 * @param inheritSession - whether to carry recent source-session discussion points.
 * @param idempotencyKey - the caller-safe replay key, reused from the propose step.
 * @param sourceSessionId - the original conversation read for the seed.
 * @param workspaceId - the owning workspace (entry B defaults it to 'default').
 * @param actor - the confirming actor.
 * @returns the created task and its seed summary.
 */
@Remote('confirmCreateTask') async confirmCreateTask( recipeId: string, goal: string, inheritSession: boolean, idempotencyKey: string, sourceSessionId: string, workspaceId: string, actor: string, ): Promise<TaskCreateConfirmResult>

/**
 * Move one task from `planning` into `running`.
 * @param taskId - the task to start.
 * @param mutation - actor, reason, expected revision, idempotency key.
 * @returns the post-commit task projection.
 */
@Remote('startTask') async startTask(taskId: string, mutation: TaskMutationContext): Promise<TaskRecord>

/**
 * Request a pause; the task settles once in-flight phase work quiesces.
 * @param taskId - the task to pause.
 * @param mutation - actor, reason, expected revision, idempotency key.
 * @returns the task in `pausing`.
 */
@Remote('requestPause') async requestPause(taskId: string, mutation: TaskMutationContext): Promise<TaskRecord>

/**
 * Settle a completed pause into `paused`.
 * @param taskId - the task in `pausing`.
 * @param mutation - actor, reason, expected revision, idempotency key.
 * @returns the task in `paused`.
 */
@Remote('settlePause') async settlePause(taskId: string, mutation: TaskMutationContext): Promise<TaskRecord>

/**
 * Resume one paused task back into `running`.
 * @param taskId - the task in `paused`.
 * @param mutation - actor, reason, expected revision, idempotency key.
 * @returns the task in `running`.
 */
@Remote('resume') async resume(taskId: string, mutation: TaskMutationContext): Promise<TaskRecord>

/**
 * Request a cancel; the task settles once in-flight phase work quiesces.
 * @param taskId - the task to cancel.
 * @param mutation - actor, reason, expected revision, idempotency key.
 * @returns the task in `cancelling`.
 */
@Remote('requestCancel') async requestCancel(taskId: string, mutation: TaskMutationContext): Promise<TaskRecord>

/**
 * Settle a completed cancel into `cancelled`.
 * @param taskId - the task in `cancelling`.
 * @param mutation - actor, reason, expected revision, idempotency key.
 * @returns the task in `cancelled`.
 */
@Remote('settleCancel') async settleCancel(taskId: string, mutation: TaskMutationContext): Promise<TaskRecord>

/**
 * Fail one running task.
 * @param taskId - the task to fail.
 * @param mutation - actor, reason, expected revision, idempotency key.
 * @returns the task in `failed`.
 */
@Remote('failTask') async failTask(taskId: string, mutation: TaskMutationContext): Promise<TaskRecord>

/**
 * Complete a task; the completion guard requires every phase run of the
 * current run to have passed (or retired into stale/superseded), then every
 * registered M5 completion guard must approve — unsigned B items, suspended
 * rewind decisions, and open blocking decisions veto here.
 * @param taskId - the task to complete.
 * @param mutation - actor, reason, expected revision, idempotency key.
 * @returns the post-commit task projection.
 */
@Remote('completeTask') async completeTask(taskId: string, mutation: TaskMutationContext): Promise<TaskRecord>

/**
 * Park one running task in `awaiting-decision`: the over-budget decision
 * (M5 budget) holds scheduling without touching any phase run.
 * @param taskId - the task to park.
 * @param mutation - the task's expected revision plus actor metadata.
 * @returns the post-commit task projection.
 */
@Remote('markTaskAwaitingDecision') async markTaskAwaitingDecision(taskId: string, mutation: TaskMutationContext): Promise<TaskRecord>

/**
 * Return one parked task from `awaiting-decision` to `running`; the
 * resolved over-budget decision (append-budget outcome) resumes here.
 * @param taskId - the task to resume.
 * @param mutation - the task's expected revision plus actor metadata.
 * @returns the post-commit task projection.
 */
@Remote('resumeTaskFromDecision') async resumeTaskFromDecision(taskId: string, mutation: TaskMutationContext): Promise<TaskRecord>

/**
 * Open a new run on one task and make it the current run.
 * @param taskId - the owning task.
 * @param mutation - the task's expected revision plus actor metadata.
 * @param parentRunId - the superseded branch this run replaces (rewind);
 * omitted on the initial run.
 * @returns the new run.
 */
@Remote('createTaskRun') async createTaskRun(taskId: string, mutation: TaskMutationContext, parentRunId?: string): Promise<TaskRunRecord>

/**
 * Create one phase run inside a run.
 * @param runId - the owning run.
 * @param phaseId - the recipe phase id this run executes.
 * @param mutation - the run's expected revision plus actor metadata.
 * @returns the new phase run in `created`.
 */
@Remote('createPhaseRun') async createPhaseRun(runId: string, phaseId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Move one phase run into `running`.
 * @param phaseRunId - the phase run to start.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection.
 */
@Remote('startPhaseRun') async startPhaseRun(phaseRunId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Accept and store one phase submission after protocol validation; the
 * accepted submission moves its phase run to `submitted`.
 * @param submission - the immutable submission record.
 * @param environment - session-watermark and deliverable-currency facts the
 * caller (the engine) computed.
 * @returns the stored submission; an idempotent replay returns the original.
 */
@Remote('recordSubmission') async recordSubmission(submission: PhaseSubmission, environment: SubmissionEnvironmentFacts): Promise<PhaseSubmission>

/**
 * Start the gate for one accepted submission.
 * @param submissionId - the accepted submission.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection.
 */
@Remote('startGate') async startGate(submissionId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Record one gate-check verdict for a submission.
 * @param result - the check verdict.
 * @returns the stored verdict.
 */
@Remote('recordGateCheck') async recordGateCheck(result: GateCheckResult): Promise<GateCheckResult>

/**
 * Mark one phase run passed.
 * @param phaseRunId - the phase run.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection.
 */
@Remote('markPhasePassed') async markPhasePassed(phaseRunId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Mark one gate-running phase run failed.
 * @param phaseRunId - the phase run.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection.
 */
@Remote('markPhaseFailed') async markPhaseFailed(phaseRunId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Cancel one not-yet-passed phase run.
 * @param phaseRunId - the phase run to cancel.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection.
 */
@Remote('cancelPhaseRun') async cancelPhaseRun(phaseRunId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Mark one phase run stale: the M2 impact command. A stale run is
 * terminal; the engine re-opens the phase as a new run. Runs in `running`
 * or `submitting` reject — an in-flight atomic action settles per the M1
 * quiescence contract.
 * @param phaseRunId - the phase run the impact closure covers.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection.
 */
@Remote('markPhaseStale') async markPhaseStale(phaseRunId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Retire one phase run into `superseded`: the M5 rewind command. A
 * superseded run is terminal and never blocks completion; unlike `stale`
 * (invalidated inputs), superseded means the whole branch lost to a newer
 * run, so in-flight states retire too — the rewind decision already
 * committed to abandoning the branch.
 * @param phaseRunId - the phase run the rewind retires.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection.
 */
@Remote('markPhaseSuperseded') async markPhaseSuperseded(phaseRunId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Park one gate-running phase run in `awaiting-input`: the M3 clarification
 * state. The clarification service resolves the inputs and resumes the run.
 * @param phaseRunId - the phase run awaiting clarification input.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection.
 */
@Remote('markPhaseAwaitingInput') async markPhaseAwaitingInput(phaseRunId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Park one gate-running phase run in `awaiting-decision`: the M3 complex-gate
 * state for B/C checks. The attention service decides and resumes the run.
 * @param phaseRunId - the phase run awaiting a B/C decision.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection.
 */
@Remote('markPhaseAwaitingDecision') async markPhaseAwaitingDecision(phaseRunId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Return a parked phase run from `awaiting-input` or `awaiting-decision` to
 * `gate-running`, so the engine re-runs the gate. Clarification completion
 * and attention decisions resume through this command.
 * @param phaseRunId - the parked phase run.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection.
 */
@Remote('resumePhaseFromAwaiting') async resumePhaseFromAwaiting(phaseRunId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Record the phase-session id the engine opened for this run. Idempotent:
 * the same id returns the stored record without a write; a changed id (a
 * retry opening a new session) updates the binding. The M3 clarification
 * service reads this id to inject answered clarification payloads.
 * @param phaseRunId - the phase run whose session id to record.
 * @param sessionId - the phase-session id.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection.
 */
@Remote('recordPhaseSession') async recordPhaseSession(phaseRunId: string, sessionId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Freeze one phase run's scheduling: the engine dispatches no new work for
 * a frozen run while in-flight atomic actions still settle. The M2
 * edit-lock service sets this while a lease covers a version the run's
 * registered inputs consume.
 * @param phaseRunId - the phase run to freeze.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection with the flag set.
 */
@Remote('freezePhaseScheduling') async freezePhaseScheduling(phaseRunId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Clear one phase run's scheduling freeze; the engine wakes on the
 * committed change and resumes dispatching.
 * @param phaseRunId - the frozen phase run.
 * @param mutation - the phase run's expected revision plus actor metadata.
 * @returns the post-commit phase-run projection with the flag cleared.
 */
@Remote('clearPhaseScheduling') async clearPhaseScheduling(phaseRunId: string, mutation: TaskMutationContext): Promise<PhaseRunRecord>

/**
 * Annotate recorded gate-check verdicts stale: the M2 impact command for
 * verdicts the closure covers. A staled verdict supports no pass decision.
 * Idempotent: verdicts already staled are returned unchanged without a write.
 * @param submissionId - the submission whose verdicts the closure covers.
 * @param checkIds - the check ids to annotate; unknown ids are ignored.
 * @param mutation - actor, reason, idempotency key of the impact command.
 * @returns the verdicts this call staled, in storage order.
 */
@Remote('markGateChecksStale') async markGateChecksStale(submissionId: string, checkIds: readonly string[], mutation: TaskMutationContext): Promise<GateCheckResult[]>

/**
 * Read one task projection.
 * @param taskId - the task to read.
 * @returns the current projection.
 */
@Remote('getTask') async getTask(taskId: string): Promise<TaskRecord | undefined>

/**
 * Every task projection, for the task board.
 * @returns tasks in insertion order.
 */
@Remote('listTasks') async listTasks(): Promise<TaskRecord[]>

/**
 * Read one phase-run projection.
 * @param phaseRunId - the phase run to read.
 * @returns the current projection.
 */
@Remote('getPhaseRun') async getPhaseRun(phaseRunId: string): Promise<PhaseRunRecord | undefined>

/**
 * Every phase-run projection of one run, for the engine and the task board.
 * @param runId - the run whose phase runs to list.
 * @returns phase runs in insertion order.
 */
@Remote('listPhaseRuns') async listPhaseRuns(runId: string): Promise<PhaseRunRecord[]>

/**
 * Read one submission.
 * @param submissionId - the submission to read.
 * @returns the stored submission.
 */
@Remote('getSubmission') async getSubmission(submissionId: string): Promise<PhaseSubmission | undefined>

/**
 * Every gate-check verdict recorded for one submission.
 * @param submissionId - the submission.
 * @returns verdicts in recording order.
 */
@Remote('listGateResults') async listGateResults(submissionId: string): Promise<GateCheckResult[]>
```

Source: [`packages/task-flow/task/src/index.ts:70`](../../packages/task-flow/task/src/index.ts)

<a id="ctxworkbenchhoststream--workbenchhoststreamservice"></a>

### `ctx.workbenchHostStream` — `WorkbenchHostStreamService`

Attention incremental stream: the M4 cursor-based change feed over the persistent attention inbox, derived from the append-only workbench journal.

```ts cordis-catalog
/**
 * Read the attention change events after a journal cursor and the new cursor.
 * @param cursor - exclusive journal lower bound; omitted or non-positive replays the whole stream.
 * @returns the events in journal order plus this boot's stream id and cursor.
 */
@Remote('listIncremental') listIncremental(cursor?: number): IncrementalPage
```

Source: [`packages/task-flow/workbench-host-stream/src/index.ts:72`](../../packages/task-flow/workbench-host-stream/src/index.ts)

<a id="ctxworkbenchjournal--workbenchjournalservice"></a>

### `ctx.workbenchJournal` — `WorkbenchJournalService`

Append-only journal service; the durable truth task-flow projections rebuild from.

```ts cordis-catalog
/**
 * Append one fact; the durable write is the commit point of the mutation
 * it records. A replay of the same idempotency key with identical caller
 * fields returns the stored fact; with different fields it fails loud.
 * @param fact - caller-supplied fields; the journal assigns the envelope.
 * @returns the stored fact with its assigned journalSeq and eventId.
 */
@Remote('append') async append(fact: JournalFactInput): Promise<JournalFact>

/**
 * Recovery and client-resync position: the highest assigned journalSeq.
 * @returns the checkpoint; `journalSeq` is 0 when the journal is empty.
 */
@Remote('checkpoint') checkpoint(): JournalCheckpoint

/**
 * Read every fact after one sequence position, in journal order. The
 * authoritative resynchronization path: projections and clients rebuild
 * from replay, never from events.
 * @param afterSeq - exclusive lower bound; 0 replays the whole journal.
 * @returns facts with `journalSeq > afterSeq`, ascending.
 */
@Remote('replay') replay(afterSeq: number): JournalFact[]
```

Source: [`packages/task-flow/workbench-journal/src/index.ts:39`](../../packages/task-flow/workbench-journal/src/index.ts)

<a id="gate-check-events"></a>

### `gate-check/*` events

<a id="gate-checkrecorded--emit"></a>

#### `gate-check/recorded` — emit

One stored gate-check verdict; the breaker counter (M5 review-policy) observes this instead of polling. Droppable — the journal is the authoritative record.

```ts cordis-catalog
/**
 * One stored gate-check verdict; the breaker counter (M5 review-policy)
 * observes this instead of polling. Droppable — the journal is the
 * authoritative record.
 * @param result - the stored verdict.
 * @mode emit
 */
'gate-check/recorded'(result: GateCheckResult): void
```

Source: [`packages/task-flow/task/src/types.ts:254`](../../packages/task-flow/task/src/types.ts)

<a id="phase-run-events"></a>

### `phase-run/*` events

<a id="phase-runupdated--emit"></a>

#### `phase-run/updated` — emit

Committed phase-run projection change.

```ts cordis-catalog
/**
 * Committed phase-run projection change.
 * @param phaseRun - the phase run's post-commit projection.
 * @mode emit
 */
'phase-run/updated'(phaseRun: PhaseRunRecord): void
```

Source: [`packages/task-flow/task/src/types.ts:246`](../../packages/task-flow/task/src/types.ts)

<a id="task-events"></a>

### `task/*` events

<a id="taskupdated--emit"></a>

#### `task/updated` — emit

Committed task projection change; forwarded to the workbench UI and droppable — the journal is the authoritative resync path.

```ts cordis-catalog
/**
 * Committed task projection change; forwarded to the workbench UI and
 * droppable — the journal is the authoritative resync path.
 * @param task - the task's post-commit projection.
 * @mode emit
 */
'task/updated'(task: TaskRecord): void
```

Source: [`packages/task-flow/task/src/types.ts:234`](../../packages/task-flow/task/src/types.ts)

<a id="task-run-events"></a>

### `task-run/*` events

<a id="task-runupdated--emit"></a>

#### `task-run/updated` — emit

Committed task-run projection change.

```ts cordis-catalog
/**
 * Committed task-run projection change.
 * @param run - the run's post-commit projection.
 * @mode emit
 */
'task-run/updated'(run: TaskRunRecord): void
```

Source: [`packages/task-flow/task/src/types.ts:240`](../../packages/task-flow/task/src/types.ts)
<!-- END GENERATED cordis-surface -->
