import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  digestBehaviorFixtureSet,
  type BehaviorControlProfile,
  type BehaviorFixtureSet,
} from '@prodivix/behavior';
import {
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
  createExecutableProjectSnapshot,
  EXECUTION_BUILD_BUNDLE_FORMAT,
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectFile,
  type ExecutableProjectSnapshot,
  type ExecutableProjectSnapshotInput,
  type ExecutionBuildBundle,
  type ExecutionBuildBundleFile,
} from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import {
  COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
  COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
  assertCompilerFixtureProjectionBuildFile,
  assertCompilerFixtureProjectionReceipt,
  createCompilerFixtureProjectionSnapshot,
  issueCompilerFixtureProjectionReceipt,
} from './fixtureProjectionReceipt';

const digest = (contents: Uint8Array): string =>
  `sha256-${bytesToHex(sha256(contents))}`;

const buildFile = (
  path: string,
  contents: string
): ExecutionBuildBundleFile => {
  const bytes = utf8ToBytes(contents);
  return Object.freeze({
    path,
    size: bytes.byteLength,
    digest: digest(bytes),
    contents: bytes,
  });
};

const baseInput = (): ExecutableProjectSnapshotInput => ({
  workspace: {
    workspaceId: 'fixture-receipt-workspace',
    snapshotId: 'fixture-receipt-snapshot',
    partitionRevisions: { behavior: '7', workspace: '4' },
  },
  target: {
    presetId: 'react-vite',
    framework: 'react',
    runtime: 'vite',
  },
  files: [
    {
      path: 'package.json',
      contents: '{"private":true,"scripts":{"build":"vite build"}}',
    },
    { path: 'src/main.ts', contents: 'export const receiptFixture = true;\n' },
    {
      path: 'src/prodivix-server-runtime.ts',
      contents: [
        `export const endpoint = ${JSON.stringify(EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH)};`,
        `export const format = ${JSON.stringify(EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT)};`,
        `export const mediaType = ${JSON.stringify(EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE)};`,
        'export const load = async () => fetch(endpoint);',
        '',
      ].join('\n'),
    },
  ],
  dependencyPlan: { manifestFilePath: 'package.json' },
  entrypoints: [{ kind: 'preview', path: 'src/main.ts' }],
  capabilityRequirements: {
    preview: ['filesystem'],
    build: ['build', 'filesystem'],
    test: ['filesystem', 'test'],
  },
  serverRuntimeMockProvision: {
    format: 'prodivix.server-runtime-test-provision.v1',
    fixtureSetId: 'server-auth-fixtures',
    principal: {
      providerId: 'prodivix-product-session',
      principalId: 'catalog-owner',
    },
    permissions: [
      { permissionId: 'catalog.write', allowed: true },
      { permissionId: 'workspace.owner', allowed: true },
    ],
    fixtures: [],
  },
  installCommand: { command: 'pnpm', args: ['install'] },
  previewCommand: { command: 'pnpm', args: ['run', 'dev'] },
  buildCommand: { command: 'pnpm', args: ['run', 'build'] },
});

const fixtureSet = (): BehaviorFixtureSet => ({
  id: 'behavior-runtime-fixtures',
  name: 'Behavior runtime fixtures',
  fixtures: [
    {
      id: 'catalog-owner-session',
      target: {
        kind: 'auth-session',
        resourceId: 'prodivix-product-session',
      },
      inputDigest:
        'sha256-745bde61318aef5b462b198c234b2b9111e1892929418b48a1f12e943fa49733',
      outcome: {
        kind: 'result',
        value: {
          principalId: 'catalog-owner',
          permissionIds: ['catalog.write', 'workspace.owner'],
        },
      },
    },
    {
      id: 'local-preferences',
      target: { kind: 'storage', resourceId: 'catalog-preferences' },
      inputDigest:
        'sha256-09b3a8407f6bc233803a79eef3c435cbc36ec80eb1c3082225c5862da4a45364',
      outcome: { kind: 'result', value: { colorScheme: 'dark' } },
    },
  ],
});

const controlProfile = (
  bootstrapFixtureIds: readonly string[] = ['local-preferences']
): BehaviorControlProfile => ({
  ...BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  storage: {
    ...BEHAVIOR_DETERMINISTIC_CONTROL_PRESET.storage,
    bootstrapFixtureIds,
  },
});

const snapshotInputFrom = (
  snapshot: ExecutableProjectSnapshot,
  overrides: Partial<ExecutableProjectSnapshotInput> = {}
): ExecutableProjectSnapshotInput => ({
  workspace: snapshot.workspace,
  target: snapshot.target,
  files: snapshot.files,
  dependencyPlan: {
    manifestFilePath: snapshot.dependencyPlan.manifestFilePath,
    ...(snapshot.dependencyPlan.lockFilePath === undefined
      ? {}
      : { lockFilePath: snapshot.dependencyPlan.lockFilePath }),
  },
  entrypoints: snapshot.entrypoints,
  capabilityRequirements: snapshot.capabilityRequirements,
  publicBuildConfiguration: snapshot.publicBuildConfiguration,
  resourceHints: snapshot.resourceHints,
  cacheHints: snapshot.cacheHints,
  ...(snapshot.dataMockProvision === undefined
    ? {}
    : { dataMockProvision: snapshot.dataMockProvision }),
  ...(snapshot.serverRuntimeMockProvision === undefined
    ? {}
    : { serverRuntimeMockProvision: snapshot.serverRuntimeMockProvision }),
  ...(snapshot.serverFunctionPlan === undefined
    ? {}
    : { serverFunctionPlan: snapshot.serverFunctionPlan }),
  installCommand: snapshot.installCommand,
  previewCommand: snapshot.previewCommand,
  buildCommand: snapshot.buildCommand,
  previewPlan: snapshot.previewPlan,
  buildPlan: snapshot.buildPlan,
  testPlan: snapshot.testPlan,
  ...overrides,
});

const bundleFor = (
  snapshot: ExecutableProjectSnapshot,
  projectionContents?: string
): ExecutionBuildBundle => {
  const source = snapshot.files.find(
    ({ path }) => path === COMPILER_FIXTURE_PROJECTION_SOURCE_PATH
  );
  if (!source || typeof source.contents !== 'string') {
    throw new Error('Test snapshot is missing the projection source file.');
  }
  return Object.freeze({
    format: EXECUTION_BUILD_BUNDLE_FORMAT,
    snapshotDigest: snapshot.contentDigest,
    target: snapshot.target,
    files: Object.freeze([
      buildFile(
        COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
        projectionContents ?? source.contents
      ),
      buildFile('index.html', '<main>fixture receipt</main>'),
    ]),
  });
};

const issuedFixture = () => {
  const fixtures = fixtureSet();
  const profile = controlProfile();
  const snapshot = createCompilerFixtureProjectionSnapshot({
    snapshot: createExecutableProjectSnapshot(baseInput()),
    fixtureSets: [fixtures],
    controlProfile: profile,
  });
  const generatedFiles = projectExecutableProjectRuntimeFiles(snapshot, 'test');
  const buildBundle = bundleFor(snapshot);
  const input = {
    snapshot,
    fixtureSets: [fixtures],
    controlProfile: profile,
    generatedFiles,
    buildBundle,
  } as const;
  return {
    ...input,
    receipt: issueCompilerFixtureProjectionReceipt(input),
  };
};

describe('Compiler fixture projection receipt', () => {
  it('binds canonical fixture dispatch semantics to server provision, generated bytes, snapshot and bundle', () => {
    const issued = issuedFixture();
    const auth = issued.receipt.fixtureBindings.find(
      ({ fixtureId }) => fixtureId === 'catalog-owner-session'
    );

    expect(issued.receipt).toMatchObject({
      snapshotDigest: issued.snapshot.contentDigest,
      fixtureSets: [
        {
          id: 'behavior-runtime-fixtures',
          digest: digestBehaviorFixtureSet(issued.fixtureSets[0]),
        },
      ],
      authSessionTransport: {
        method: 'GET',
        endpointPath: EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
        responseFormat: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
        responseMediaType: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
        fixtureId: 'catalog-owner-session',
        providerId: 'prodivix-product-session',
        principalId: 'catalog-owner',
        permissionIds: ['catalog.write', 'workspace.owner'],
        generatedClientFile: {
          path: 'src/prodivix-server-runtime.ts',
        },
      },
      network: {
        mode: 'fixture-only',
        undeclaredRequest: 'reject',
        fixtureIds: ['catalog-owner-session', 'local-preferences'],
      },
      storage: { bootstrapFixtureIds: ['local-preferences'] },
      projectionFile: {
        sourcePath: COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
        buildPath: COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
      },
    });
    expect(auth).toMatchObject({
      fixtureSetId: 'behavior-runtime-fixtures',
      fixtureId: 'catalog-owner-session',
      targetKind: 'auth-session',
      resourceId: 'prodivix-product-session',
      inputDigest:
        'sha256-745bde61318aef5b462b198c234b2b9111e1892929418b48a1f12e943fa49733',
      serverRuntimeProjection: {
        providerId: 'prodivix-product-session',
        outcome: {
          kind: 'result',
          value: {
            principalId: 'catalog-owner',
            permissionIds: ['catalog.write', 'workspace.owner'],
          },
        },
      },
    });
    expect(auth?.projectionDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);
    expect(issued.receipt.serverRuntime?.generatedProvisionFile.path).toBe(
      'src/.prodivix/server-runtime-test-provision.ts'
    );
    expect(issued.receipt.generatedFiles.files).toHaveLength(
      issued.generatedFiles.length
    );

    expect(() =>
      assertCompilerFixtureProjectionReceipt(issued.receipt, issued)
    ).not.toThrow();
    expect(() =>
      assertCompilerFixtureProjectionBuildFile(
        issued.receipt,
        issued.buildBundle.files[0]!
      )
    ).not.toThrow();
  });

  it.each([
    {
      label: 'provider resource',
      mutate: (set: BehaviorFixtureSet): BehaviorFixtureSet => ({
        ...set,
        fixtures: set.fixtures.map((fixture) =>
          fixture.id === 'catalog-owner-session'
            ? {
                ...fixture,
                target: { ...fixture.target, resourceId: 'other-provider' },
              }
            : fixture
        ),
      }),
    },
    {
      label: 'principal',
      mutate: (set: BehaviorFixtureSet): BehaviorFixtureSet => ({
        ...set,
        fixtures: set.fixtures.map((fixture) =>
          fixture.id === 'catalog-owner-session'
            ? {
                ...fixture,
                outcome: {
                  kind: 'result',
                  value: {
                    principalId: 'other-principal',
                    permissionIds: ['catalog.write', 'workspace.owner'],
                  },
                },
              }
            : fixture
        ),
      }),
    },
    {
      label: 'permissions',
      mutate: (set: BehaviorFixtureSet): BehaviorFixtureSet => ({
        ...set,
        fixtures: set.fixtures.map((fixture) =>
          fixture.id === 'catalog-owner-session'
            ? {
                ...fixture,
                outcome: {
                  kind: 'result',
                  value: {
                    principalId: 'catalog-owner',
                    permissionIds: ['workspace.owner'],
                  },
                },
              }
            : fixture
        ),
      }),
    },
  ])(
    'rejects auth-session $label drift before snapshot projection',
    ({ mutate }) => {
      expect(() =>
        createCompilerFixtureProjectionSnapshot({
          snapshot: createExecutableProjectSnapshot(baseInput()),
          fixtureSets: [mutate(fixtureSet())],
          controlProfile: controlProfile(),
        })
      ).toThrow(/Auth-session fixture/u);
    }
  );

  it('rejects fixture and storage projection drift against an existing Compiler file', () => {
    const issued = issuedFixture();
    const inputDrift: BehaviorFixtureSet = {
      ...issued.fixtureSets[0],
      fixtures: issued.fixtureSets[0].fixtures.map((fixture) =>
        fixture.id === 'local-preferences'
          ? {
              ...fixture,
              inputDigest:
                'sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            }
          : fixture
      ),
    };
    expect(() =>
      issueCompilerFixtureProjectionReceipt({
        ...issued,
        fixtureSets: [inputDrift],
      })
    ).toThrow(/projection file/u);
    expect(() =>
      createCompilerFixtureProjectionSnapshot({
        snapshot: createExecutableProjectSnapshot(baseInput()),
        fixtureSets: [fixtureSet()],
        controlProfile: controlProfile(['missing-storage-fixture']),
      })
    ).toThrow(/Storage bootstrap fixture/u);
  });

  it('rejects forged and semantically drifted executable snapshots', () => {
    const issued = issuedFixture();
    expect(() =>
      issueCompilerFixtureProjectionReceipt({
        ...issued,
        snapshot: {
          ...issued.snapshot,
          contentDigest:
            'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      })
    ).toThrow(/content digest/u);

    const driftedProvisionSnapshot = createExecutableProjectSnapshot(
      snapshotInputFrom(issued.snapshot, {
        serverRuntimeMockProvision: {
          format: 'prodivix.server-runtime-test-provision.v1',
          fixtureSetId: 'server-auth-fixtures',
          principal: {
            providerId: 'prodivix-product-session',
            principalId: 'catalog-owner',
          },
          permissions: [
            { permissionId: 'catalog.write', allowed: true },
            { permissionId: 'workspace.owner', allowed: false, code: 'DENIED' },
          ],
          fixtures: [],
        },
      })
    );
    expect(() =>
      issueCompilerFixtureProjectionReceipt({
        ...issued,
        snapshot: driftedProvisionSnapshot,
        generatedFiles: projectExecutableProjectRuntimeFiles(
          driftedProvisionSnapshot,
          'test'
        ),
        buildBundle: bundleFor(driftedProvisionSnapshot),
      })
    ).toThrow(/allowed permissions/u);
  });

  it('rejects generated server provision bytes and build projection bytes drift', () => {
    const issued = issuedFixture();
    const generatedFiles: ExecutableProjectFile[] = issued.generatedFiles.map(
      (file) =>
        file.path === 'src/.prodivix/server-runtime-test-provision.ts'
          ? { ...file, contents: `${String(file.contents)}// drift\n` }
          : file
    );
    expect(() =>
      issueCompilerFixtureProjectionReceipt({
        ...issued,
        generatedFiles,
      })
    ).toThrow(/Generated fixture projection file drifted/u);

    expect(() =>
      issueCompilerFixtureProjectionReceipt({
        ...issued,
        buildBundle: bundleFor(issued.snapshot, '{"drifted":true}\n'),
      })
    ).toThrow(/exact Compiler projection bytes/u);
    expect(() =>
      issueCompilerFixtureProjectionReceipt({
        ...issued,
        buildBundle: {
          ...issued.buildBundle,
          snapshotDigest:
            'sha256-cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        },
      })
    ).toThrow(/does not match the executable snapshot/u);
  });

  it('rejects receipt and individual build-file drift', () => {
    const issued = issuedFixture();
    const driftedReceipt = {
      ...issued.receipt,
      fixtureBindings: issued.receipt.fixtureBindings.map((binding) =>
        binding.fixtureId === 'catalog-owner-session'
          ? { ...binding, resourceId: 'forged-provider' }
          : binding
      ),
    };
    expect(() =>
      assertCompilerFixtureProjectionReceipt(driftedReceipt, issued)
    ).toThrow(/does not match its canonical inputs/u);

    const projectionBuildFile = issued.buildBundle.files[0]!;
    const driftedBuildFile = buildFile(
      projectionBuildFile.path,
      `${new TextDecoder().decode(projectionBuildFile.contents)}drift`
    );
    expect(() =>
      assertCompilerFixtureProjectionBuildFile(issued.receipt, driftedBuildFile)
    ).toThrow(/does not match/u);
  });
});
