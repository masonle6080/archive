import { defineConfig } from 'vitest/config'

// better-sqlite3 is rebuilt for Electron's ABI on postinstall, so tests run
// under Electron-as-Node (see the `test` script), not plain Node.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  },
  // Skip the renderer's PostCSS config; the tests load no CSS.
  css: { postcss: {} }
})
