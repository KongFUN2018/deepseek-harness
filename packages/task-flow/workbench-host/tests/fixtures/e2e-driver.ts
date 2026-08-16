#!/usr/bin/env node
/** Loader-driver for the workbench-host projection: boot the real cordis.yml
 * (task-flow storage stack, persistent attention service, and host
 * projection), create B/C items through attention, then read and mutate them
 * through the workbenchHost wire and stream one JSON projection. Imports the
 * built package roots so plain-Node lib mode never loads decorator-bearing
 * source. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { AttentionItemId } from '@deepseek-ai/dsh-attention'
import { TaskId } from '@deepseek-ai/dsh-task'
import { WorkbenchItemId } from '@deepseek-ai/dsh-workbench-host'

/** One driver run’s streamed projection. */
interface Projection {
  before: Array<{ itemId: string; status: string; title: string }>
  batch: Array<{ itemId: string; outcome: string; currentRevision?: number }>
  decision: { outcome: string }
  after: Array<{ itemId: string; status: string }>
}

const NAME = 'workbench-host-e2e-driver'
const [configArg] = process.argv.slice(2)
if (configArg === undefined || configArg.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const root = await mkdtemp(join(tmpdir(), 'dsh-workbench-host-e2e-'))
process.env.DSH_WORKBENCH_HOST_E2E_ROOT = root
const uninstallFailLoud = installFailLoud(NAME)

try {
  loadEnv(NAME)
  const ctx = await boot(NAME, resolveConfigPath(configArg, undefined))

  await ctx.attention.createItem({ itemId: AttentionItemId('e2e-b-1'), taskId: TaskId('t-1'), kind: 'b-confirm', decisionKind: 'gate', checkId: 'confirm-scope', options: ['yes'] }, NAME, 'seed-b-1')
  await ctx.attention.createItem({ itemId: AttentionItemId('e2e-b-2'), taskId: TaskId('t-1'), kind: 'b-confirm', decisionKind: 'gate', checkId: 'confirm-coverage', options: ['yes'] }, NAME, 'seed-b-2')
  await ctx.attention.createItem({ itemId: AttentionItemId('e2e-c-1'), taskId: TaskId('t-1'), kind: 'c-decision', decisionKind: 'gate', checkId: 'pick-convention', options: ['alpha', 'beta'] }, NAME, 'seed-c-1')

  const before = ctx.workbenchHost.listSnapshot()
  const batch = await ctx.workbenchHost.confirmBatch({
    actor: NAME,
    items: [
      { itemId: WorkbenchItemId('e2e-b-1'), expectedEntityRevision: 1 },
      { itemId: WorkbenchItemId('e2e-b-2'), expectedEntityRevision: 1 },
      { itemId: WorkbenchItemId('e2e-gone'), expectedEntityRevision: 1 },
    ],
  })
  const decision = await ctx.workbenchHost.resolveDecision({
    itemId: WorkbenchItemId('e2e-c-1'),
    expectedEntityRevision: 1,
    decision: 'alpha',
    actor: NAME,
  })
  const after = ctx.workbenchHost.listSnapshot()

  const projection: Projection = {
    before: before.items.map(item => ({ itemId: item.itemId, status: item.status, title: item.title })),
    batch: batch.results.map(row => ({
      itemId: row.itemId,
      outcome: row.outcome,
      ...(row.currentRevision === undefined ? {} : { currentRevision: row.currentRevision }),
    })),
    decision: { outcome: decision.outcome },
    after: after.items.map(item => ({ itemId: item.itemId, status: item.status })),
  }
  console.log(JSON.stringify(projection))
  await ctx.fiber.dispose()
} catch (error) {
  console.error(String(error))
  process.exitCode = 1
} finally {
  uninstallFailLoud()
  await rm(root, { recursive: true, force: true })
}
