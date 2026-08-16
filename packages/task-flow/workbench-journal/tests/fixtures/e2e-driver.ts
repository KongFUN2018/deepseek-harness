#!/usr/bin/env node
/** Loader-driver for the workbench journal: boot the real `cordis.yml` (the
 * full storage stack plus the journal service), then drive append, idempotent
 * replay, checkpoint, replay-after-checkpoint, and a restart on the same
 * medium, streaming one JSON projection on stdout. Imports the built package
 * root so plain-Node lib mode never loads decorator-bearing source. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import type { TaskId } from '@deepseek-ai/dsh-task/types'
import type { JournalFact } from '@deepseek-ai/dsh-workbench-journal/types'

/** One driver run's streamed projection. */
interface Projection {
  firstSeq: number
  secondSeq: number
  replayedEqual: boolean
  conflictRejected: boolean
  checkpoint: number
  deltaKinds: string[]
  restartCheckpoint: number
  restartReplayKinds: string[]
  restartAppendSeq: number
}

/** Append input for one fact; the wire string is branded at this boundary. */
function fact(taskId: string, kind: string, idempotencyKey: string) {
  return {
    taskId: taskId as TaskId,
    kind,
    actor: 'e2e-driver',
    idempotencyKey,
    entityRevision: 1,
    payload: { taskId, kind },
  }
}

const NAME = 'workbench-journal-e2e-driver'
const [configArg] = process.argv.slice(2)
if (configArg === undefined || configArg.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const root = await mkdtemp(join(tmpdir(), 'dsh-journal-e2e-'))
process.env.DSH_JOURNAL_E2E_ROOT = root
const uninstallFailLoud = installFailLoud(NAME)
try {
  loadEnv(NAME)
  const ctx = await boot(NAME, resolveConfigPath(configArg, undefined))
  const journal = ctx.workbenchJournal
  const first: JournalFact = await journal.append(fact('t-1', 'task.created', 'k1'))
  const second: JournalFact = await journal.append(fact('t-1', 'task.started', 'k2'))
  const replayed: JournalFact = await journal.append(fact('t-1', 'task.created', 'k1'))
  let conflictRejected = false
  try {
    await journal.append({ ...fact('t-1', 'task.created', 'k1'), entityRevision: 2 })
  } catch {
    conflictRejected = true
  }
  const checkpoint = journal.checkpoint()
  const delta = journal.replay(1)
  // Restart on the same medium: dispose the whole app, boot again on the same
  // root, and observe recovery through checkpoint and replay.
  await ctx.fiber.dispose()
  const ctx2 = await boot(NAME, resolveConfigPath(configArg, undefined))
  const journal2 = ctx2.workbenchJournal
  const restartCheckpoint = journal2.checkpoint()
  const restartFacts = journal2.replay(0)
  const restartAppend = await journal2.append(fact('t-1', 'task.paused-requested', 'k3'))
  await ctx2.fiber.dispose()
  const projection: Projection = {
    firstSeq: first.journalSeq,
    secondSeq: second.journalSeq,
    replayedEqual: replayed.journalSeq === first.journalSeq && replayed.eventId === first.eventId,
    conflictRejected,
    checkpoint: checkpoint.journalSeq,
    deltaKinds: delta.map((f: JournalFact) => f.kind),
    restartCheckpoint: restartCheckpoint.journalSeq,
    restartReplayKinds: restartFacts.map((f: JournalFact) => f.kind),
    restartAppendSeq: restartAppend.journalSeq,
  }
  console.log(JSON.stringify(projection))
  await rm(root, { recursive: true, force: true })
} catch (error) {
  console.error(String(error))
  process.exitCode = 1
} finally {
  uninstallFailLoud()
}
