import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  injectedState: string
  userMessageCount: number
  phaseState: string
  injectedFacts: number
  itemState: string
  itemOutcome: string | undefined
}

describe('clarification through a real cordis.yml and headless process', () => {
  it('injects the answered summary into the phase session and resumes the parked run', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/clarification/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'clarification',
      tempDirPrefix: 'clarification-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.injectedState).toBe('injected')
    expect(projection.userMessageCount).toBe(1)
    expect(projection.phaseState).toBe('gate-running')
    expect(projection.injectedFacts).toBe(1)
    expect(projection.itemState).toBe('resolved')
    expect(projection.itemOutcome).toBe('satisfied')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
