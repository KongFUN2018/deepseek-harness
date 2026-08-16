#!/usr/bin/env node
/** Loader-driver for the minimal deliverable service: boot the real `cordis.yml`
 * (the full storage stack plus the deliverable service), then drive version
 * chains, stale-write rejection, input listing, invalidation, and a restart on
 * the same medium, streaming one JSON projection on stdout. Imports the built
 * package root so plain-Node lib mode never loads decorator-bearing source. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import type { PhaseRunId, SubmissionId } from '@deepseek-ai/dsh-task/types'
import { DeliverableId } from '@deepseek-ai/dsh-deliverable-minimal'
import type { DeliverableVersion } from '@deepseek-ai/dsh-deliverable-minimal/types'

/** One driver run's streamed projection. */
interface Projection {
  chain: number[]
  staleRejected: boolean
  currentBefore: number[]
  invalidated: string[]
  currentAfter: number[]
  restartChain: number
  restartCurrent: number[]
}

const NAME = 'deliverable-minimal-e2e-driver'
const [configArg] = process.argv.slice(2)
if (configArg === undefined || configArg.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const root = await mkdtemp(join(tmpdir(), 'dsh-deliverable-e2e-'))
process.env.DSH_DELIVERABLE_E2E_ROOT = root
const uninstallFailLoud = installFailLoud(NAME)
try {
  loadEnv(NAME)
  const ctx = await boot(NAME, resolveConfigPath(configArg, undefined))
  const deliverables = ctx.deliverables
  const doc = DeliverableId('design-doc')
  const run = 'run-1' as PhaseRunId
  const sub = 'sub-1' as SubmissionId
  const v1: DeliverableVersion = await deliverables.saveVersion(doc, null, sub)
  const v2: DeliverableVersion = await deliverables.saveVersion(doc, v1.versionId, sub)
  const v3: DeliverableVersion = await deliverables.saveVersion(doc, v2.versionId, sub)
  let staleRejected = false
  try {
    await deliverables.saveVersion(doc, v1.versionId, null)
  } catch {
    staleRejected = true
  }
  await deliverables.recordPhaseInputs(run, [v1.versionId, v2.versionId])
  const currentBefore = deliverables.listCurrentInputs(run).map(v => v.versionNumber)
  const invalidated = (await deliverables.invalidateDownstream([v1.versionId])).invalidated
  const currentAfter = deliverables.listCurrentInputs(run).map(v => v.versionNumber)
  // Restart on the same medium: dispose the whole app, boot again on the same
  // root, and observe recovery of chains, stale states, and input registration.
  await ctx.fiber.dispose()
  const ctx2 = await boot(NAME, resolveConfigPath(configArg, undefined))
  const deliverables2 = ctx2.deliverables
  const restartChain = deliverables2.listCurrentInputs(run).length
  const restartV3 = deliverables2.getVersion(v3.versionId)
  await ctx2.fiber.dispose()
  const projection: Projection = {
    chain: [v1.versionNumber, v2.versionNumber, v3.versionNumber],
    staleRejected,
    currentBefore,
    invalidated,
    currentAfter,
    restartChain,
    restartCurrent: restartV3 === undefined ? [] : [restartV3.versionNumber],
  }
  console.log(JSON.stringify(projection))
  await rm(root, { recursive: true, force: true })
} catch (error) {
  console.error(String(error))
  process.exitCode = 1
} finally {
  uninstallFailLoud()
}
