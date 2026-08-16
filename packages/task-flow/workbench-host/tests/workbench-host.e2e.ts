import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  snapshotBefore: { snapshotVersion: number; items: Array<{ itemId: string; status: string; entityRevision: number }> }
  batch: { snapshotVersion: number; results: Array<{ itemId: string; outcome: string; currentRevision?: number }> }
  snapshotAfter: { snapshotVersion: number; items: Array<{ itemId: string; status: string; entityRevision: number }> }
}

describe('workbench host through a real cordis.yml and headless process', () => {
  it('boots seeded items and reports per-item batch outcomes across the Loader', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/workbench-host/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'workbench-host',
      tempDirPrefix: 'workbench-host-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.snapshotBefore.items.map(item => [item.itemId, item.status])).toEqual([
      ['e2e-b-1', 'open'],
      ['e2e-b-2', 'open'],
      ['e2e-c-1', 'open'],
    ])
    expect(projection.batch.results).toEqual([
      { itemId: 'e2e-b-1', outcome: 'resolved', currentRevision: 2 },
      { itemId: 'e2e-b-2', outcome: 'resolved', currentRevision: 2 },
      { itemId: 'e2e-gone', outcome: 'withdrawn' },
    ])
    expect(projection.batch.snapshotVersion).toBe(2)
    expect(projection.snapshotAfter.snapshotVersion).toBe(2)
    expect(projection.snapshotAfter.items.find(item => item.itemId === 'e2e-c-1')?.status).toBe('open')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
