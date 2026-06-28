import { describe, expect, it } from 'vitest';
import {
  ProductionExportPlanner,
  createExportProgramBuilder,
  createReactViteExportPreset,
  createUniqueExportPath,
  getRelativeImportPath,
  mergeExportDependencies,
  normalizeExportPath,
  renderExportImportIntent,
} from '#src/export';
import type {
  ExportModule,
  ExportProgram,
  ExportSourceTrace,
} from '#src/export';

const sourceTrace: ExportSourceTrace[] = [
  {
    sourceRef: {
      domain: 'pir',
      id: 'root',
      path: '/ui/graph/nodesById/root',
    },
  },
];

const createModule = (overrides: Partial<ExportModule> = {}): ExportModule => ({
  id: overrides.id ?? 'module-home',
  kind: overrides.kind ?? 'react-component',
  ownerRootId: overrides.ownerRootId,
  suggestedName: overrides.suggestedName ?? 'Home',
  language: overrides.language ?? 'tsx',
  imports: overrides.imports ?? [],
  body: overrides.body ?? 'export default function Home() { return null; }',
  sourceTrace: overrides.sourceTrace ?? sourceTrace,
  origin: overrides.origin,
});

const createProgram = (modules: ExportModule[]): ExportProgram => ({
  target: createReactViteExportPreset().target,
  roots: [
    {
      id: 'home',
      kind: 'component',
      displayName: 'Home',
      sourceRef: sourceTrace[0].sourceRef,
    },
  ],
  modules,
  styles: [],
  assets: [],
  artifacts: [],
  files: [],
  sources: [],
  deployments: [],
  runtimeRequirements: [],
  dependencies: [],
  diagnostics: [],
});

describe('export path planner', () => {
  it('normalizes unsafe and platform-specific output paths', () => {
    expect(normalizeExportPath('C:\\tmp\\..\\src\\Home Page.tsx')).toBe(
      'tmp/src/Home-Page.tsx'
    );
    expect(normalizeExportPath('/src/./components//Button.tsx')).toBe(
      'src/components/Button.tsx'
    );
  });

  it('creates unique file paths without changing the original path first', () => {
    const usedPaths = new Set<string>();

    expect(createUniqueExportPath('src/Home.tsx', usedPaths)).toBe(
      'src/Home.tsx'
    );
    expect(createUniqueExportPath('src/Home.tsx', usedPaths)).toBe(
      'src/Home-2.tsx'
    );
    expect(createUniqueExportPath('src/Home.tsx', usedPaths)).toBe(
      'src/Home-3.tsx'
    );
  });

  it('calculates relative module imports without leaking file extensions', () => {
    expect(
      getRelativeImportPath(
        'src/routes/home/Home.tsx',
        'src/runtime/prodivix-events.ts'
      )
    ).toBe('../../runtime/prodivix-events');
    expect(
      getRelativeImportPath('src/App.tsx', 'src/components/Card.tsx')
    ).toBe('./components/Card');
  });
});

describe('export import and dependency planners', () => {
  it('renders stable import statements from import intents', () => {
    expect(
      renderExportImportIntent({
        kind: 'named',
        source: '@prodivix/ui',
        imported: 'PdxButton',
        local: 'Button',
      })
    ).toBe("import { PdxButton as Button } from '@prodivix/ui';");
    expect(
      renderExportImportIntent({
        kind: 'side-effect',
        source: './Home.css',
      })
    ).toBe("import './Home.css';");
  });

  it('merges dependencies by package name and keeps deterministic order', () => {
    expect(
      mergeExportDependencies([
        { name: 'vite', version: '^7.3.0', kind: 'devDependency' },
        { name: 'react', version: '^19.2.0', kind: 'dependency' },
        { name: 'react', version: '^19.2.0', kind: 'peerDependency' },
      ])
    ).toEqual([
      { name: 'react', version: '^19.2.0', kind: 'dependency' },
      { name: 'vite', version: '^7.3.0', kind: 'devDependency' },
    ]);
  });
});

describe('ProductionExportPlanner', () => {
  it('plans source modules into an export bundle with file kind and source trace', () => {
    const planner = new ProductionExportPlanner();
    const bundle = planner.plan(
      createProgram([
        createModule({
          imports: [
            {
              kind: 'default',
              source: 'react',
              imported: 'React',
            },
          ],
        }),
      ])
    );
    const sourceFile = bundle.files.find(
      (file) => file.path === 'src/Home.tsx'
    );

    expect(bundle.entryFilePath).toBe('src/Home.tsx');
    expect(sourceFile).toMatchObject({
      path: 'src/Home.tsx',
      kind: 'source-module',
      language: 'tsx',
      importMode: 'module',
      sourceTrace,
    });
    expect(sourceFile?.contents).toContain("import React from 'react';");
    expect(
      bundle.files.some(
        (file) => file.path === '.prodivix/export-manifest.json'
      )
    ).toBe(true);
  });

  it('routes runtime and domain modules through stable production directories', () => {
    const planner = new ProductionExportPlanner();
    const bundle = planner.plan(
      createProgram([
        createModule({
          id: 'events-runtime',
          kind: 'runtime-helper',
          suggestedName: 'prodivix-events',
          language: 'ts',
        }),
        createModule({
          id: 'fetch-user',
          kind: 'nodegraph-runtime',
          suggestedName: 'fetchUser',
          language: 'ts',
        }),
      ])
    );

    expect(
      bundle.files
        .filter(
          (file) =>
            file.kind === 'runtime-module' || file.kind === 'domain-module'
        )
        .map((file) => [file.path, file.kind])
    ).toEqual([
      ['src/runtime/prodivix-events.ts', 'runtime-module'],
      ['src/logic/nodegraphs/fetchUser.ts', 'domain-module'],
    ]);
  });

  it('aggregates component styles and injects stylesheet imports into owner modules', () => {
    const planner = new ProductionExportPlanner();
    const bundle = planner.plan({
      ...createProgram([
        createModule({
          ownerRootId: 'home',
          suggestedName: 'Home',
        }),
      ]),
      styles: [
        {
          id: 'style-empty',
          ownerRootId: 'home',
          scope: 'component',
          cssText: '/* empty */',
          sourceTrace,
        },
        {
          id: 'style-button',
          ownerRootId: 'home',
          scope: 'component',
          cssText: '.button { color: red; }',
          sourceTrace,
        },
        {
          id: 'style-card',
          ownerRootId: 'home',
          scope: 'component',
          cssText: '.card { color: blue; }',
          sourceTrace,
        },
      ],
    });

    const componentFile = bundle.files.find(
      (file) => file.path === 'src/components/home/Home.tsx'
    );
    const styleFile = bundle.files.find(
      (file) => file.path === 'src/components/home/Home.css'
    );

    expect(componentFile?.contents).toContain("import './Home.css';");
    expect(styleFile).toMatchObject({
      kind: 'stylesheet',
      language: 'css',
      importMode: 'side-effect',
    });
    expect(styleFile?.contents).toBe(
      '.button { color: red; }\n\n.card { color: blue; }\n'
    );
  });
});

describe('ExportProgramBuilder', () => {
  it('merges domain contributions into a deterministic export program', () => {
    const builder = createExportProgramBuilder(
      createReactViteExportPreset().target
    );

    const program = builder
      .addContribution({
        modules: [
          createModule({
            id: 'home',
            suggestedName: 'Home',
          }),
        ],
        dependencies: [{ name: 'react', version: '^19.2.0' }],
        metadata: { source: 'blueprint' },
      })
      .addContribution({
        modules: [
          createModule({
            id: 'events-runtime',
            kind: 'runtime-helper',
            suggestedName: 'prodivix-events',
            language: 'ts',
          }),
        ],
        dependencies: [{ name: 'react', version: '^19.2.0' }],
        metadata: { runtime: true },
      })
      .build();

    expect(program.modules.map((module) => module.id)).toEqual([
      'home',
      'events-runtime',
    ]);
    expect(program.dependencies).toEqual([
      {
        name: 'react',
        version: '^19.2.0',
        kind: 'dependency',
        origin: undefined,
      },
    ]);
    expect(program.metadata).toEqual({
      source: 'blueprint',
      runtime: true,
    });
  });
});
