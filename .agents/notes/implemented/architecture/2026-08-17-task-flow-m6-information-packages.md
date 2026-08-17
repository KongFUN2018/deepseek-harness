# Agent Note: task-flow M6 information packages (digest, metrics) and the wired board/detail surfaces

Status: implemented

English | [中文](2026-08-17-task-flow-m6-information-packages.zh.md)

## Problem

M6 (PRD FR-5/FR-12, §11) requires the timeline, digest, and metrics to be
rebuildable from the journal, and the wireframe review (optimizations ①②④)
named the concrete UI gaps: no KPI row, no per-card phase progress, a flat
gate-verdict list, and no patch/rewind affordance. The M5 stack had every
fact the projections need but no read surface for them.

## Decision

Two new host services own the read projections, and the two existing client
packages absorb the UI without a new seat:

- `dsh-digest` (`ctx.digest`): one `digest(taskId)` Remote folding the
  journal replay plus the task/phase/version projections into run branches
  (rewind handoffs), a journal-order timeline, phase summaries with attempt
  counts, decision history, and deliverable states. Pure function per read,
  no incremental cache.
- `dsh-metrics` (`ctx.metrics`): `metrics()` aggregates the KPI counts
  (live tasks, open gate/ask items, current versions, 7-day throughput,
  per-kind gate pass rates); `taskMetrics(taskId)` the per-task measures
  (phase durations, rewind+retried-submission count, decision count, budget
  spend through an optional `ctx.get('budget')` read).
- The board gains the KPI row (GATE/ASK cards call the new owner
  `openInbox()` to drill into the inbox tab) and per-card recipe id plus
  phase progress `i/n`; the detail gains the run-branch line, the phase
  timeline with superseded/stale phases grayscaled, gate verdicts grouped by
  `kind ?? 'A'`, and the patch/rewind verb pair (outline vs primary) with a
  status hint instead of an inlined rewind call.

Three minimal seams carry the data: `GateCheckResult.kind?: 'A'|'B'|'C'`
(writers pass the GateCheckSpec class; readers default absent to `'A'` so
pre-M6 verdicts stay machine-class), `deliverables.listVersions()` (the
asset count and digest deliverable states), and
`DrawerTasksOwnerProps.openInbox` (the KPI drill-down).

## Alternatives considered

- **Result-embedded kind vs spec join**: folding the check class into the
  result row costs one optional field; joining GateCheckSpec at read time
  costs a recipe lookup per verdict and breaks for pinned revisions whose
  recipe evolved. Embedded kind wins.
- **Attention-item task join for per-card gate badges**: `AttentionItemView`
  carries no task id, so per-card open-decision counts would need a wire
  change in M4 surfaces; deferred — the KPI row and the detail grouping cover
  the wireframe's intent.
- **Inlined rewind request from the detail**: `requestRewind` needs impact
  roots the detail does not own; the verb pair shows the affordance and
  routes the decision through the inbox item, matching M5's single decision
  channel.

## Consequences

- `api-remotes` mounts the two new Remote namespaces, so every client
  compilation gains `ctx.remote.digest` / `ctx.remote.metrics`; packages
  that never opted into the services still type-check because the remotes
  are additive.
- Pre-M6 gate verdicts render as machine-class (A) everywhere; new writers
  carry the explicit class, and a later migration may make the field required.
- The KPI counts re-read whole snapshots per refresh (no incremental fold);
  acceptable at current volumes, revisit through the metrics README's
  known-limitations entry.
- Verification: digest/metrics suites (14 tests: pure derivation folds plus
  service reads over the memory-backed stack), board 25 / detail 24 suites
  green with the extended state and remotes, tsc host and client aggregates
  green.
