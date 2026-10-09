import tseslint from '@typescript-eslint/eslint-plugin'
import tsparser from '@typescript-eslint/parser'

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: true,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.strict.rules,
      ...tseslint.configs.recommended.rules,
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/dist',
      '**/build/**',
      '**/build',
      '**/node_modules/**',
      '**/node_modules',
      '**/coverage/**',
      '**/coverage',
      '**/.next/**',
      '**/.next',
      '**/next-env.d.ts',
    ],
  },
]
