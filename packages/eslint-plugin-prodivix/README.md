# Prodivix ESLint plugin

This package checks JavaScript and TypeScript code authoring modules. It does not parse Canonical Workspace, PIR, or other domain documents. Domain validation remains with the corresponding Prodivix owner.

The recommended configuration enables `prodivix/no-unused-var` for unused local variable declarations. It counts reads, preserves exported declarations, and reports variables that are only initialized or assigned.

Opt in to `prodivix/no-type-error` to report the current file's TypeScript semantic errors, including assignment, operand, and function argument errors. TypeScript owns type inference and module resolution; this rule forwards compiler diagnostics with their source locations.

Opt in to `prodivix/no-circular` to find cycles in the TypeScript Program's resolved runtime import graph. It covers ES imports, re-exports, and TypeScript external `import =` declarations. Type-only dependencies and declaration files are excluded. Arbitrary runtime `require` or dynamic import expressions are outside this static graph.

Both typed rules require `@typescript-eslint/parser` with `parserOptions.projectService: true` or a configured `parserOptions.project`. They report a configuration error when no TypeScript Program owns the current file; a missing Program cannot produce a successful check.

```js
import parser from '@typescript-eslint/parser';
import prodivix from '@prodivix/eslint';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { prodivix },
    rules: {
      'prodivix/no-unused-var': 'warn',
      'prodivix/no-type-error': 'error',
      'prodivix/no-circular': 'error',
    },
  },
];
```

Run `pnpm test` to build the plugin and exercise real ESLint invocations against typed TypeScript Programs.
