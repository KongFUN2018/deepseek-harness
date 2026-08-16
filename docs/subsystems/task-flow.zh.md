# 任务流程工作台域

[English](task-flow.md) | 中文

跨会话任务流程域：不可变 Recipe revision、task/run/phase 投影、append-only 工作台 journal、deliverable 版本，以及调度阶段运行并驱动“提交—门检—通过”链的 recipe 引擎。[recipe 注册表](../../packages/task-flow/recipe/README.md)、task 服务与 [recipe 引擎](../../packages/task-flow/recipe-engine-core/README.md) 拥有各自的方法契约；本页按落地进度记录来自 [`packages/task-flow/recipe/src/types.ts`](../../packages/task-flow/recipe/src/types.ts) 的 wire 类型。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdeliverables--deliverableservice"></a>

### `ctx.deliverables` — `DeliverableService`

Minimal deliverable version service; the M2 deliverable-local provider replaces the linear scans and the non-Remote host seams behind the same Remote surface.

```ts cordis-catalog
/**
 * Create one immutable version of a deliverable. The caller names the base
 * version it built on; a base that is no longer the latest, or whose state
 * is not `current`, rejects with `stale-write`.
 * @param deliverableId - raw deliverable identifier.
 * @param expectedBaseVersion - the latest version the caller built on; `null` on a root version.
 * @param sourceSubmissionId - raw submission identifier that produced the version, when known.
 * @returns the stored immutable version.
 */
@Remote('saveVersion') saveVersion( deliverableId: string, expectedBaseVersion: string | null, sourceSubmissionId: string | null, ): Promise<DeliverableVersion>

/**
 * List the current input versions of one phase run: every registered input
 * whose state is `current`, in registration order. Stale, invalid,
 * superseded, and cancelled branch products are excluded.
 * @param phaseRunId - raw phase-run identifier.
 * @returns the current input versions.
 */
@Remote('listCurrentInputs') listCurrentInputs(phaseRunId: string): DeliverableVersion[]

/**
 * Mark every version of each root's chain newer than the root stale. The
 * full transitive impact closure and ImpactSnapshot are M2.
 * @param rootVersionIds - raw version ids whose chains lose currency.
 * @returns the ids newly transitioned to stale.
 */
@Remote('invalidateDownstream') invalidateDownstream(rootVersionIds: string[]): Promise<InvalidateDownstreamResult>

/**
 * Register (or replace) the input versions of one phase run. Host-side seam:
 * the task write chain records a submission's input refs here at acceptance.
 * @param phaseRunId - raw phase-run identifier.
 * @param versionIds - raw input version ids in stable order.
 */
async recordPhaseInputs(phaseRunId: string, versionIds: string[]): Promise<void>

/**
 * Read one version by identity; `undefined` when absent. Host-side seam for
 * the task write chain's output-exists and source-matches checks.
 * @param versionId - raw version id.
 * @returns the stored version, or `undefined`.
 */
getVersion(versionId: string): DeliverableVersion | undefined
```

Source: [`packages/task-flow/deliverable-minimal/src/index.ts:48`](../../packages/task-flow/deliverable-minimal/src/index.ts)

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

Source: [`packages/task-flow/recipe-engine-core/src/index.ts:70`](../../packages/task-flow/recipe-engine-core/src/index.ts)

<a id="ctxrecipes--reciperegistry"></a>

### `ctx.recipes` — `RecipeRegistry`

Immutable recipe revision registry.

```ts cordis-catalog
/**
 * Register one immutable revision; the same payload under the same identity
 * is idempotent, a different payload under a taken identity fails.
 * @param recipeId - raw recipe identifier.
 * @param revision - positive revision number.
 * @param payload - canonical revision payload.
 * @returns the stored revision.
 */
@Remote('register') register(recipeId: string, revision: number, payload: RecipePayload): RecipeRevision

/**
 * Read one pinned identity, verifying the stored hash against the payload.
 * @param identity - recipe id plus exact revision.
 * @returns the stored revision.
 */
@Remote('getPinned') getPinned(identity: RecipeIdentity): RecipeRevision

/**
 * Highest registered revision of one recipe; new-task creation only.
 * @param recipeId - raw recipe identifier.
 * @returns the latest revision, or `undefined` when the recipe is unknown.
 */
@Remote('latest') latest(recipeId: string): RecipeRevision | undefined

/**
 * Every registered identity, for registry inspection.
 * @returns identity list ordered by registration.
 */
@Remote('list') list(): RecipeIdentity[]
```

Source: [`packages/task-flow/recipe/src/index.ts:106`](../../packages/task-flow/recipe/src/index.ts)

<a id="ctxtasks--taskhandle-abstract-seam"></a>

### `ctx.tasks` — `TaskHandle` (abstract seam)

Task service: durable task/run/phase projections and guarded commands.

```ts cordis-catalog
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
 * current run to have passed.
 * @param taskId - the task to complete.
 * @param mutation - actor, reason, expected revision, idempotency key.
 * @returns the post-commit task projection.
 */
@Remote('completeTask') async completeTask(taskId: string, mutation: TaskMutationContext): Promise<TaskRecord>

/**
 * Open a new run on one task and make it the current run.
 * @param taskId - the owning task.
 * @param mutation - the task's expected revision plus actor metadata.
 * @returns the new run.
 */
@Remote('createTaskRun') async createTaskRun(taskId: string, mutation: TaskMutationContext): Promise<TaskRunRecord>

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

Source: [`packages/task-flow/task/src/index.ts:65`](../../packages/task-flow/task/src/index.ts)

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

Source: [`packages/task-flow/task/src/types.ts:209`](../../packages/task-flow/task/src/types.ts)

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

Source: [`packages/task-flow/task/src/types.ts:197`](../../packages/task-flow/task/src/types.ts)

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

Source: [`packages/task-flow/task/src/types.ts:203`](../../packages/task-flow/task/src/types.ts)
<!-- END GENERATED cordis-surface -->
