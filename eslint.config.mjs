import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * Single owner of the repository lint policy. Every workspace package runs
 * `eslint .` against this file, so a new package is covered the moment it is
 * created instead of only when someone remembers to copy a config into it.
 */
export default defineConfig([
  // Mirrors the build-output entries of .gitignore; ESLint does not read it.
  globalIgnores([
    '**/dist/**',
    '**/dist-ssr/**',
    '**/build/**',
    '**/coverage/**',
    '**/.turbo/**',
    '**/.vitepress/cache/**',
    '**/.vitepress/dist/**',
    '**/storybook-static/**',
    '**/out/**',
    '**/test-results/**',
    '**/playwright-report/**',
    '**/.tmp*/**',
    '**/*.generated.ts',
    'packages/*/lib/**',
    'packages/*/esm/**',
    'packages/*/cjs/**',
    'packages/golden-conformance/.golden-*/**',
    'apps/backend/**',
    'apps/web/packages/**',
    'apps/web/public/**',
  ]),
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Unused bindings are already a `tsc` error under `noUnusedLocals`.
      '@typescript-eslint/no-unused-vars': 'off',
      // Deferred initialisation that is observed before it is assigned cannot
      // become `const` without turning a defined `undefined` read into a TDZ
      // throw, so only genuinely mergeable declarations are reported.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,jsx}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // `_name` is the repository's marker for a binding that exists only to be
      // omitted (rest destructuring) or to hold a signature position.
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The compiler-driven diagnostics stay advisory until the editor surfaces
      // are migrated; the correctness rules above are the enforced part.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
]);
