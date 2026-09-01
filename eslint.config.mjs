import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs['strict'].rules,
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    // Custom platform (x-*) header names must come from src/config/http-headers.ts
    // constants, never raw string literals (2026-09-01, F1 follow-up).
    //
    // Root cause this catches: idempotency.stage.ts read
    // ctx.headers['idempotency-key'] while both real callers wrote
    // 'x-idempotency-key' -- two independent literals silently drifted apart
    // and nothing failed until a client's retry double-charged. A raw
    // string of this shape can drift the same way anywhere it's typed twice.
    //
    // Scoped OUT of src/adapters/**: a provider's own vendor header (e.g.
    // 'X-RapidAPI-Key') is read by exactly one adapter file -- there is no
    // second party it can silently disagree with, so centralizing those
    // buys no safety and would just be 300+ one-off constants.
    files: ['src/**/*.ts'],
    ignores: ['src/adapters/**', 'src/config/http-headers.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/^x-[a-z0-9-]+$/i]",
          message:
            'Custom platform header names must be imported from src/config/http-headers.ts, not written as a string literal here (see that file doc comment for why).',
        },
      ],
    },
  },
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '*.js', '*.mjs', '*.cjs'],
  },
];
