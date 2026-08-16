import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  itemState: string
  outcome: string
  phaseState: string
  resolvedFacts: number
  openCount: number
}

describe('attention through a real cordis.yml and headless process', () => {
  it('resolves one decision item and resumes the parked phase run', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/attention/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'attention',
      tempDirPrefix: 'attention-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.itemState).toBe('resolved')
    expect(projection.outcome).toBe('resolved')
    expect(projection.phaseState).toBe('gate-running')
    expect(projection.resolvedFacts).toBe(1)
    expect(projection.openCount).toBe(0)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
