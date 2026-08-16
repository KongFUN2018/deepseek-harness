import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'

interface E2EProjection {
  phaseState: string
  gateResultKinds: string[]
  openItems: Array<{ itemId: string; kind: string; decisionKind: string; checkId?: string; options: string[] }>
}

describe('gate through a real cordis.yml and headless process', () => {
  it('parks a B-check phase run in awaiting-decision and creates its decision item', async () => {
    const binScript = fileURLToPath(new URL('./fixtures/e2e-driver.ts', import.meta.url))
    const configPath = fileURLToPath(new URL('../../../../examples/headless-agent/tests/fixtures/task-flow/gate/cordis.yml', import.meta.url))
    const repoTsconfig = fileURLToPath(new URL('../../../../tsconfig.json', import.meta.url))
    const { stdout, stderr } = await runLoaderSmoke({
      label: 'gate',
      tempDirPrefix: 'gate-e2e-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath],
      tsconfigPath: repoTsconfig,
    })
    expect(stderr).toBe('')
    const projection = JSON.parse(stdout) as E2EProjection
    expect(projection.phaseState).toBe('awaiting-decision')
    expect(projection.gateResultKinds).toEqual(['outputs-complete'])
    expect(projection.openItems).toHaveLength(1)
    expect(projection.openItems[0]).toMatchObject({
      kind: 'b-confirm',
      decisionKind: 'gate',
      checkId: 'human-review',
      options: ['review the produced output'],
    })
    expect(projection.openItems[0]?.itemId).toMatch(/^gate:.*:human-review$/)
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
