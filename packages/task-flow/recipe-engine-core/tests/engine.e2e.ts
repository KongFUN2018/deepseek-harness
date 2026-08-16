import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  autoState: string
  autoPhaseState: string
  autoGates: number
  autoSubmissionResult: string
  restartState: string
  restartGates: number
  pauseDuringFlight: string
  pausedState: string
  resumedState: string
}

describe('recipe engine through a real cordis.yml and headless process', () => {
  it('drives a pinned-recipe task to completion, recovers across a restart, and settles pause only after in-flight work records', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/recipe-engine-core/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'recipe-engine-core',
      tempDirPrefix: 'recipe-engine-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.autoState).toBe('completed')
    expect(projection.autoPhaseState).toBe('passed')
    expect(projection.autoGates).toBe(1)
    expect(projection.autoSubmissionResult).toBe('completed')
    expect(projection.restartState).toBe('completed')
    expect(projection.restartGates).toBe(1)
    expect(projection.pauseDuringFlight).toBe('pausing')
    expect(projection.pausedState).toBe('paused')
    expect(projection.resumedState).toBe('completed')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
