import { createEmptyPirDocument } from '@prodivix/pir';
import {
  createExecutableProjectSnapshot,
  type ExecutableProjectFile,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { describe, expect, it } from 'vitest';
import { generateWorkspaceReactViteExecutableProject } from './workspaceExecutableProject';
import {
  COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
  createCompilerDiagnosticTestExtension,
} from './diagnosticTestExtensionReceipt';
import { executableProjectSnapshotInput } from './executableProjectSnapshotCanonical';
import {
  assertWorkspaceDiagnosticProjectionReceipt,
  issueWorkspaceDiagnosticProjectionReceipt,
  type IssueWorkspaceDiagnosticProjectionReceiptInput,
} from './workspaceDiagnosticProjectionReceipt';

const workspace = (): WorkspaceSnapshot => ({
  id: 'diagnostic-receipt-workspace',
  name: 'Diagnostic receipt workspace',
  workspaceRev: 3,
  routeRev: 2,
  opSeq: 7,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'page.pir.json',
      parentId: 'root',
      docId: 'page',
    },
  },
  docsById: {
    page: {
      id: 'page',
      type: 'pir-page',
      path: '/page.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'root-route', pageDocId: 'page' },
  },
});

const compiler = Object.freeze({
  presetId: 'react-vite' as const,
  options: Object.freeze({ projectName: 'Diagnostic Receipt Target' }),
});

const compile = (
  sourceWorkspace: WorkspaceSnapshot
): ExecutableProjectSnapshot => {
  const result = generateWorkspaceReactViteExecutableProject(
    sourceWorkspace,
    compiler.options
  );
  if (result.status === 'blocked') {
    throw new Error(
      `Diagnostic receipt test workspace is blocked: ${JSON.stringify(result.diagnostics)}`
    );
  }
  return result.snapshot;
};

const integrationFile = (
  sourceWorkspace: WorkspaceSnapshot,
  contents = [
    "import { describe, expect, it } from 'vitest';",
    "describe('diagnostic lineage', () => {",
    "  it('runs', () => expect(true).toBe(true));",
    '});',
    '',
  ].join('\n')
): ExecutableProjectFile =>
  Object.freeze({
    path: 'src/diagnostic-lineage.integration.test.ts',
    contents,
    sourceTrace: Object.freeze([
      Object.freeze({
        sourceRef: Object.freeze({
          kind: 'workspace' as const,
          workspaceId: sourceWorkspace.id,
        }),
        label: 'Diagnostic lineage integration owner',
      }),
    ]),
  });

const issued = (
  sourceWorkspace = workspace(),
  contents?: string
): Readonly<{
  input: IssueWorkspaceDiagnosticProjectionReceiptInput;
  receipt: ReturnType<typeof issueWorkspaceDiagnosticProjectionReceipt>;
  compilerBase: ExecutableProjectSnapshot;
}> => {
  const compilerBase = compile(sourceWorkspace);
  const extension = createCompilerDiagnosticTestExtension({
    snapshot: compilerBase,
    extensionOwner: COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
    extensionKind: 'integration-test',
    files: [integrationFile(sourceWorkspace, contents)],
    entrypoints: [
      {
        kind: 'test',
        path: 'src/diagnostic-lineage.integration.test.ts',
      },
    ],
  });
  const input = Object.freeze({
    workspace: sourceWorkspace,
    snapshot: extension.snapshot,
    compiler,
    testExtensionReceipts: Object.freeze([extension.receipt]),
  });
  return Object.freeze({
    input,
    receipt: issueWorkspaceDiagnosticProjectionReceipt(input),
    compilerBase,
  });
};

describe('Workspace diagnostic projection receipt', () => {
  it('binds actual Semantic/Compiler diagnostics and exact final SourceTrace without caller findings', () => {
    const result = issued();
    expect(result.receipt).toMatchObject({
      workspaceSnapshotDigest: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
      semanticIndexDigest: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
      compilerBaseSnapshotDigest: result.compilerBase.contentDigest,
      compilerProjectionDigest: result.input.snapshot.contentDigest,
      lineage: {
        testExtensionReceiptDigests: [
          result.input.testExtensionReceipts![0]!.receiptDigest,
        ],
        fixtureProjectionReceiptDigest: null,
      },
      trace: {
        traceKind: 'diagnostics',
        subjectDigest: result.input.snapshot.contentDigest,
      },
    });
    expect(
      result.receipt.trace.entries.find(
        ({ path }) => path === 'src/diagnostic-lineage.integration.test.ts'
      )?.sourceTrace
    ).toEqual(integrationFile(result.input.workspace).sourceTrace);
    expect(() =>
      assertWorkspaceDiagnosticProjectionReceipt(result.receipt, result.input)
    ).not.toThrow();
  });

  it('rejects Workspace, Compiler-owned source, arbitrary extension and missing receipt drift', () => {
    const result = issued();
    expect(() =>
      issueWorkspaceDiagnosticProjectionReceipt({
        ...result.input,
        workspace: {
          ...result.input.workspace,
          workspaceRev: result.input.workspace.workspaceRev + 1,
        },
      })
    ).toThrow(/lineage base/u);

    const baseFiles = result.compilerBase.files.map((file, index) =>
      index === 0
        ? {
            ...file,
            sourceTrace: [
              {
                sourceRef: {
                  kind: 'workspace' as const,
                  workspaceId: result.input.workspace.id,
                },
                label: 'Forged Compiler source',
              },
            ],
          }
        : file
    );
    const driftedBase = createExecutableProjectSnapshot(
      executableProjectSnapshotInput(result.compilerBase, baseFiles)
    );
    const driftedExtension = createCompilerDiagnosticTestExtension({
      snapshot: driftedBase,
      extensionOwner: COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
      extensionKind: 'integration-test',
      files: [integrationFile(result.input.workspace)],
      entrypoints: [
        {
          kind: 'test',
          path: 'src/diagnostic-lineage.integration.test.ts',
        },
      ],
    });
    expect(() =>
      issueWorkspaceDiagnosticProjectionReceipt({
        ...result.input,
        snapshot: driftedExtension.snapshot,
        testExtensionReceipts: [driftedExtension.receipt],
      })
    ).toThrow(/lineage base/u);

    const arbitrary = createExecutableProjectSnapshot(
      executableProjectSnapshotInput(result.input.snapshot, [
        ...result.input.snapshot.files,
        {
          path: 'src/unreceipted.ts',
          contents: 'export const escaped = true;\n',
          sourceTrace: integrationFile(result.input.workspace).sourceTrace,
        },
      ])
    );
    expect(() =>
      issueWorkspaceDiagnosticProjectionReceipt({
        ...result.input,
        snapshot: arbitrary,
      })
    ).toThrow();
    expect(() =>
      issueWorkspaceDiagnosticProjectionReceipt({
        ...result.input,
        testExtensionReceipts: [],
      })
    ).toThrow(/lineage base/u);
  });

  it('runs final manifest syntax/import/dependency diagnostics instead of accepting an empty claim', () => {
    const result = issued(
      workspace(),
      [
        "import missing from './does-not-exist';",
        "import undeclared from 'not-a-dependency';",
        'export const broken = ;',
      ].join('\n')
    );
    const codes = result.receipt.findings.flatMap(
      ({ diagnosticCodes }) => diagnosticCodes
    );
    expect(codes).toContain('WKS-DIAGNOSTIC-SOURCE-SYNTAX-INVALID');
    expect(codes).toContain('WKS-DIAGNOSTIC-IMPORT-UNRESOLVED');
    expect(codes).toContain('WKS-DIAGNOSTIC-DEPENDENCY-UNDECLARED');
  });

  it('rejects receipt mutation against the same exact owner inputs', () => {
    const result = issued();
    expect(() =>
      assertWorkspaceDiagnosticProjectionReceipt(
        {
          ...result.receipt,
          receiptDigest:
            'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
        result.input
      )
    ).toThrow(/does not match/u);
  });
});
