#!/usr/bin/env node
/** Loader-driver for the attention incremental stream: boot the real cordis.yml
 * (task-flow storage stack, attention, and stream services), create and resolve
 * one decision item, and stream one JSON projection proving the change feed
 * projects the two journal facts with a stable stream id and advancing cursor.
 * Imports the built package roots so plain-Node lib mode never loads
 * decorator-bearing source. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import '@deepseek-ai/dsh-attention'
import '@deepseek-ai/dsh-workbench-host-stream'
import { AttentionItemId } from '@deepseek-ai/dsh-attention'
import { TaskId } from '@deepseek-ai/dsh-task'

/** One driver run's streamed projection. */
interface Projection {
  created: number
  resolved: number
  cursor: number
  stableStreamId: boolean
  entityId: string
}

const NAME = 'workbench-host-stream-e2e-driver'
const [configArg] = process.argv.slice(2)
if (configArg === undefined || configArg.trim() === '') {
  throw new Error(NAME + ': expected <config-path>')
}

const root = await mkdtemp(join(tmpdir(), 'dsh-workbench-host-stream-e2e-'))
process.env.DSH_WORKBENCH_HOST_STREAM_E2E_ROOT = root
const uninstallFailLoud = installFailLoud(NAME)

try {
  loadEnv(NAME)
  const ctx = await boot(NAME, resolveConfigPath(configArg, undefined))

  const itemId = AttentionItemId('gate:t-1:human-review')
  await ctx.attention.createItem({
    itemId,
    taskId: TaskId('t-1'),
    kind: 'c-decision',
    decisionKind: 'gate',
    options: ['yes', 'no'],
  }, NAME, 'create-k')
  await ctx.attention.resolveDecision(String(itemId), 1, 'yes', NAME, 'resolve-k')

  const first = ctx.workbenchHostStream.listIncremental(0)
  const second = ctx.workbenchHostStream.listIncremental(first.cursor)

  const projection: Projection = {
    created: first.events.filter(event => event.operation === 'created').length,
    resolved: first.events.filter(event => event.operation === 'resolved').length,
    cursor: first.cursor,
    stableStreamId: second.streamId === first.streamId,
    entityId: first.events[0]?.entityId ?? 'missing',
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
