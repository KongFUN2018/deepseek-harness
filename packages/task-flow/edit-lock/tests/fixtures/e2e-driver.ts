#!/usr/bin/env node
/** Loader-driver for the edit-lock service: boot the real `cordis.yml` (the
 * storage stack, recipe registry, workbench journal, deliverable service, and
 * durable task provider), acquire a lease, observe the first-write-wins
 * conflict and idempotent re-acquire, release, then let a short lease lapse
 * on the sweep, streaming one JSON projection on stdout. Imports the built
 * package roots so plain-Node lib mode never loads decorator-bearing source. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boot, installFailLoud, loadEnv, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { DeliverableId } from '@deepseek-ai/dsh-deliverable-local'
import type { Context } from '@deepseek-ai/cordis'

/** One driver run's streamed projection. */
interface Projection {
  acquireState: string
  acquiredFacts: number
  conflictCode: string
  conflictHolder: string
  idempotentSame: boolean
  releasedState: string
  releasedFacts: number
  expiredFacts: number
  activeAfterExpiry: number
}

const NAME = 'edit-lock-e2e-driver'
const [configArg] = process.argv.slice(2)
if (configArg === undefined || configArg.trim() === '') {
  throw new Error(`${NAME}: expected <config-path>`)
}

const root = await mkdtemp(join(tmpdir(), 'dsh-edit-lock-e2e-'))
process.env.DSH_EDIT_LOCK_E2E_ROOT = root
const uninstallFailLoud = installFailLoud(NAME)

const DOC = DeliverableId('design-doc')
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

let ctx: Context | undefined
try {
  loadEnv(NAME)
  ctx = await boot(NAME, resolveConfigPath(configArg, undefined))

  const docV1 = await ctx.deliverables.saveVersion(DOC, null, null)
  const lease = await ctx.editLock.acquire(String(DOC), docV1.versionId, 'alice', 60_000, 't-1')
  const acquiredFacts = ctx.workbenchJournal.replay(0).filter(fact => fact.kind === 'edit-lock/acquired').length

  let conflictCode = 'none'
  let conflictHolder = 'none'
  try {
    await ctx.editLock.acquire(String(DOC), docV1.versionId, 'bob', 60_000)
  } catch (error) {
    conflictCode = String((error as { code?: string }).code ?? error)
    conflictHolder = (error as { holder?: string }).holder ?? 'none'
  }

  const again = await ctx.editLock.acquire(String(DOC), docV1.versionId, 'alice', 60_000, 't-1')
  const idempotentSame = again.leaseId === lease.leaseId

  const released = await ctx.editLock.release(String(lease.leaseId), lease.entityRevision, 'alice')
  const releasedFacts = ctx.workbenchJournal.replay(0).filter(fact => fact.kind === 'edit-lock/released').length

  await ctx.editLock.acquire(String(DOC), docV1.versionId, 'carol', 40)
  await delay(400)
  const expiredFacts = ctx.workbenchJournal.replay(0).filter(fact => fact.kind === 'edit-lock/expired').length
  const activeAfterExpiry = ctx.editLock.listActive().length

  const projection: Projection = {
    acquireState: lease.state,
    acquiredFacts,
    conflictCode,
    conflictHolder,
    idempotentSame,
    releasedState: released.state,
    releasedFacts,
    expiredFacts,
    activeAfterExpiry,
  }
  console.log(JSON.stringify(projection))
  await ctx.fiber.dispose()
} catch (error) {
  try { await ctx?.fiber.dispose() } catch { /* fiber may already be disposed */ }
  console.error((error as Error).stack ?? String(error))
  process.exitCode = 1
} finally {
  uninstallFailLoud()
  await rm(root, { recursive: true, force: true })
}
