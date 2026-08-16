#!/usr/bin/env node
/** Loader-driver for the deliverable-local service: boot the real
 * `cordis.yml` (the storage stack and the workbench journal), save an
 * idempotent version chain, register a dependency edge and a phase input the
 * way the task write chain does, invalidate downstream, restart on the same
 * medium and observe recovery, then chain a successor on the staled head,
 * streaming one JSON projection on stdout. Imports the built package roots so
 * plain-Node lib mode never loads decorator-bearing source. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { DeliverableId } from '@deepseek-ai/dsh-deliverable-local'
import type { Context } from '@deepseek-ai/cordis'

/** One driver run's streamed projection. */
interface Projection {
  docV1State: string
  replayedSame: boolean
  conflictKey: string
  reportV1State: string
  snapshotRoots: string[]
  snapshotRuns: string[]
  snapshotStaledVersions: number
  restartDocState: string
  restartReportState: string
  restartSnapshotRoots: string[]
  restartCurrentInputs: number
  successorState: string
  successorNumber: number
  successorBaseMatches: boolean
}

const NAME = 'deliverable-local-e2e-driver'
const [configArg] = process.argv.slice(2)
if (configArg === undefined || configArg.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const root = await mkdtemp(join(tmpdir(), 'dsh-deliverable-e2e-'))
process.env.DSH_DELIVERABLE_E2E_ROOT = root
const uninstallFailLoud = installFailLoud(NAME)

const DOC = DeliverableId('design-doc')
const REPORT = 'site-report'

try {
  loadEnv(NAME)
  let ctx: Context = await boot(NAME, resolveConfigPath(configArg, undefined))
  const docV1 = await ctx.deliverables.saveVersion(DOC, null, null, 'doc-root-k')
  const replayedSame = (await ctx.deliverables.saveVersion(DOC, null, null, 'doc-root-k')).versionId === docV1.versionId
  let conflictKey = 'none'
  try {
    await ctx.deliverables.saveVersion(DOC, null, 's-other', 'doc-root-k')
  } catch (error) {
    conflictKey = String((error as { code?: string }).code ?? error)
  }
  const reportV1 = await ctx.deliverables.saveVersion(REPORT, null, null)
  await ctx.deliverables.registerVersionDependencies(reportV1.versionId, [
    { deliverableId: DOC, versionId: docV1.versionId },
  ])
  await ctx.deliverables.recordPhaseInputs('run-1', [docV1.versionId])
  const snapshot = await ctx.deliverables.invalidateDownstream([docV1.versionId])

  await ctx.fiber.dispose()
  ctx = await boot(NAME, resolveConfigPath(configArg, undefined))
  const restartDocState = ctx.deliverables.getVersion(docV1.versionId)?.state ?? 'missing'
  const restartReportState = ctx.deliverables.getVersion(reportV1.versionId)?.state ?? 'missing'
  const restartSnapshotRoots = [...(ctx.deliverables.getImpactSnapshot(snapshot.snapshotId)?.roots ?? [])]
  const restartCurrentInputs = ctx.deliverables.listCurrentInputs('run-1').length
  const successor = await ctx.deliverables.saveVersion(REPORT, reportV1.versionId, null)
  const docV1State = ctx.deliverables.getVersion(docV1.versionId)?.state ?? 'missing'
  const reportV1State = ctx.deliverables.getVersion(reportV1.versionId)?.state ?? 'missing'
  await ctx.fiber.dispose()

  const projection: Projection = {
    docV1State,
    replayedSame,
    conflictKey,
    reportV1State,
    snapshotRoots: [...snapshot.roots],
    snapshotRuns: [...snapshot.affectedPhaseRuns],
    snapshotStaledVersions: snapshot.staledVersions.length,
    restartDocState,
    restartReportState,
    restartSnapshotRoots,
    restartCurrentInputs,
    successorState: successor.state,
    successorNumber: successor.versionNumber,
    successorBaseMatches: successor.baseVersionId === reportV1.versionId,
  }
  console.log(JSON.stringify(projection))
} catch (error) {
  console.error((error as Error).stack ?? String(error))
  process.exitCode = 1
} finally {
  uninstallFailLoud()
  await rm(root, { recursive: true, force: true })
}
