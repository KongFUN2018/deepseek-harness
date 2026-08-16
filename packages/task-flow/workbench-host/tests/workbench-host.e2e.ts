import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  before: Array<{ itemId: string; status: string; title: string }>
  batch: Array<{ itemId: string; outcome: string; currentRevision?: number }>
  decision: { outcome: string }
  after: Array<{ itemId: string; status: string }>
}

describe('workbench host through a real cordis.yml and headless process', () => {
  it('projects attention items and reports per-item batch and decision outcomes', async () => {
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
    expect(projection.before.map(item => [item.itemId, item.status, item.title])).toEqual([
      ['e2e-b-1', 'open', 'confirm-scope'],
      ['e2e-b-2', 'open', 'confirm-coverage'],
      ['e2e-c-1', 'open', 'pick-convention'],
    ])
    expect(projection.batch).toEqual([
      { itemId: 'e2e-b-1', outcome: 'resolved', currentRevision: 2 },
      { itemId: 'e2e-b-2', outcome: 'resolved', currentRevision: 2 },
      { itemId: 'e2e-gone', outcome: 'withdrawn' },
    ])
    expect(projection.decision).toEqual({ outcome: 'resolved' })
    expect(projection.after).toEqual([])
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
