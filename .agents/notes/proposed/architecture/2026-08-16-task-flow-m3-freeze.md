# Agent Note: Task-flow M3 freeze — multi-phase recipes, persistent clarification, and complex gates

Status: proposed

English | [中文](2026-08-16-task-flow-m3-freeze.zh.md)

## Problem

Task-flow freezes milestone contracts before packages open. M1 froze the single-executor engine closure and the submission-gate-pass chain; M2 froze the deliverable domain without widening the engine closure. Two facts now collide. First, the M1 engine already advances phases in declared order and would run the frozen four-phase recipe, but it has exactly one executor slot and refuses any non-A gate check — so multi-phase as shipped is single-executor and A-only. Second, the shipped READMEs and the M2 freeze both defer the executor registry and the B/C gate write paths to M3, yet M3 has no frozen contract: clarification entities, session-message injection, evidence scope on gate results, and the awaiting states are named but unowned. Opening M3 without a frozen scope re-litigates package names, the engine-closure boundary, and the clarification recovery mechanism per package.

## Proposal

M3 is the phase-chain milestone: multi-phase recipes with per-kind executor routing, persistent clarification with restart recovery, and complex gates that record evidence scope and reach the awaiting states. Three host packages; no client package.

### Package freeze

- `packages/task-flow/recipe-multiphase` (`@deepseek-ai/dsh-recipe-multiphase`) ships the per-kind executor registry and its aggregating `PhaseExecutor`.
- `packages/task-flow/clarification` (`@deepseek-ai/dsh-clarification`) ships `ctx.clarifications`.
- `packages/task-flow/gate` (`@deepseek-ai/dsh-gate`) ships `ctx.gate`.

### Recipe schema

`RecipePhaseSpec` gains `kind`, a cross-recipe string that routes phases to executors; `phaseId` still identifies the phase inside one recipe and `kind` never affects phase order.

### Executor routing without widening the engine

`recipe-multiphase.registerExecutor(phaseKind, executor)` keeps a per-kind table and exposes one aggregating `PhaseExecutor` whose `execute` dispatches on `assignment.phase.kind`; an unregistered kind fails by `no-executor`. The assembly registers that single executor into recipe-engine-core's existing single-slot `registerExecutor`. The engine closure, the single-slot API, and `advancePhases` (sequential, one phase after the previous passes) are unchanged.

### Persistent clarification

`ctx.clarifications` (`inject = ['storageDomain', 'workbenchJournal', 'tasks', 'session']`) owns `ClarificationRequest` / `Question` / `Answer` in the `clarification` domain. `createRequest(phaseRunId, questions, actor, idempotencyKey)` creates the request; `answerPartial(questionId, expectedRevision, answer, actor, idempotencyKey)` saves idempotently per question revision. When every `required` question has an answer, the service appends the summarized answers as a model-visible user message to the phase session log, records the persisted event id, marks the request `injected`, appends a task-level `ClarificationFact`, and advances the phase run out of `awaiting-input` through the new task command. Restart replays the injection decision from `injectedEventId` — never from an in-process promise.

### Complex gates

`GateCheckResult` gains `uncoveredScope` and `evidenceRefs`; `recordGateCheck` records them. A checks keep evaluating in the engine (unchanged deterministic logic, now with scope recorded); B/C checks are recognized, their `uncoveredScope` is recorded, and the phase run moves to `awaiting-decision` without a pass/fail verdict — the M4 attention service owns the decision inbox. The engine's `scopeOk` stops rejecting B/C recipes and its `runGate` skips B/C, which the gate service drives through the `phase-run/updated` composition already sanctioned for M2.

### New task commands

`markPhaseAwaitingInput` / `markPhaseAwaitingDecision` move a phase run into the awaiting states (new guarded-transition entries); `resumePhaseFromAwaiting` returns it to `gate-running`. The engine already parks on those states, so completion flows wake it through the existing `phase-run/updated` event.

## Alternatives considered

**Building B/C gates and the attention inbox in M3.** Rejected: attention inbox persistence and `resolveDecision` are M4; M3 only reaches the `awaiting-decision` state and records evidence scope, leaving the decision surface to M4.

**Adding a phase-dependency DAG or parallel phases.** Rejected: the exit criterion is a recoverable sequential phase chain, which M1's `advancePhases` already provides; a DAG is a separate milestone with no current consumer.

**Widening the engine closure to inject clarification/gate.** Rejected: the M1 freeze forbids it, and the M2-sanctioned composition — independent services driving task commands and reacting to events — already covers the awaiting flows.

**Folding per-kind routing into recipe-engine-core.** Rejected: that reopens the frozen single-slot executor contract for no engine need; an aggregating executor keeps the engine untouched and lets per-kind routing evolve in its own package.

**Clarification answers as agent follow-ups.** Rejected: a follow-up wakes the agent and starts a turn; the injection must be model-visible and replayed but non-waking, so it is a session-log write with a recorded event id, not an inbox queue.

## Acceptance criteria

- The frozen four-phase recipe executes in order, each phase routed by `kind`; the next phase opens only after the previous passes; restart re-runs nothing already passed.
- After a partial clarification restart, answered questions are not re-asked and unanswered ones remain; the summarized answers replay as a model-visible user message after session recovery.
- An A check records `uncoveredScope` and `evidenceRefs`; a B/C check parks the phase run in `awaiting-decision` with no pass verdict.
- A real-Loader composition runs the M1/M2 stack plus the three M3 packages, with the M1/M2 semantics (pause quiescence, recovery without re-running passed phases, stale propagation, edit lock) still green.

## Risks

The executor registry label has lived in recipe READMEs as M2; this freeze re-scopes it to M3 and the feature remains unbuilt until the package opens. The session-message injection seam is frozen by semantics (model-visible user message plus a persisted event id) but its exact method name is deferred to implementation — the recovery contract must not be weakened to best-effort while that seam is chosen. The `awaiting-decision` state has no decision surface in M3, so a B/C gate parks the phase run indefinitely until M4 lands; acceptance must treat parked-awaiting as a valid terminal-before-decision state, not a hang. `kind` is an unvalidated free string in the recipe payload, so a recipe with a kind no executor registered for must fail by `no-executor` at execution, not silently run under a default executor.