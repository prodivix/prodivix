import { describe, expect, it } from 'vitest';
import {
  EXPORT_RESERVED_PATH_CONFLICT_CODE,
  ProductionExportPlanner,
  createExportProgramBuilder,
  createReactViteExportPreset,
  createReactViteScaffoldContributions,
} from '#src/export';
import type {
  ExportModule,
  ExportProgram,
  ExportProgramContribution,
  ExportSourceTrace,
} from '#src/export';

const sourceTrace: ExportSourceTrace[] = [
  {
    sourceRef: {
      domain: 'workspace',
      id: 'workspace-1',
      path: '/',
    },
  },
];

const preset = createReactViteExportPreset();

const createAuthoredModule = (desiredPath: string): ExportModule => ({
  id: 'workspace-code:app',
  kind: 'workspace-module',
  suggestedName: desiredPath.split('/').at(-1) ?? 'App.tsx',
  desiredPath,
  language: 'tsx',
  imports: [],
  body: 'export default function AuthoredComponent() { return null; }',
  sourceTrace,
  origin: {
    kind: 'workspace-document',
    owner: 'workspace',
    writePolicy: 'preserve-user-edits',
  },
});

const entryModule: ExportModule = {
  id: 'workspace-react-entry',
  kind: 'react-entry',
  suggestedName: 'App',
  language: 'tsx',
  imports: [],
  body: 'export default function App() { return null; }',
  sourceTrace,
};

/**
 * Mirrors the real assembly order: authored code documents are contributed
 * before the generated application entry.
 */
const createProgramWithAuthoredModule = (desiredPath: string): ExportProgram =>
  [
    ...createReactViteScaffoldContributions({
      projectName: 'demo',
      dependencies: [],
    }),
    {
      entryModuleId: entryModule.id,
      modules: [createAuthoredModule(desiredPath), entryModule],
    } satisfies ExportProgramContribution,
  ]
    .reduce(
      (builder, contribution) => builder.addContribution(contribution),
      createExportProgramBuilder(preset.target)
    )
    .build();

describe('export path ownership', () => {
  it('keeps the generated entry at the path the scaffold imports when an authored document wants it', () => {
    const bundle = new ProductionExportPlanner(preset).plan(
      createProgramWithAuthoredModule('src/App.tsx')
    );
    const entryFile = bundle.files.find((file) => file.path === 'src/App.tsx');
    const authoredFile = bundle.files.find(
      (file) => file.id === 'workspace-code:app'
    );

    expect(bundle.entryFilePath).toBe('src/App.tsx');
    expect(entryFile?.id).toBe('workspace-react-entry');
    expect(String(entryFile?.contents)).toContain('function App()');
    expect(authoredFile?.path).not.toBe('src/App.tsx');
    expect(
      bundle.files.find((file) => file.id === 'scaffold:src/main.tsx')?.path
    ).toBe('src/main.tsx');
  });

  it('blocks the export instead of silently rewiring the entry chain', () => {
    const bundle = new ProductionExportPlanner(preset).plan(
      createProgramWithAuthoredModule('src/App.tsx')
    );

    expect(bundle.metadata?.exportBlocked).toBe(true);
    expect(bundle.metadata?.blockingDiagnostics).toContainEqual(
      expect.objectContaining({
        code: EXPORT_RESERVED_PATH_CONFLICT_CODE,
        severity: 'error',
        source: 'export',
      })
    );
    expect(bundle.diagnostics).toContainEqual(
      expect.objectContaining({
        code: EXPORT_RESERVED_PATH_CONFLICT_CODE,
        message: expect.stringContaining('workspace-react-entry'),
      })
    );
  });

  it('protects scaffold-owned paths such as the bootstrap module', () => {
    const bundle = new ProductionExportPlanner(preset).plan(
      createProgramWithAuthoredModule('src/main.tsx')
    );
    const bootstrapFile = bundle.files.find(
      (file) => file.path === 'src/main.tsx'
    );

    expect(bootstrapFile?.id).toBe('scaffold:src/main.tsx');
    expect(String(bootstrapFile?.contents)).toContain(
      "import App from './App'"
    );
    expect(
      bundle.files.find((file) => file.id === 'workspace-code:app')?.path
    ).not.toBe('src/main.tsx');
    expect(bundle.metadata?.exportBlocked).toBe(true);
    expect(bundle.metadata?.blockingDiagnostics).toContainEqual(
      expect.objectContaining({
        code: EXPORT_RESERVED_PATH_CONFLICT_CODE,
      })
    );
  });

  it('leaves non-colliding authored documents untouched', () => {
    const bundle = new ProductionExportPlanner(preset).plan(
      createProgramWithAuthoredModule('src/features/Panel.tsx')
    );

    expect(bundle.entryFilePath).toBe('src/App.tsx');
    expect(
      bundle.files.find((file) => file.id === 'workspace-code:app')?.path
    ).toBe('src/features/Panel.tsx');
    expect(bundle.metadata?.exportBlocked).toBe(false);
    expect(
      bundle.diagnostics.filter(
        (diagnostic) => diagnostic.code === EXPORT_RESERVED_PATH_CONFLICT_CODE
      )
    ).toEqual([]);
  });
});
