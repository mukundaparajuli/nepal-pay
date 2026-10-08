import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
  },
  resolve: {
    alias: [
      {
        find: '@nepal-payments/core/internal',
        replacement: path.resolve(__dirname, './packages/core/src/internal.ts'),
      },
      {
        find: '@nepal-payments/core',
        replacement: path.resolve(__dirname, './packages/core/src'),
      },
      {
        find: '@nepal-payments/esewa',
        replacement: path.resolve(__dirname, './packages/esewa/src'),
      },
      {
        find: '@nepal-payments/khalti',
        replacement: path.resolve(__dirname, './packages/khalti/src'),
      },
    ],
  },
})
