import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  chain: number[]
  staleRejected: boolean
  currentBefore: number[]
  invalidated: string[]
  currentAfter: number[]
  restartChain: number
  restartCurrent: number[]
}

describe('minimal deliverable service through a real cordis.yml and headless process', () => {
  it('chains versions durably, rejects stale writes, invalidates downstream, and recovers across a restart', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/deliverable-minimal/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'deliverable-minimal',
      tempDirPrefix: 'deliverable-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.chain).toEqual([1, 2, 3])
    expect(projection.staleRejected).toBe(true)
    expect(projection.currentBefore).toEqual([1, 2])
    expect(projection.invalidated).toHaveLength(3)
    expect(projection.currentAfter).toEqual([])
    expect(projection.restartChain).toBe(0)
    expect(projection.restartCurrent).toEqual([3])
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
