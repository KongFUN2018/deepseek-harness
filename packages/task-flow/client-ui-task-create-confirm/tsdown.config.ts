import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['lib/types/index.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    deps: { neverBundle: ['@deepseek-ai/dsh-task', '@deepseek-ai/dsh-client-runtime', '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-ui-tool', '@deepseek-ai/dsh-invariants'] },
  },
  {
    entry: ['lib/types/invariant.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
])
