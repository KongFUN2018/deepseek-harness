# @deepseek-ai/dsh-review-policy

English | [中文](README.zh.md)

Task review policy (`ctx.reviewPolicy`): the trust tiers of the M5 decision milestone. `strict` (the default, identical to M3 behavior), `balanced` (currently identical to `strict`), and `trusted` — the only tier whose `defersBatchConfirm` read returns true, letting the gate service leave a B-only phase to settle by its A checks while the B items stay open as countersignature vouchers. The service also owns the completion guards (open `b-confirm` items and suspended rewind decisions veto `completeTask`) and the repair-fuse breaker: consecutive failed A verdicts on a fused check park the phase run behind a `recovery` decision item.

## Configuration

The service mounts after the task provider, the recipe registry, the attention service, and the workbench journal, and needs no configuration of its own.

```yaml
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: recipe
  name: '@deepseek-ai/dsh-recipe'
- id: attention
  name: '@deepseek-ai/dsh-attention'
- id: review-policy
  name: '@deepseek-ai/dsh-review-policy'
```

## Service contract

- `setTier(taskId, tier, actor, idempotencyKey)` / `getTier(taskId)` — explicit tier writes and reads; unprovisioned tasks read as `strict`. Journals `review-policy/tier-set`.
- `defersBatchConfirm(taskId)` — the gate service's read: true only on `trusted`. B-only phases defer; any C-class check still blocks.
- `applyBreakerDecision(itemId, phaseRunRevision, actor, idempotencyKey)` — land one resolved `breaker-tripped` decision: `continue-repair` resets the counter and resumes the parked run; `pause`/`cancel` route to the task commands; `patch` journals the choice without a task-plane write. An unresolved or foreign item fails loud. Journals `review-policy/breaker-decision`.
- Completion guards register at init: an open `b-confirm` item of the task vetoes completion (`unsigned B item(s)`), and an open `rewind` decision vetoes it (`suspended rewind decision(s)`).
- The breaker observes `gate-check/recorded`: a failed verdict increments the per-(task, check) counter, a pass resets it, staled verdicts do not count. When the counter reaches the recipe's explicit `breakers` cap for the check's `circuitBreaker` key and a gate-running run of that phase exists, the run parks and a `recovery` `breaker-tripped` item opens; the trip journals `review-policy/breaker-tripped`.

## Invariant

The `./invariant` companion checks counter floors on the authoritative change stream: a breaker counter never holds a negative consecutive-failure count.

## Model Experience

### Trust-tier scheduling and breaker parking

#### What the model sees

Nothing directly. Tier changes alter when `b-confirm` confirmations are requested of the user, not what a model is told; a tripped breaker manifests as the parked phase — `gate-check/recorded` verdicts stop advancing it, and no further repair prompts run until the `breaker-tripped` recovery decision lands.

#### Token effect

None. Tier records, counters, and items are storage-domain writes outside the model request path.

#### KV Cache effect

None. No prompt prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- **`balanced` equals `strict`.** No calibrated differentiation exists; the tier is reserved and behaves identically until calibration freezes a difference.
- **Breaker trips need a gate-running run.** A fuse that trips with no gate-running phase run of the matching phase journals the trip and opens no recovery item — the run to park is gone.
