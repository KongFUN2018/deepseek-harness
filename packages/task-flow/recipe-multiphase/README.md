# @deepseek-ai/dsh-recipe-multiphase

English | [中文](README.zh.md)

Per-kind phase executor registry (`ctx.recipeMultiphase`): routes the multi-phase recipe's stages to executors by `RecipePhaseSpec.kind`, and exposes one aggregating `PhaseExecutor` registered into recipe-engine-core's single executor slot. The engine closure stays untouched — routing lives here, not in the engine.

## Configuration

The service mounts after the recipe engine. It has no tunables; on init it registers its aggregating executor into `ctx.recipeEngine`, so a bundle only needs to list the engine and this package plus the executors registered against it.

```yaml
- id: recipe-engine-core
  name: '@deepseek-ai/dsh-recipe-engine-core'
- id: recipe-multiphase
  name: '@deepseek-ai/dsh-recipe-multiphase'
```

## Service contract

- `registerExecutor(phaseKind, executor)` — register one `PhaseExecutor` for a phase kind; the kind is a non-blank string matching `RecipePhaseSpec.kind`. A duplicate kind rejects with `duplicate-kind`, a blank kind with `invalid-kind`. The returned disposer removes the registration.
- `aggregatingExecutor()` — the single `PhaseExecutor` to hand to the engine; it dispatches each assignment to the executor registered for that assignment's phase kind, failing with `no-executor` when no executor is registered for the kind.
- `listKinds()` — the registered kinds in registration order, for diagnostics.

Each phase's `kind` comes from the recipe payload; the registry never changes phase order, which the engine owns.

## Invariant

The `./invariant` companion has no runtime invariant: the registry keeps only in-memory, per-kind executor references, so there is no durable event or data relation to check.

## Model Experience

### The executor fan-out behind the phase chain

#### What the model sees

Nothing from this package directly. Routing changes which executor performs each `phase`, so its effect reaches the model through the phase prompts and submissions those executors produce, not as text from the registry.

#### Token effect

None. The registry holds executor references and never emits text.

#### KV Cache effect

None. No prompt prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **In-memory registry.** Executor registrations are process-local and must be re-registered after a restart; they are not durable facts.
- **Unregistered kind fails at execution.** A recipe declaring a kind with no registered executor fails with `no-executor` when that phase is scheduled, not at recipe registration.
- **B/C gate checks are out of scope.** Complex-gate classification and the `awaiting-decision` state ship in the M3 `gate` package.