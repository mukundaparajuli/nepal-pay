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
        find: '@nepal-pay/core/internal',
        replacement: path.resolve(__dirname, './packages/core/src/internal.ts'),
      },
      {
        find: '@nepal-pay/core',
        replacement: path.resolve(__dirname, './packages/core/src'),
      },
      {
        find: '@nepal-pay/connectips/pfx',
        replacement: path.resolve(
          __dirname,
          './packages/connectips/src/pfx.ts'
        ),
      },
      {
        find: '@nepal-pay/connectips',
        replacement: path.resolve(__dirname, './packages/connectips/src'),
      },
      {
        find: '@nepal-pay/fonepay',
        replacement: path.resolve(__dirname, './packages/fonepay/src'),
      },
      {
        find: '@nepal-pay/cli',
        replacement: path.resolve(__dirname, './packages/cli/src'),
      },
      {
        find: '@nepal-pay/esewa',
        replacement: path.resolve(__dirname, './packages/esewa/src'),
      },
      {
        find: '@nepal-pay/khalti',
        replacement: path.resolve(__dirname, './packages/khalti/src'),
      },
      {
        find: '@nepal-pay/mock',
        replacement: path.resolve(__dirname, './packages/mock/src'),
      },
    ],
  },
})
