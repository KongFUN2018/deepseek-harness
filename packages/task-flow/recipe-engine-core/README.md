# @deepseek-ai/dsh-recipe-engine-core

English | [中文](README.zh.md)

Task-flow recipe engine (`ctx.recipeEngine`): schedules pinned-recipe phase runs and drives the submission-gate-pass chain through a contributed phase executor. The engine owns scheduling, submission, gate, pause/cancel quiescence, and restart recovery; the executor only performs one phase's work and reports a `PhaseOutcome`. Every submission id is deterministic (`sub-<phaseRunId>-a<attempt>`), so an executor retry or a restart either replays the accepted submission or re-executes with the next attempt — never a duplicate.

## Configuration

The engine is host-internal (a plain `Service`, not `@Remote`-driven) and mounts behind the storage stack, the recipe registry, the workbench journal, the minimal deliverable service, the durable task provider, and the agent and goal services. It needs no configuration of its own.

```yaml
- id: storage
  name: '@deepseek-ai/dsh-storage'
- id: storage-json
  name: '@deepseek-ai/dsh-storage-json'
  config:
    root: /var/lib/dsh/storages
- id: storage-domain
  name: '@deepseek-ai/dsh-storage-domain'
  config:
    backend: json
- id: recipe
  name: '@deepseek-ai/dsh-recipe'
- id: workbench-journal
  name: '@deepseek-ai/dsh-workbench-journal'
- id: deliverable-local
  name: '@deepseek-ai/dsh-deliverable-local'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: agent
  name: '@deepseek-ai/dsh-agent'
- id: goal
  name: '@deepseek-ai/dsh-goal'
- id: recipe-engine-core
  name: '@deepseek-ai/dsh-recipe-engine-core'
```

## Service contract

### Executor seam

`registerExecutor(executor)` contributes the single phase executor slot: a second registration throws, the returned disposer releases the slot, and each registration re-runs recovery so tasks stalled for want of an executor resume scheduling. The engine calls `executor.execute(assignment)` with the task/run/phase ids, the hash-verified pinned `RecipeRevision`, the phase spec, the gate checks, the attempt number, and the deterministic submission id the outcome will be recorded under; the executor saves each declared output via the deliverable service tracing `sourceSubmissionId` to that id.

### Scheduling loop

A `task/updated` listener triggers a per-task serialized loop. Each pass re-reads the task: terminal tasks dispose their phase sessions; `pausing`/`cancelling` wait for in-flight execution, then settle after cancelling active phase runs; a `running` task resolves its pinned recipe (hash mismatch poisons the task), checks the recipe shape (an undeclared phase poisons it), and advances the current run — creating the task run, resolving exactly one active phase run (crash-window orphans beyond the newest are superseded), then walking it through `startPhaseRun` → executor → `recordSubmission` → gate. A checks are evaluated and recorded with `uncoveredScope` + `evidenceRefs`; B/C checks carry no machine verdict, so the gate service advances the run to `awaiting-decision` and the engine waits; an all-A run settles with `markPhasePassed`, completing the task when the last phase passes. With no executor registered the phase stays `running` and every wake retries with a warn log.

### Pause, cancel, and quiescence

Pause and cancel are barriers observed between atomic actions. An executor that resolves after `requestPause` still records its submission — the task provider accepts submissions from a `pausing` task — and the loop then settles the pause; a task that is cancelling or already terminal discards the in-flight outcome and lets the loop cancel the phase run. `resume` re-enters the loop; a `submitted` phase runs its missing gate checks instead of re-executing.

### Phase sessions and recovery

Each attempt opens a phase session: `agents.create` with `sessionId` `phase-<phaseRunId>-a<attempt>` and `goals.create` carrying `phase.goal`, disposed when the phase settles. Without a registered agent factory the engine degrades to a keyless synthetic session id (`phase-<phaseRunId>`), so keyless deployments still schedule. On boot, recovery validates each non-terminal task's journal head against its projection revision — a mismatch poisons the task — then re-triggers scheduling: a `running` phase re-executes with the next attempt, a `submitted` phase resumes its gate, and passed phases are never re-run.

## Invariant

The `./invariant` companion registers under the package name and checks binding integrity on the authoritative change stream: a `recipe_engine` `phase_sessions` put keyed by anything other than its own `phaseRunId`, an unexecuted (attempt 0) binding claiming a session or submission, or a submission without its attempt session fails.

## Model Experience

### The task-flow scheduler behind the workbench

#### What the model sees

Only what a phase session carries: the engine publishes the phase goal to the phase-session agent through `goals.create` (`phase.goal` from the pinned recipe), and the executor renders prompts from the `PhaseAssignment` (phase spec, pinned revision, gate checks). Scheduling decisions, submissions, and gate results never reach a model directly.

#### Token effect

None from this package. The engine runs outside the model request path; the only token-carried content it influences — the phase goal string — is owned by the recipe and rendered by the executor.

#### KV Cache effect

None. The engine mutates no prompt; no prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **Single executor slot.** `registerExecutor` holds exactly one executor for all phases; per-kind routing ships in `@deepseek-ai/dsh-recipe-multiphase`, which registers one aggregating executor into this slot.
- **Keyless sessions carry no session log.** Without a registered agent factory the engine degrades to a synthetic session id, so phase provenance rests entirely on the executor's reported `sourceSeqRange`.
- **Poisoned tasks stay poisoned.** A recipe-unsupported or recovery-mismatch poison logs an error and stops scheduling; M1 has no un-poison command.
- **No cross-host scheduling.** The per-task chain, in-flight map, and session handles are host-local; multi-host coordination is out of M1 scope.
