import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  acquireState: string
  acquiredFacts: number
  conflictCode: string
  conflictHolder: string
  idempotentSame: boolean
  releasedState: string
  releasedFacts: number
  expiredFacts: number
  activeAfterExpiry: number
}

describe('edit-lock through a real cordis.yml and headless process', () => {
  it('acquires first-write-wins, conflicts with holder details, releases, and lapses on the sweep', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/edit-lock/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'edit-lock',
      tempDirPrefix: 'edit-lock-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.acquireState).toBe('active')
    expect(projection.acquiredFacts).toBe(1)
    expect(projection.conflictCode).toBe('lock-held')
    expect(projection.conflictHolder).toBe('alice')
    expect(projection.idempotentSame).toBe(true)
    expect(projection.releasedState).toBe('released')
    expect(projection.releasedFacts).toBe(1)
    expect(projection.expiredFacts).toBe(1)
    expect(projection.activeAfterExpiry).toBe(0)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
