import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
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

describe('deliverable-local through a real cordis.yml and headless process', () => {
  it('saves idempotently, retires the dependency closure, and recovers the stale heads and snapshot across a restart', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/deliverable-local/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'deliverable-local',
      tempDirPrefix: 'deliverable-local-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.docV1State).toBe('stale')
    expect(projection.replayedSame).toBe(true)
    expect(projection.conflictKey).toBe('idempotency-conflict')
    expect(projection.reportV1State).toBe('stale')
    expect(projection.snapshotRoots).toEqual([projection.snapshotRoots[0]])
    expect(projection.snapshotRuns).toEqual(['run-1'])
    expect(projection.snapshotStaledVersions).toBe(2)
    expect(projection.restartDocState).toBe('stale')
    expect(projection.restartReportState).toBe('stale')
    expect(projection.restartSnapshotRoots).toHaveLength(1)
    expect(projection.restartCurrentInputs).toBe(0)
    expect(projection.successorState).toBe('current')
    expect(projection.successorNumber).toBe(2)
    expect(projection.successorBaseMatches).toBe(true)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
