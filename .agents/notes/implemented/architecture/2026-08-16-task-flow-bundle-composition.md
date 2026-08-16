# Agent Note: Task-flow bundle composition — Service Definition rows stay out of Loader lists

Status: implemented

English | [中文](2026-08-16-task-flow-bundle-composition.zh.md)

## Problem

The first assembled web replay of the M1 task-flow stack failed at Loader apply with two composition faults: `service "tasks" has been registered at <TaskHandle>` (a double registration) and `Cannot find package 'zod'` from `workbench-host/lib/typert.host.js`. Both faults are invisible to per-package suites and to the host-aggregate typecheck; only the real Loader composition surfaces them.

## Decision

- A Service Definition package (abstract base class plus contracts, `packages/task-flow/task` is the example) is a compile-time face, never a Loader plugin row. `packages/bundle/base/cordis.patch.yml` lists only runtime providers (`task-local`, not `task`): the cordis Loader instantiates constructor exports, so an abstract `TaskHandle` row registers the `tasks` service key once and the real provider's registration then throws. The same rule already held in the engine e2e fixture, which never listed `task`.
- Typert-generated artifacts (`lib/typert.host.js`, `lib/typert.remote-client.js`) import `zod` at runtime, so a package that ships them declares `zod` in `dependencies`, not `peerDependencies`. `recipe`, `task`, and `workbench-host` were aligned with `deliverable-minimal` and `task-local`, which already declared it.

## Verification

- `pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/cold-blank-session.e2e.ts` boots the healed base bundle past Loader apply.
- `pnpm run test:web` (replay): the healed assembly boots 76 web suites; the residual failures on this Windows host are pre-existing platform issues (tool-bash disabled on win32, Windows path separators in seeded fixtures, win32 terminal inspection), none referencing the task-flow rows.
- `pnpm run knip` passes with `ignoreDependencies: ["zod"]` for `recipe`, `task`, and `workbench-host` (their zod edge is generated-artifact-only, same precedent as `cordis-host-runner`).

## Alternatives considered

- Guarding the Loader against abstract constructor exports (an `isAbstract` probe): rejected — instantiation of constructor exports is the Loader contract; the composition list is the owned lever.
- Hoisting `zod` to the repo root for generated artifacts to resolve: rejected — pnpm strict isolation would still break outside the workspace, and the dependency edge belongs to the package that ships the importing artifact.

## Consequences

- Adding a task-flow Service Definition package to a bundle never adds a Loader row; its provider row carries the runtime.
- Any new Typert-contributing package adds `zod` to `dependencies` in the same change that generates its artifacts.
