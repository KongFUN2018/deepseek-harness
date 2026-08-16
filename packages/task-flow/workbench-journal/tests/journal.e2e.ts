import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
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

describe('workbench journal through a real cordis.yml and headless process', () => {
  it('appends durably, replays idempotently, and recovers head across a restart', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/workbench-journal/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'workbench-journal',
      tempDirPrefix: 'journal-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.firstSeq).toBe(1)
    expect(projection.secondSeq).toBe(2)
    expect(projection.replayedEqual).toBe(true)
    expect(projection.conflictRejected).toBe(true)
    expect(projection.checkpoint).toBe(2)
    expect(projection.deltaKinds).toEqual(['task.started'])
    expect(projection.restartCheckpoint).toBe(2)
    expect(projection.restartReplayKinds).toEqual(['task.created', 'task.started'])
    expect(projection.restartAppendSeq).toBe(3)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
