#!/usr/bin/env node
/** Loader-driver for the workbench-host channel slice: boot the real
 * `cordis.yml`, read one snapshot, commit one mixed-outcome batch confirm,
 * and stream the resulting store projection as a single JSON line. */

import type { Context } from '@deepseek-ai/cordis'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { WorkbenchItemId } from '@deepseek-ai/dsh-workbench-host'

const NAME = 'workbench-host-test-driver'
const [configPath] = process.argv.slice(2)
if (configPath === undefined || configPath.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const uninstallFailLoud = installFailLoud(NAME)
let ctx: Context | undefined
try {
  loadEnv(NAME)
  ctx = await boot(NAME, resolveConfigPath(configPath, undefined))
  const snapshotBefore = ctx.workbenchHost.listSnapshot()
  const batch = ctx.workbenchHost.confirmBatch({
    actor: 'e2e-driver',
    items: [
      { itemId: WorkbenchItemId('e2e-b-1'), expectedEntityRevision: 1 },
      { itemId: WorkbenchItemId('e2e-b-2'), expectedEntityRevision: 1 },
      { itemId: WorkbenchItemId('e2e-gone'), expectedEntityRevision: 1 },
    ],
  })
  const snapshotAfter = ctx.workbenchHost.listSnapshot()
  process.stdout.write(`${JSON.stringify({ snapshotBefore, batch, snapshotAfter })}\n`)
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  await ctx?.fiber.dispose()
  uninstallFailLoud()
}
