# @deepseek-ai/dsh-recipe

English | [中文](README.zh.md)

Immutable task-flow recipe revision registry (`ctx.recipes`): payload validation, content-addressed revisions, pinned-identity reads with hash verification, and the built-in empty-template revision new tasks pin.

## Service contract

`ctx.recipes` is a `TypertRemoteService` bound to the `recipes` wire namespace. All four `@Remote` methods take plain wire values:

- `register(recipeId, revision, payload)` — validates the payload, computes its content hash, stores a defensive copy, and returns the revision; the same payload under the same identity is idempotent, a different payload under a taken identity fails with `duplicate-revision`.
- `getPinned(identity)` — reads one pinned revision and re-verifies its content hash (`hash-mismatch` fails loud).
- `latest(recipeId)` — highest registered revision; new-task creation only.
- `list()` — every registered identity.

The registry registers `empty-template` revision 1 at boot: one phase, an explicit PhaseSubmission, and a minimal deliverable.

## Extension points

- A filesystem provider registers real recipe payloads through `register`; the registry surface does not change when it lands.
- The task domain pins revisions via `getPinned`; running tasks never consult `latest`.

## Model Experience

### Recipe registry reads and registration

#### What the model sees

Nothing. `ctx.recipes` serves the task engine and the workbench UI; no tool, prompt section, or session event exposes registered recipes to a model request.

#### Token effect

None. Registry calls travel on the RPC carrier or the same-process engine path, both outside the model request path.

#### KV Cache effect

None. Recipe payloads never enter a prompt, so no prefix is added, removed, or reordered by this package.

## Known Limitations and Deferred Work

- Storage is in-memory: registered revisions vanish on restart. The filesystem provider makes registration durable; the pinned-empty-template fallback keeps M1 tasks bootable meanwhile.
- The stored revision is a defensive copy, so post-register caller mutation cannot drift it; `getPinned` re-verifies the hash as the seam where a future durable medium's corruption would surface.
- The uncalibrated M0 budget fields (token/time budgets, rerun cap, A-repair fuse, independent-review cost) are absent from the payload schema by design and cannot be set as defaults yet.
