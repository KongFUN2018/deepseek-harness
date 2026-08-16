import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  builtin: { revision: number; phaseCount: number }
  custom: { revision: number; hash: string }
  pinned: { hash: string; phases?: string }
  duplicateCode: string
}

describe('recipe registry through a real cordis.yml and headless process', () => {
  it('boots the built-in template, registers and pins a custom revision, and rejects a taken identity', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/recipe/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'recipe',
      tempDirPrefix: 'recipe-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.builtin).toEqual({ revision: 1, phaseCount: 1 })
    expect(projection.custom.revision).toBe(1)
    expect(projection.pinned.hash).toBe(projection.custom.hash)
    expect(projection.pinned.phases).toBe('main')
    expect(projection.duplicateCode).toBe('duplicate-revision')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
