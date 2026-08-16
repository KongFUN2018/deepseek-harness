import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  state: string
  phaseStates: string[]
  surveyKinds: string[]
  clarifyKinds: string[]
}

describe('recipe-multiphase through a real cordis.yml and headless process', () => {
  it('routes each phase of a two-phase recipe to the executor registered for its kind', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/recipe-multiphase/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'recipe-multiphase',
      tempDirPrefix: 'recipe-multiphase-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.state).toBe('completed')
    expect(projection.phaseStates).toEqual(['passed', 'passed'])
    expect(projection.surveyKinds).toEqual(['survey'])
    expect(projection.clarifyKinds).toEqual(['clarify'])
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
