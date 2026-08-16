import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  pinned: { recipeId: string; revision: number; hashLength: number }
  lifecycle: { task: string; phase: string; gate: string }
  rejected: { code: string; problems: string[] }
  replayEqual: boolean
  unknownRecipe: string
}

describe('task service through a real cordis.yml and headless process', () => {
  it('creates from the booted registry, completes a full lifecycle, and rejects a stale submission', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/task/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'task',
      tempDirPrefix: 'task-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.pinned).toEqual({ recipeId: 'empty-template', revision: 1, hashLength: 64 })
    expect(projection.lifecycle).toEqual({ task: 'completed', phase: 'passed', gate: 'gate-running' })
    expect(projection.rejected.code).toBe('submission-rejected')
    expect(projection.rejected.problems).toEqual(['the source session sequence range is not persisted'])
    expect(projection.replayEqual).toBe(true)
    expect(projection.unknownRecipe).toBe('not-found')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
