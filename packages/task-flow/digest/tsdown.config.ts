import { defineConfig } from 'tsdown'

/** Build the package root and invariant companion as independent bundles. */
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
    // The side-effect type imports pull @Remote-bearing workspace sources into
    // the bundle; keep the runtime packages external so their built artifacts
    // (already decorator-lowered) resolve from the workspace at load time.
    deps: { neverBundle: ['@deepseek-ai/dsh-task', '@deepseek-ai/dsh-deliverable-local', '@deepseek-ai/dsh-workbench-journal', '@deepseek-ai/dsh-typert-protocol', '@deepseek-ai/dsh-invariants', '@deepseek-ai/dsh-brand'] },
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
