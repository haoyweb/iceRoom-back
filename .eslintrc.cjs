const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const globals = require('globals')
const prettier = require('eslint-config-prettier')

module.exports = tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'coverage', 'prisma/generated'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
    },
  },
)
