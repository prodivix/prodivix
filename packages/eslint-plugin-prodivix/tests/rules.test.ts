import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Linter } from 'eslint';
import * as parser from '@typescript-eslint/parser';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import noCircular from '../src/rules/no-circular';
import noTypeError from '../src/rules/no-type-error';
import noUnusedVar from '../src/rules/no-unused-var';

const fixture = (
  files: Readonly<Record<string, string>>,
  run: (input: { directory: string; program: ts.Program }) => void
) => {
  const prefix = join(tmpdir(), 'prodivix-eslint-');
  const directory = mkdtempSync(prefix);
  try {
    for (const [name, contents] of Object.entries(files))
      writeFileSync(join(directory, name), contents, 'utf8');
    const program = ts.createProgram(
      Object.keys(files).map((name) => join(directory, name)),
      {
        strict: true,
        noEmit: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2020,
      }
    );
    run({ directory, program });
  } finally {
    if (resolve(directory).startsWith(resolve(prefix)))
      rmSync(directory, { recursive: true, force: true });
  }
};

const lint = (
  filename: string,
  program: ts.Program | undefined,
  rule: 'no-type-error' | 'no-circular'
) =>
  new Linter({ cwd: dirname(filename) }).verify(
    readFileSync(filename, 'utf8'),
    [
      {
        files: ['**/*.ts'],
        languageOptions: {
          parser,
          parserOptions: { programs: program ? [program] : undefined },
        },
        plugins: {
          prodivix: {
            rules: { 'no-type-error': noTypeError, 'no-circular': noCircular },
          },
        },
        rules: { [`prodivix/${rule}`]: 'error' },
      },
    ],
    { filename }
  );

describe('Prodivix code authoring ESLint rules', () => {
  it('reports actual TypeScript assignment, call argument, and operand errors with locations', () => {
    fixture(
      {
        'entry.ts':
          "const count: number = 'wrong';\nfunction consume(value: number) { return value; }\nconsume('wrong');\nconst result = true + false;\n",
      },
      ({ directory, program }) => {
        const messages = lint(
          join(directory, 'entry.ts'),
          program,
          'no-type-error'
        );
        expect(messages.map(({ message }) => message)).toEqual(
          expect.arrayContaining([
            expect.stringContaining('TS2322'),
            expect.stringContaining('TS2345'),
            expect.stringContaining('TS2365'),
          ])
        );
        expect(
          messages.every(
            ({ line, ruleId }) =>
              line > 0 && ruleId === 'prodivix/no-type-error'
          )
        ).toBe(true);
      }
    );
  });

  it('accepts a well-typed module and limits diagnostics to the current file', () => {
    fixture(
      {
        'entry.ts': 'export const count: number = 1;',
        'other.ts': "export const wrong: number = 'wrong';",
      },
      ({ directory, program }) =>
        expect(
          lint(join(directory, 'entry.ts'), program, 'no-type-error')
        ).toEqual([])
    );
  });

  it.each(['no-circular', 'no-type-error'] as const)(
    '%s rejects a missing typed parser Program',
    (rule) => {
      fixture({ 'entry.ts': 'export const count = 1;' }, ({ directory }) =>
        expect(lint(join(directory, 'entry.ts'), undefined, rule)).toEqual([
          expect.objectContaining({
            messageId: 'typedConfiguration',
            severity: 2,
          }),
        ])
      );
    }
  );

  it('reports a transitive module cycle, including a re-export', () => {
    fixture(
      {
        'a.ts': "export { b } from './b'; export const a = 1;",
        'b.ts': "import { c } from './c'; export const b = c;",
        'c.ts': "import { a } from './a'; export const c = a;",
      },
      ({ directory, program }) => {
        const messages = lint(join(directory, 'a.ts'), program, 'no-circular');
        expect(messages).toEqual([
          expect.objectContaining({ messageId: 'circular', line: 1 }),
        ]);
        expect(messages[0]?.message).toMatch(
          /a\.ts -> .*b\.ts -> .*c\.ts -> .*a\.ts/u
        );
      }
    );
  });

  it('accepts an acyclic graph and excludes type-only cycles', () => {
    fixture(
      {
        'a.ts': "import type { B } from './b'; export interface A { value: B }",
        'b.ts': "import type { A } from './a'; export interface B { value: A }",
        'entry.ts': "export { value } from './leaf';",
        'leaf.ts': 'export const value = 1;',
      },
      ({ directory, program }) => {
        expect(lint(join(directory, 'a.ts'), program, 'no-circular')).toEqual(
          []
        );
        expect(
          lint(join(directory, 'entry.ts'), program, 'no-circular')
        ).toEqual([]);
      }
    );
  });

  it('resolves path aliases through the same TypeScript Program', () => {
    fixture(
      {
        'a.ts': "import { b } from '@local/b'; export const a: number = b;",
        'b.ts': "import { a } from '@local/a'; export const b: number = a;",
      },
      ({ directory }) => {
        const program = ts.createProgram(
          [join(directory, 'a.ts'), join(directory, 'b.ts')],
          {
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            paths: { '@local/*': [join(directory, '*')] },
          }
        );
        expect(lint(join(directory, 'a.ts'), program, 'no-circular')).toEqual([
          expect.objectContaining({ messageId: 'circular' }),
        ]);
      }
    );
  });

  it('reports initialized and write-only locals while preserving read and exported variables', () => {
    const messages = new Linter().verify(
      'const unused = 1; let onlyWritten; onlyWritten = 2; const used = 3; console.log(used); export const publicValue = 4;',
      [
        {
          plugins: { prodivix: { rules: { 'no-unused-var': noUnusedVar } } },
          rules: { 'prodivix/no-unused-var': 'error' },
        },
      ]
    );
    expect(messages.map(({ message }) => message)).toEqual([
      'Variable "unused" is declared but never used.',
      'Variable "onlyWritten" is declared but never used.',
    ]);
  });
});
