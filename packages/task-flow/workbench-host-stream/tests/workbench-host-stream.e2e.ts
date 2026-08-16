import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  created: number
  resolved: number
  cursor: number
  stableStreamId: boolean
  entityId: string
}

describe('workbench-host-stream through a real cordis.yml and headless process', () => {
  it('projects created and resolved facts into the change feed', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/workbench-host-stream/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'workbench-host-stream',
      tempDirPrefix: 'workbench-host-stream-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.created).toBe(1)
    expect(projection.resolved).toBe(1)
    expect(projection.cursor).toBe(2)
    expect(projection.stableStreamId).toBe(true)
    expect(projection.entityId).toBe('gate:t-1:human-review')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
