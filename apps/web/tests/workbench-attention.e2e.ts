// Web e2e scenario: the task-flow attention inbox over the shipped Web
// bundles and the real host composition. Two real tabs boot onto the same
// workbench-host snapshot, the forwarded workbench/attention-updated push folds
// into the tab that did not act, and the compare-and-set ladder stays loud at
// every step: the second confirm of the same item surfaces a counted conflict
// line and resyncs instead of silently dropping the row, and a batch holding an
// item the host already settled reports one non-resolved outcome. The
// journal-derived delta stream projects every settled mutation.
//
// Zero model calls: no replay fixture mounts, so a stray stream fails loud.
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { AttentionItemId } from '@deepseek-ai/dsh-attention'
import type { TaskId } from '@deepseek-ai/dsh-task/types'
import '@deepseek-ai/dsh-workbench-host-stream'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria,
  compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/workbench-attention', import.meta.url))
const CONFLICT_EXPECTED = join(SNAPSHOT_DIR, 'conflict.expected.md')
const MODE = webSnapshotMode()
const SEED_TASK = 'wbx-e2e-task' as TaskId

/** Seeded open B items; the checkId doubles as the human row title. */
const ITEMS = [
  { itemId: 'wbx-alpha', title: 'wbx-alpha-gate' },
  { itemId: 'wbx-bravo', title: 'wbx-bravo-gate' },
  { itemId: 'wbx-delta', title: 'wbx-delta-gate' },
] as const

/** The decision-inbox dialog on one tab. */
function inbox(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Decision Inbox' })
}

/** The row of one item, addressed through its checkbox aria-label. */
function row(page: Page, itemId: string): Locator {
  return inbox(page).locator(`li:has(input[aria-label="${itemId}"])`)
}

describe('web e2e: workbench attention inbox channel', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let tabA: Page
  let tabB: Page
  let tripA: ReturnType<typeof watchConsole>
  let tripB: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold()
    // Seed before any tab boots: both first loads then read the same snapshot.
    for (const item of ITEMS) {
      await scaffold.ctx.attention.createItem({
        itemId: AttentionItemId(item.itemId),
        taskId: SEED_TASK,
        kind: 'b-confirm',
        decisionKind: 'e2e',
        options: ['confirmed'],
        checkId: item.title,
      }, 'web-e2e-seed', `wbx-seed-${item.itemId}`)
    }
    browser = await chromium.launch()
    tabA = await newEnglishPage(browser)
    tabB = await newEnglishPage(browser)
    tripA = watchConsole(tabA)
    tripB = watchConsole(tabB)
    for (const page of [tabA, tabB]) {
      await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
      await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      await page.getByRole('button', { name: 'Inbox', exact: true }).click()
      await inbox(page).waitFor({ timeout: 10_000 })
    }
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('boots both tabs onto the same snapshot and rebuilds it after a reload', async () => {
    onTestFailed(() => { void saveFailureShot(tabA, 'web-e2e-wbx-boot-a') })
    for (const page of [tabA, tabB]) {
      for (const item of ITEMS) {
        await row(page, item.itemId).waitFor({ timeout: 10_000 })
        await expect.poll(() => row(page, item.itemId).textContent(), { timeout: 10_000 })
          .toContain('open')
        await expect(row(page, item.itemId).textContent()).resolves.toContain('rev 1')
      }
    }
    // A reload discards the client world; the rebuilt projection must match.
    const warningStart = tripB.warnings.length
    await tabB.reload()
    acknowledgeReloadConnectionLoss(tripB, warningStart)
    await tabB.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await tabB.getByRole('button', { name: 'Inbox', exact: true }).click()
    await inbox(tabB).waitFor({ timeout: 10_000 })
    for (const item of ITEMS) {
      await expect.poll(() => row(tabB, item.itemId).textContent(), { timeout: 10_000 })
        .toContain('open')
    }
  }, 120_000)

  it('lets one tab resolve while the other conflicts loudly and resyncs', async () => {
    onTestFailed(() => {
      void saveFailureShot(tabA, 'web-e2e-wbx-conflict-a')
      void saveFailureShot(tabB, 'web-e2e-wbx-conflict-b')
    })
    // Tab A settles alpha; its own resync drops the row from the open list.
    await tabA.locator('input[aria-label="wbx-alpha"]').check()
    await tabA.getByRole('button', { name: 'Confirm selected' }).click()
    await row(tabA, 'wbx-alpha').waitFor({ state: 'detached', timeout: 10_000 })
    await expect(tabA.getByRole('alert').count()).resolves.toBe(0)
    // The forwarded push folds into tab B before it acts: the row it still
    // holds reports the settled state, so its confirm carries the folded
    // revision and the host answers a non-resolved outcome.
    await expect.poll(() => row(tabB, 'wbx-alpha').textContent(), { timeout: 15_000 })
      .toContain('resolved')
    await tabB.locator('input[aria-label="wbx-alpha"]').check()
    await tabB.getByRole('button', { name: 'Confirm selected' }).click()
    await expect.poll(() => tabB.getByRole('alert').textContent(), { timeout: 10_000 })
      .toContain('1 item(s) not confirmed')
    await expect(tabB.getByRole('alert').textContent()).resolves.toContain('resynced')
    // The failed command still resyncs: the settled row leaves the open list
    // while the counted conflict line stays visible as history.
    await row(tabB, 'wbx-alpha').waitFor({ state: 'detached', timeout: 10_000 })
    await expect(tabB.getByRole('alert').count()).resolves.toBe(1)
    const snapshot = await captureStableAria(tabB, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(CONFLICT_EXPECTED, snapshot, MODE)
    // Host truth: exactly one resolution landed; the retry settled nothing new.
    const settled = scaffold.ctx.attention.getItem('wbx-alpha')
    expect(settled?.state).toBe('resolved')
    expect(settled?.entityRevision).toBe(2)
  }, 120_000)

  it('reports per-item outcomes for a batch holding an already-settled item', async () => {
    onTestFailed(() => { void saveFailureShot(tabA, 'web-e2e-wbx-batch-a') })
    // Settle delta through a direct attention command: the fact commits without
    // the workbench push, so tab A still believes delta is open.
    await scaffold.ctx.attention.confirmBatch(
      [{ itemId: AttentionItemId('wbx-delta'), expectedEntityRevision: 1 }],
      'web-e2e-seed',
      'wbx-presettle-delta',
    )
    expect(scaffold.ctx.attention.getItem('wbx-delta')?.state).toBe('resolved')
    // The batch carries bravo (still open) and delta (already settled): one
    // resolves, one reports non-resolved, and the count surfaces — never silent.
    await tabA.locator('input[aria-label="wbx-bravo"]').check()
    await tabA.locator('input[aria-label="wbx-delta"]').check()
    await tabA.getByRole('button', { name: 'Confirm selected' }).click()
    await expect.poll(() => tabA.getByRole('alert').textContent(), { timeout: 10_000 })
      .toContain('1 item(s) not confirmed')
    // Host truth: bravo really resolved; delta kept its single settlement.
    expect(scaffold.ctx.attention.getItem('wbx-bravo')?.state).toBe('resolved')
    expect(scaffold.ctx.attention.getItem('wbx-delta')?.entityRevision).toBe(2)
    // The batch resync drops both settled rows from the open list.
    await row(tabA, 'wbx-bravo').waitFor({ state: 'detached', timeout: 10_000 })
    await row(tabA, 'wbx-delta').waitFor({ state: 'detached', timeout: 10_000 })
    // The push folds bravo's settlement into tab B without any command there;
    // delta's direct settle never pushed, so that row keeps its stale view.
    await expect.poll(() => row(tabB, 'wbx-bravo').textContent(), { timeout: 15_000 })
      .toContain('resolved')
    await expect(row(tabB, 'wbx-delta').textContent()).resolves.toContain('open')
    expect(tripA.pageErrors).toEqual([])
    expect(tripA.warnings).toEqual([])
    expect(tripB.pageErrors).toEqual([])
    expect(tripB.warnings).toEqual([])
  }, 120_000)

  it('projects every settled mutation into the journal-derived delta stream', () => {
    const feed = scaffold.ctx.workbenchHostStream.listIncremental(0)
    expect(feed.events.length).toBeGreaterThanOrEqual(6)
    expect(feed.events.every(event => event.entityKind === 'attention')).toBe(true)
    for (const item of ITEMS) {
      const own = feed.events.filter(event => event.entityId === item.itemId)
      expect(own.map(event => event.operation)).toEqual(['created', 'resolved'])
    }
  })

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['conflict.expected.md'])
  })
})
