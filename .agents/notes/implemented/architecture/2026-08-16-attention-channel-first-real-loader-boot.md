# Agent Note: The attention channel's first real-Loader boot exposed two composition bugs

Status: implemented

English | [中文](2026-08-16-attention-channel-first-real-loader-boot.zh.md)

## Problem

The M4 exit criterion (multi-tab conflict explainable, no silent confirmation) was proven per layer — attention's CAS ladder, workbench-host's per-item results, the inbox controller's conflict count — but never through the shipped Web composition. The sanctioned lane for that proof is the keyless browser e2e lane (`launchWebScaffold`: real Loader over the base + web-app bundles, real chromium, real SSE/WebSocket). Its first boot refused to assemble, and the two failures were real product bugs the package-local suites could not see.

## Decision

- Fix the bugs, then add `apps/web/tests/workbench-attention.e2e.ts`: two real tabs over one scaffold, three seeded B items, five tests covering scenario 1 (both tabs boot onto the same snapshot; a reload rebuilds it), scenario 3's reload-rebuild half, scenario 4 (tab A resolves, the forwarded `workbench/attention-updated` push folds into tab B, tab B's confirm then carries the folded revision and surfaces a counted conflict line while the resync drops the settled row — pinned as an aria golden), scenario 5 (a batch holding one already-settled item reports exactly one non-resolved outcome), and the delta-stream projection check over `workbenchHostStream.listIncremental`. Host restart (the other half of scenario 3) stays out: the lane boots one Host per scaffold.
- Bug 1: `workbench-host`, `workbench-host-stream`, and `impact-propagation` shipped `lib/typert.host.js` artifacts that `import { z } from 'zod'` without declaring `zod` as a runtime dependency. The tsdown client build had already warned `UNRESOLVED_IMPORT 'zod'` on these packages; the real Loader failed the same resolution at boot. All three packages now declare `zod: ^4.4.3` in `dependencies` (matching `task`, `attention`, and every other Typert-remote package), with knip `ignoreDependencies` entries because knip only scans `src`.
- Bug 2: `edit-lock` declares a `static Config` zod object, and the base bundle mounts the row with no config block — zod received `undefined` and rejected the whole composition. The schema now carries `.default({ sweepIntervalMs: 5000 })`, so a config-less mount composes exactly as the README's documented default.

## Verification

- `DSH_SNAPSHOT=replay pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/workbench-attention.e2e.ts`: 5/5 green; the conflict golden (`snapshots/workbench-attention/conflict.expected.md`) pins the alert line plus the post-resync row set.
- Affected suites green: the four task-flow packages' unit suites (54 tests), the full task-flow real-Loader e2e lane (13 tests), `edit-lock`'s own e2e (its fixture still passes an explicit config), build:lib:host/client (the zod `UNRESOLVED_IMPORT` warnings are gone), knip, oxlint, and the verify-* battery (cordis-config 133, package-invariants 236, built-invariants, readme-limitations, model-experience, translation-pairing 969, export-jsdoc, md-links 1959).

## Alternatives considered

- **Hand-mounted controller tests as the multi-tab proof** against **the browser lane**: the controller tests already simulate the second-confirm-conflict, but the criterion says the shipped composition must behave that way; only the real Loader can catch the two mounting bugs this lane found.
- **Seeding items through the UI** against **host-side `ctx.attention.createItem`**: the scenario under test is the channel (snapshot read, push fold, compare-and-set), not item creation UX; host-side seeding keeps the test deterministic and zero-model-call.

## Consequences

- The Typert-remote package rule is now explicit: a package whose generator emits zod-importing artifacts must declare `zod` in `dependencies` (with a knip ignore), or the shipped bundle cannot boot; the tsdown `UNRESOLVED_IMPORT` warning on such a package is a boot failure, not noise.
- A Config-declaring service must tolerate a config-less mount (object-level `.default`), because bundles list rows without config blocks; per-field defaults alone are not enough.
