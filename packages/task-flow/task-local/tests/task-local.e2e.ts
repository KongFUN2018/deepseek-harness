import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  accepted: boolean
  staleInput: string[]
  registeredInputs: number
  dedupedGates: number
  completedState: string
  journalSeq: number
  taskFacts: number
  eventsSeen: number
  restartState: string
  restartJournalSeq: number
  restartGates: number
  restartInputs: number
}

describe('durable task provider through a real cordis.yml and headless process', () => {
  it('completes a deliverable-validated lifecycle with journal commit points and recovers across a restart', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/task-local/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'task-local',
      tempDirPrefix: 'task-local-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.accepted).toBe(true)
    expect(projection.staleInput).toEqual(expect.arrayContaining([expect.stringContaining('no longer current')]))
    expect(projection.registeredInputs).toBe(0)
    expect(projection.dedupedGates).toBe(1)
    expect(projection.completedState).toBe('completed')
    expect(projection.taskFacts).toBe(4)
    // M2 grows the deliverable fact stream: invalidation appends the staled
    // version and the impact snapshot alongside the write-chain registrations.
    expect(projection.journalSeq).toBe(17)
    expect(projection.eventsSeen).toBe(4)
    expect(projection.restartState).toBe('completed')
    expect(projection.restartJournalSeq).toBe(17)
    expect(projection.restartGates).toBe(1)
    expect(projection.restartInputs).toBe(0)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
