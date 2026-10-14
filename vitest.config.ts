import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: [...configDefaults.exclude, '**/*.bun.test.ts'],
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
        find: '@nepal-payments/connectips/pfx',
        replacement: path.resolve(
          __dirname,
          './packages/connectips/src/pfx.ts'
        ),
      },
      {
        find: '@nepal-payments/connectips',
        replacement: path.resolve(__dirname, './packages/connectips/src'),
      },
      {
        find: '@nepal-payments/fonepay',
        replacement: path.resolve(__dirname, './packages/fonepay/src'),
      },
      {
        find: '@nepal-payments/cli',
        replacement: path.resolve(__dirname, './packages/cli/src'),
      },
      {
        find: '@nepal-payments/esewa',
        replacement: path.resolve(__dirname, './packages/esewa/src'),
      },
      {
        find: '@nepal-payments/khalti',
        replacement: path.resolve(__dirname, './packages/khalti/src'),
      },
      {
        find: '@nepal-payments/mock',
        replacement: path.resolve(__dirname, './packages/mock/src'),
      },
    ],
  },
})
