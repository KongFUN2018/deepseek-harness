# Agent Note: Task-flow M5 — rewind, budget, and review-policy correction packages

Status: implemented

English | [中文](2026-08-16-task-flow-m5-correction-packages.zh.md)

## Problem

M5 adds the correction plane the workbench lacked: abandoning a branch whose outputs went stale, capping what a task may spend, and trusting tiers plus a repair fuse. The frozen design (module-local; the contract summary below is the in-repo authority) fixes three packages — rewind, budget, review-policy — over seven seams reserved in the earlier milestones: task-level `awaitDecision`/`resumeFromDecision` commands, `registerCompletionGuard` contributor registration, phase supersede, `createTaskRun` parentage, the `gate-check/recorded` event, `RecipePayload.breakers` validation, and the gate's optional `reviewPolicy` read. Every durable write appends its journal fact first; every decision surfaces as an attention item rather than expanding approval semantics.

## Decision

`packages/task-flow/rewind` owns branch abandonment. `requestRewind` computes `deliverables.invalidateDownstream(roots)`, maps the persisted snapshot into a preview (including reusable clarification ids replayed from the task's `clarification/injected` journal facts — the journal is the read model, not a live service call), and opens one `c-decision` item with `decisionKind: 'rewind'`. Only a resolved `confirm-rewind` outcome applies: `applyRewind` creates the successor run with `parentRunId` linking the retired branch, supersedes every phase run of it, and appends `rewind/applied`; declined outcomes journal `rewind/declined` and leave the task plane untouched. `costHint` stays the literal `'uncalibrated'` — PRD forbids placeholder numbers before usage calibration.

`packages/task-flow/budget` owns the ledger: `provisionBudget`/`appendBudget`/`recordUsage` over three dimensions (tokens, durationMs, reruns). Crossing 80% of any limit opens a `b-confirm` warning item once per dimension; exceeding opens a `c-decision` item, parks the task in `awaiting-decision`, and `applyBudgetDecision` resolves it — append more, continue at the current cap, or rewind (delegated to the rewind flow). Wire validators accept `null` (the remote boundary) and reject non-objects and non-positive dimensions loudly.

`packages/task-flow/review-policy` owns trust: strict/balanced/trusted tiers in a KV table, the gate's read (`defersBatchConfirm` — trusted tier only), two completion guards (unsigned B items and suspended rewind decisions veto completion), and the repair fuse — consecutive failed A repairs up to the recipe's explicit `breakers` cap trip `breaker-tripped`, park the task behind a `c-decision` recovery item with five options (continue-repair/patch/rewind/pause/cancel), and record the applied decision. Guard vetoes are synchronous throws wrapped in resolved promises, so a vetoing guard rejects the completion command without an `await` the runtime never needs.

The gate's optional read stays optional: `ctx.get('reviewPolicy')` with a type-annotated local (`ReviewPolicyService | undefined`) — the module merge makes a cast unnecessary, and the annotation keeps the dependency type-only.

## Consequences

- Decision kinds are closed: `'rewind' | 'budget-warning' | 'budget-exceeded' | 'breaker-tripped'`; eleven fact kinds across the `rewind/`, `budget/`, and `review-policy/` prefixes replay every correction move.
- The three packages add no configuration; the composition mounts them after their dependencies. Versions track the root and `files` lists only the shipped entries.
- Not frozen (deliberately): balanced-tier differences, usage auto-collection, `reversibleUntil`, `costHint` values, and M5 UI copy — each stays at its literal placeholder until a milestone owns it.

## Alternatives considered

- Rewind reading reusable clarifications from the live clarification service (`ctx.get('clarifications')`) was the first cut; the design marks the read optional, and a typed optional-service call across package boundaries pulled a runtime dependency in for one preview field. Replaying `clarification/injected` facts from the journal the service already injects keeps the package's read model append-only and its dependency list minimal.
- Budget validators originally took the parsed `BudgetLimits` type and checked `=== null` anyway; the type-aware lint flagged the check as unreachable. Widening the parameter to `BudgetLimits | null` states the wire contract where the validation lives, keeping the `null`-rejection test meaningful without a cast.
- Completion guards as `async` callbacks carried no await; the lint's `require-await` caught the dead asynchrony. Returning a resolved promise (or throwing before it) preserves the guard registration's `Promise<void>` contract with no ceremonial `await`.

## Verification

- Unit suites: rewind 5, budget 10, review-policy 8, plus `m5-seams.spec.ts` over the task seams — all green with per-file 100% coverage (the repo's uncovered-locations reporter prints nothing for these packages).
- `pnpm run lint` (oxlint type-aware), `pnpm run hygiene` (knip, publint, constraints, NodeNext), `pnpm run doc-sync` (28 gates including translation pairing over 973 pairs), and `pnpm run typecheck` all pass.
