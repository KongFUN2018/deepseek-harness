# @deepseek-ai/dsh-task

English | [中文](README.zh.md)

Task-flow task Service Definition (`ctx.tasks`): pinned-recipe task creation, guarded task and phase-run transitions, and the PhaseSubmission acceptance chain. Providers persist through abstract storage hooks; every mutating command sequences one load, one pure transition, one compare-and-set save, and one contained event fan-out.

## Service contract

`ctx.tasks` is an abstract `TypertRemoteService` bound to the `tasks` wire namespace; a provider subclass implements the protected storage hooks inside its transaction boundary. Mutating commands take a `TaskMutationContext` (actor, reason, `expectedRevision`, idempotency key) and fail with `stale-revision` when the stored revision moved.

Task commands: `createTask` (pins the recipe's latest registered revision; idempotency-key replay returns the original), `startTask`, `requestPause`/`settlePause`, `resume`, `requestCancel`/`settleCancel`, `failTask`, `completeTask` (guard: every phase run of the current run passed), and `createTaskRun` (opens a run and makes it current). Phase-run commands: `createPhaseRun`, `startPhaseRun`, `recordSubmission`, `startGate`, `recordGateCheck`, `markPhasePassed`, `markPhaseFailed`, `cancelPhaseRun`. Queries: `getTask`, `listTasks`, `getPhaseRun`, `getSubmission`, `listGateResults`.

`recordSubmission` accepts one immutable `PhaseSubmission` plus caller-computed `SubmissionEnvironmentFacts` (source-log persistence, input currency, output validity). Acceptance is the pure `acceptSubmission` check: identity wiring (task/run/phase-run/phase-id), pinned-recipe identity and hash against the registry, environment facts, and idempotency-key replay; a rejection throws `submission-rejected` with every problem listed. The accepted submission moves its phase run to `submitted` and becomes its `activeSubmissionId`.

Committed projections emit `task/updated`, `task-run/updated`, and `phase-run/updated` (allowlisted in `@deepseek-ai/dsh-api-remotes`); listener failures are contained and logged.

## Extension points

- `SubmissionEnvironmentFacts` is computed by the caller (the engine): session-log watermark and deliverable-currency checks stay outside this package so the acceptance chain stays pure (`src/submission.ts`).
- Pure transition tables live in `src/state.ts`; providers persist them, never widen them. States no M1 command enters stay declared in the vocabulary.
- The durable provider (`task-local`, M1) implements the storage hooks behind a journal; the Remote surface does not change.

## Model Experience

### Task projections and guarded commands

#### What the model sees

Nothing. `ctx.tasks` serves the task engine and the workbench UI; no tool, prompt section, or session event exposes task projections to a model request.

#### Token effect

None. Commands and projections travel on the RPC carrier, which is outside the model request path.

#### KV Cache effect

None. Task records never enter a prompt, so no prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- No shipped provider: the abstract storage hooks are implemented by test fakes and the e2e driver until `task-local` lands durable journal storage.
- Gate results are stored as recorded; judging check verdicts against the pinned recipe's gate checks (the pass/fail gate decision) belongs to the engine, not this package.
- `schedulingFrozen` and the pause/cancel quiescence choreography that sets it are declared on `PhaseRunRecord` but no M1 command writes it yet; the engine's pause-cancel path owns it.
