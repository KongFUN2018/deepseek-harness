# Agent Note: Recipe engine core — deterministic submissions and barrier-observing scheduling

Status: implemented

English | [中文](2026-08-16-recipe-engine-core-deterministic-submissions.zh.md)

## Problem

M1 ⑥ needs the scheduler that drives a pinned-recipe task through phase execution, submission, gate, and pass: the task service owns guarded transitions but nothing sequences them. The frozen M1 engine closure is `['tasks', 'recipes', 'agents', 'goals', 'storageDomain', 'workbenchJournal']` — no deliverables, attention, or clarifications — and executor retry, host restart, pause, and cancel must each converge on the same durable state instead of duplicating submissions or re-running passed phases.

## Decision

`packages/task-flow/recipe-engine-core` (`@deepseek-ai/dsh-recipe-engine-core`) ships `RecipeEngineCore`, a plain `Service` bound to `ctx.recipeEngine` (host-internal, not `@Remote`-driven), plus a `./invariant` companion over its own `recipe_engine` domain's `phase_sessions` table.

The executor seam is a single registry slot: `registerExecutor(executor)` throws on a second registration, returns a disposer, and re-runs recovery so tasks stalled for want of an executor resume. The engine owns scheduling, submission, gate, quiescence, and recovery; the executor only performs one phase's work against a `PhaseAssignment` and reports a `PhaseOutcome`.

Submission identity is deterministic: `submissionIdFor(phaseRun, attempt)` = `sub-<phaseRunId>-a<attempt>` with idempotency key `engine:submit:<phaseRunId>:<attempt>`, handed to the executor inside the assignment so its saved deliverable versions carry the matching `sourceSubmissionId` that the task write chain validates. A crash between deliverable writes and the submission record therefore heals by re-execution at the next attempt; a crash after acceptance replays the stored submission.

Scheduling is one serialized loop per task, chained off `task/updated`. Each pass re-reads the task: terminal tasks dispose their phase sessions; `pausing` and `cancelling` wait for in-flight execution and then settle (cancelling first cancels active phase runs); a running task re-verifies its pinned recipe hash and recipe shape — mismatch poisons the task and stops scheduling — and advances the current run. Advancing resolves exactly one active phase run (crash-window orphans beyond the newest are superseded), then walks it through `startPhaseRun` → executor → `recordSubmission` → gate → `markPhasePassed`, completing the task when the last phase passes. The empty-template gate check is evaluated mechanically: the accepted submission's `outputVersions` must list every declared phase output.

Pause and cancel are barriers observed between atomic actions, and the executor-plus-submission is one atomic action: an executor that resolves after `requestPause` still records its submission — the task provider accepts submissions from a `pausing` task — and the loop then settles the pause. A task that is cancelling or already terminal discards the in-flight outcome; the loop cancels the phase run instead. This required one task-provider change: `acceptSubmission` now admits `running` and `pausing` tasks (still only `running` phase runs), because a pause arriving mid-execution must not orphan the completed atomic action.

Phase sessions are keyless-first: each attempt calls `agents.create` with `sessionId` `phase-<phaseRunId>-a<attempt>` and `goals.create` carrying `phase.goal`, disposing the handle when the phase settles. When no agent factory is registered the engine catches the exact `no agent factory registered` error and degrades to a synthetic session id `phase-<phaseRunId>`, so keyless deployments still schedule. On boot, recovery validates each non-terminal task's journal head (max `task/updated` entity revision) against its projection revision — mismatch poisons the task — then re-triggers scheduling: a `running` phase re-executes at the next attempt, a `submitted` phase records only its missing A-checks (deduped with the submission's `submittedAt`), and passed phases are never re-run.

## Verification

- 8 unit tests over an in-memory storage stack: full drive to completion (phase passed, deterministic submission id, one passed gate check), executor single-slot registration with disposal, no-executor stall with the phase left `running`, pause quiescence (settles only after the held executor records), cancel quiescence (phase cancelled, task cancelled), same-medium restart of a submitted-but-ungated phase (exactly one gate check after resume), restart re-execution of a died-mid-flight phase (attempt 2 completes), and the full agent path (phase-session agent and goal exist while executing, disposed after settle).
- 5 invariant tests: legitimate binding writes stay quiet; key-vs-phaseRunId mismatch, attempt-0 bindings claiming a session or submission, and submissions without an attempt session fail; deletions, unknown tables, and other domains stay quiet.
- One real-Loader e2e through a `cordis.yml` fixture (storage → storage-json → storage-domain → recipe → workbench-journal → deliverable-minimal → task-local → agent → goal → recipe-engine-core): auto-completion with submission and gate assertions, same-medium restart preserving completion without duplicate gate checks, and pause quiescence plus resume to completion, in both source and lib launch modes.

## Alternatives considered

- "Remote-driven engine" against "plain Service": the engine is host-internal; exposing a Remote surface invites out-of-band mutation of a chain the engine serializes.
- "Executor owns submissions" against "engine records them": submission acceptance is a guarded transition the engine sequences; letting the executor submit would move quiescence and idempotency out of the single owner.
- "Random or uuid submission ids" against "deterministic sub-<phaseRunId>-a<attempt>": retry dedupe and cross-restart replay need an id both engine and executor can derive independently.
- "Deferring the in-flight submission when pause arrives" against "recording it": deferral would strand deliverable versions that already trace to the submission id, and would need outcome persistence the restart story does not have; recording while pausing keeps the atomic action intact and costs one acceptance-rule relaxation.
- "Requiring an agent factory" against "keyless degradation": the M1 keyless deployments have no factory; catching the exact error keeps their scheduling valid while phase provenance rests on the executor's reported sequence range.

## Consequences

- The task provider's submission acceptance now distinguishes pause from cancel; the task-local README and the subsystem page document the widened rule.
- `submitting` phase-run state is unreachable in M1 (no command enters it); the loop still returns without acting on it so a future command cannot deschedule silently.
- Poisoned tasks stay poisoned: recipe-unsupported shapes and recovery mismatches log an error and stop scheduling; M1 has no un-poison command.
- Deferred: executor routing per phase kind (single slot), a session log for keyless phase sessions, and cross-host scheduling (per-task chains and in-flight maps are host-local).
