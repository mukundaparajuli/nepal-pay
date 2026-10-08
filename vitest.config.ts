import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@nepal-payments/core': path.resolve(__dirname, './packages/core/src'),
      '@nepal-payments/esewa': path.resolve(__dirname, './packages/esewa/src'),
      '@nepal-payments/khalti': path.resolve(__dirname, './packages/khalti/src'),
    },
  },
})
