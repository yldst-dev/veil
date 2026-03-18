import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    'main/index': 'src/main/index.ts',
    'main/workers/processor': 'src/main/workers/processor.ts',
    'preload/index': 'src/preload/index.ts'
  },
  outDir: 'dist',
  format: ['cjs'],
  target: 'node20',
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ['electron'],
  dts: false,
  outExtension() {
    return {
      js: '.cjs'
    }
  }
})
