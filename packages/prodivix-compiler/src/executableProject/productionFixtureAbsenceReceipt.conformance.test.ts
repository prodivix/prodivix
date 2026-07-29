import { BEHAVIOR_DETERMINISTIC_CONTROL_PRESET } from '@prodivix/behavior';
import {
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
  EXECUTION_BUILD_BUNDLE_FORMAT,
  createExecutableProjectSnapshot,
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshot,
  type ExecutableProjectSnapshotInput,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import {
  COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
  COMPILER_DIAGNOSTIC_TEST_EXTENSION_RECEIPT_FORMAT,
  createCompilerDiagnosticTestExtension,
} from './diagnosticTestExtensionReceipt';
import {
  COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
  COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
  createCompilerFixtureProjectionSnapshot,
  issueCompilerFixtureProjectionReceipt,
} from './fixtureProjectionReceipt';
import {
  assertCompilerProductionFixtureAbsenceBuildBundle,
  assertCompilerProductionFixtureAbsenceReceipt,
  issueCompilerProductionFixtureAbsenceReceipt,
} from './productionFixtureAbsenceReceipt';
import {
  CompilerProductionFixtureAbsenceError,
  type IssueCompilerProductionFixtureAbsenceReceiptInput,
} from './productionFixtureAbsenceReceipt.types';
import {
  compilerBytes,
  digestCompilerBytes,
  digestCompilerValue,
} from './executableProjectSnapshotCanonical';
import { WORKSPACE_VERIFICATION_PROBE_CANARY } from '#src/workspace/workspaceVerificationProbeContract';

const TEST_PATH = 'src/catalog-auth.integration.test.ts';
const TEST_CANARY = 'compiler-production-fixture-absence-diagnostic-canary-v1';

const workspace = Object.freeze({
  workspaceId: 'production-fixture-absence-workspace',
  snapshotId: 'snapshot-production-fixture-absence',
  partitionRevisions: Object.freeze({ behavior: '9', workspace: '12' }),
});
const target = Object.freeze({
  presetId: 'react-vite',
  framework: 'react',
  runtime: 'vite',
});

const snapshotInput = (fixture: boolean): ExecutableProjectSnapshotInput => ({
  workspace,
  target,
  files: [
    {
      path: 'index.html',
      contents: '<main id="app"></main>',
    },
    {
      path: 'package.json',
      contents: '{"private":true,"scripts":{"build":"vite build"}}',
    },
    {
      path: 'src/main.ts',
      contents: 'document.querySelector("#app")!.textContent = "catalog";\n',
    },
    ...(fixture
      ? [
          {
            path: 'src/prodivix-server-runtime.ts',
            contents: [
              `export const endpoint = ${JSON.stringify(EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH)};`,
              `export const format = ${JSON.stringify(EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT)};`,
              `export const mediaType = ${JSON.stringify(EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE)};`,
              'export const load = () => fetch(endpoint);',
              '',
            ].join('\n'),
          },
        ]
      : []),
  ],
  dependencyPlan: { manifestFilePath: 'package.json' },
  entrypoints: [
    { kind: 'preview', path: 'index.html' },
    { kind: 'build', path: 'index.html' },
  ],
  capabilityRequirements: {
    preview: ['filesystem'],
    build: ['build', 'filesystem'],
    test: ['filesystem', 'test'],
  },
  ...(fixture
    ? {
        serverRuntimeMockProvision: {
          format: 'prodivix.server-runtime-test-provision.v1',
          fixtureSetId: 'catalog-auth-fixtures',
          principal: {
            providerId: 'catalog-session',
            principalId: 'fixture-catalog-owner',
          },
          permissions: [{ permissionId: 'catalog.read', allowed: true }],
          fixtures: [],
        },
      }
    : {}),
  installCommand: { command: 'pnpm', args: ['install'] },
  previewCommand: { command: 'pnpm', args: ['run', 'dev'] },
  buildCommand: { command: 'pnpm', args: ['run', 'build'] },
});

const buildFile = (path: string, contents: string) => {
  const bytes = compilerBytes(contents);
  return Object.freeze({
    path,
    size: bytes.byteLength,
    digest: digestCompilerBytes(bytes),
    contents: bytes,
  });
};

const buildBundle = (
  snapshot: ExecutableProjectSnapshot,
  files: readonly Readonly<{ path: string; contents: string }>[]
): ExecutionBuildBundle =>
  Object.freeze({
    format: EXECUTION_BUILD_BUNDLE_FORMAT,
    snapshotDigest: snapshot.contentDigest,
    target: snapshot.target,
    files: Object.freeze(
      files
        .map(({ path, contents }) => buildFile(path, contents))
        .sort((left, right) => (left.path < right.path ? -1 : 1))
    ),
  });

const fixtureSet = Object.freeze({
  id: 'catalog-auth-fixtures',
  name: 'Catalog auth fixtures',
  fixtures: Object.freeze([
    Object.freeze({
      id: 'fixture-catalog-owner-session',
      target: Object.freeze({
        kind: 'auth-session' as const,
        resourceId: 'catalog-session',
      }),
      inputDigest:
        'sha256-1111111111111111111111111111111111111111111111111111111111111111',
      outcome: Object.freeze({
        kind: 'result' as const,
        value: Object.freeze({
          principalId: 'fixture-catalog-owner',
          permissionIds: Object.freeze(['catalog.read']),
        }),
      }),
    }),
  ]),
});

const createInput = (): IssueCompilerProductionFixtureAbsenceReceiptInput => {
  const productionSnapshot = createExecutableProjectSnapshot(
    snapshotInput(false)
  );
  const fixtureBase = createExecutableProjectSnapshot(snapshotInput(true));
  const diagnostic = createCompilerDiagnosticTestExtension({
    snapshot: fixtureBase,
    extensionOwner: COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
    extensionKind: 'integration-test',
    files: Object.freeze([
      Object.freeze({
        path: TEST_PATH,
        contents: `import { it } from 'vitest';\nit(${JSON.stringify(TEST_CANARY)}, () => {});\n`,
        sourceTrace: Object.freeze([
          Object.freeze({
            sourceRef: Object.freeze({
              kind: 'workspace' as const,
              workspaceId: workspace.workspaceId,
            }),
            label: 'Production fixture-absence diagnostic canary',
          }),
        ]),
      }),
    ]),
    entrypoints: Object.freeze([
      Object.freeze({ kind: 'test' as const, path: TEST_PATH }),
    ]),
  });
  const fixtureSnapshot = createCompilerFixtureProjectionSnapshot({
    snapshot: diagnostic.snapshot,
    fixtureSets: Object.freeze([fixtureSet]),
    controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  });
  const projection = fixtureSnapshot.files.find(
    ({ path }) => path === COMPILER_FIXTURE_PROJECTION_SOURCE_PATH
  );
  if (!projection || typeof projection.contents !== 'string') {
    throw new Error('Fixture projection source was not generated.');
  }
  const fixtureBuildBundle = buildBundle(fixtureSnapshot, [
    {
      path: COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
      contents: projection.contents,
    },
    { path: 'index.html', contents: '<main>fixture test output</main>' },
  ]);
  const fixtureGeneratedFiles = projectExecutableProjectRuntimeFiles(
    fixtureSnapshot,
    'test'
  );
  const fixtureAuthorityBase = Object.freeze({
    snapshot: fixtureSnapshot,
    fixtureSets: Object.freeze([fixtureSet]),
    controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
    generatedFiles: fixtureGeneratedFiles,
    buildBundle: fixtureBuildBundle,
  });
  return Object.freeze({
    productionSnapshot,
    productionGeneratedFiles: projectExecutableProjectRuntimeFiles(
      productionSnapshot,
      'build'
    ),
    productionBuildBundle: buildBundle(productionSnapshot, [
      { path: 'assets/index.js', contents: 'document.body.dataset.ready="1";' },
      { path: 'index.html', contents: '<main>production catalog</main>' },
    ]),
    forbiddenFixtureAuthority: Object.freeze({
      ...fixtureAuthorityBase,
      receipt: issueCompilerFixtureProjectionReceipt(fixtureAuthorityBase),
      diagnosticTestExtension: Object.freeze({
        baseSnapshot: fixtureBase,
        extendedSnapshot: diagnostic.snapshot,
        receipt: diagnostic.receipt,
        canaryValues: Object.freeze([TEST_CANARY]),
      }),
    }),
  });
};

const withFile = (
  bundle: ExecutionBuildBundle,
  path: string,
  contents: string
): ExecutionBuildBundle =>
  Object.freeze({
    ...bundle,
    files: Object.freeze(
      [...bundle.files, buildFile(path, contents)].sort((left, right) =>
        left.path < right.path ? -1 : 1
      )
    ),
  });

describe('Compiler production fixture-absence receipt', () => {
  it('binds clean production snapshot, generated build files, and full Vite dist to exact forbidden authority markers', () => {
    const input = createInput();
    const receipt = issueCompilerProductionFixtureAbsenceReceipt(input);

    expect(receipt).toMatchObject({
      productionSnapshotDigest: input.productionSnapshot.contentDigest,
      target,
      forbiddenAuthority: {
        fixtureSnapshotDigest:
          input.forbiddenFixtureAuthority.snapshot.contentDigest,
        fixtureProjectionReceiptDigest:
          input.forbiddenFixtureAuthority.receipt.receiptDigest,
        diagnosticTestExtensionReceiptDigest:
          input.forbiddenFixtureAuthority.diagnosticTestExtension.receipt
            .receiptDigest,
        diagnosticTestEntrypoints: [TEST_PATH],
      },
      scans: {
        snapshotFiles: { status: 'clean', findingCount: 0 },
        generatedBuildFiles: { status: 'clean', findingCount: 0 },
        viteDistBundle: { status: 'clean', findingCount: 0 },
      },
    });
    expect(receipt.forbiddenMarkers.map(({ value }) => value)).toEqual(
      expect.arrayContaining([
        WORKSPACE_VERIFICATION_PROBE_CANARY,
        COMPILER_DIAGNOSTIC_TEST_EXTENSION_RECEIPT_FORMAT,
        TEST_PATH,
        TEST_CANARY,
        EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
        EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
        EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
      ])
    );
    expect(receipt.receiptDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(() =>
      assertCompilerProductionFixtureAbsenceBuildBundle(
        receipt,
        input.productionBuildBundle
      )
    ).not.toThrow();
    expect(() =>
      assertCompilerProductionFixtureAbsenceReceipt(receipt, input)
    ).not.toThrow();
  });

  it.each([
    ['verification probe', WORKSPACE_VERIFICATION_PROBE_CANARY],
    [
      'diagnostic extension receipt',
      COMPILER_DIAGNOSTIC_TEST_EXTENSION_RECEIPT_FORMAT,
    ],
    ['diagnostic test entrypoint', TEST_PATH],
    ['diagnostic canary', TEST_CANARY],
    ['auth endpoint', EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH],
    ['auth response format', EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT],
    [
      'auth response media type',
      EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
    ],
    ['fixture projection path', COMPILER_FIXTURE_PROJECTION_BUILD_PATH],
  ])('rejects a %s leak in actual Vite dist bytes', (_label, marker) => {
    const input = createInput();
    const drifted = withFile(
      input.productionBuildBundle,
      'zz-forbidden-leak.js',
      `globalThis.__leak = ${JSON.stringify(marker)};`
    );
    expect(() =>
      issueCompilerProductionFixtureAbsenceReceipt({
        ...input,
        productionBuildBundle: drifted,
      })
    ).toThrowError(
      expect.objectContaining({
        code: 'VER-COMPILER-PRODUCTION-FIXTURE-LEAK',
        findings: expect.arrayContaining([
          expect.objectContaining({
            scope: 'vite-dist-bundle',
            path: 'zz-forbidden-leak.js',
            surface: 'contents',
          }),
        ]),
      })
    );
  });

  it('rejects clean-byte bundle drift and a fully rehashed receipt with a removed required marker', () => {
    const input = createInput();
    const receipt = issueCompilerProductionFixtureAbsenceReceipt(input);
    const cleanDrift = withFile(
      input.productionBuildBundle,
      'zz-clean.js',
      'export const clean = true;'
    );
    expect(() =>
      assertCompilerProductionFixtureAbsenceBuildBundle(receipt, cleanDrift)
    ).toThrow(CompilerProductionFixtureAbsenceError);

    const forbiddenMarkers = receipt.forbiddenMarkers.filter(
      ({ value }) => value !== EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH
    );
    const forbiddenAuthority = {
      ...receipt.forbiddenAuthority,
      markerSetDigest: digestCompilerValue(forbiddenMarkers),
    };
    const { receiptDigest: _receiptDigest, ...base } = receipt;
    const forgedBase = {
      ...base,
      forbiddenAuthority,
      forbiddenMarkers,
    };
    const forged = {
      ...forgedBase,
      receiptDigest: digestCompilerValue(forgedBase),
    };
    expect(() =>
      assertCompilerProductionFixtureAbsenceBuildBundle(
        forged,
        input.productionBuildBundle
      )
    ).toThrow(/required marker set/u);
  });

  it('rejects diagnostic canaries and generated production files that are not rooted in their exact owners', () => {
    const input = createInput();
    expect(() =>
      issueCompilerProductionFixtureAbsenceReceipt({
        ...input,
        forbiddenFixtureAuthority: {
          ...input.forbiddenFixtureAuthority,
          diagnosticTestExtension: {
            ...input.forbiddenFixtureAuthority.diagnosticTestExtension,
            canaryValues: ['not-present-in-the-diagnostic-source'],
          },
        },
      })
    ).toThrow(/forbidden fixture authority/iu);
    expect(() =>
      issueCompilerProductionFixtureAbsenceReceipt({
        ...input,
        productionGeneratedFiles: input.productionGeneratedFiles.slice(1),
      })
    ).toThrow(/generated build file set/u);
  });

  it.each([
    ['absolute path', 'C:\\Users\\operator\\fixture-canary'],
    ['UNC path', '\\\\host\\share\\fixture-canary'],
    ['URL', 'https://fixture.example.test/canary'],
    ['control character', 'public-canary\u0000value'],
    ['secret-like text', 'bearer-token-value'],
  ])(
    'rejects a %s diagnostic canary before stable receipt projection',
    (_label, canary) => {
      const input = createInput();
      expect(() =>
        issueCompilerProductionFixtureAbsenceReceipt({
          ...input,
          forbiddenFixtureAuthority: {
            ...input.forbiddenFixtureAuthority,
            diagnosticTestExtension: {
              ...input.forbiddenFixtureAuthority.diagnosticTestExtension,
              canaryValues: [canary],
            },
          },
        })
      ).toThrow(/forbidden fixture authority/iu);
    }
  );
});
