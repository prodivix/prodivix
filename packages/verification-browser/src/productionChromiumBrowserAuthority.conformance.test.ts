import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
  digestBehaviorControlProfile,
  digestBehaviorValue,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import {
  createDeterministicRuntimeProvider,
  createExecutableProjectSnapshot,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import type { Route } from 'playwright-core';
import {
  digestVerificationValue,
  type VerificationAbortSignal,
  type VerificationPlanCell,
} from '@prodivix/verification';
import { afterEach, describe, expect, it } from 'vitest';
import { digestBrowserVerificationBytes } from './browserVerificationCellInput';
import { FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION } from './browserVerificationAdapterDescriptor';
import { observePlaywrightBrowserImageAuthority } from './internal/playwrightBrowserImageAuthority';
import { PlaywrightBrowserPool } from './internal/playwrightBrowserPool';
import { PlaywrightDeterministicResourceRouter } from './internal/playwrightDeterministicResourceRouter';
import { createProductionBrowserCanaryScanner } from './productionBrowserCanaryScanner';
import { createProductionBrowserLoopbackPreviewHost } from './productionBrowserLoopbackPreviewHost';
import { createProductionChromiumBrowserAuthority } from './productionChromiumBrowserAuthority';
import type {
  ProductionBrowserCanaryScannerPort,
  ProductionBrowserPreviewHostPort,
  ProductionBrowserPreviewHostReleaseResult,
  ProductionBrowserPreviewResource,
  ProductionBrowserRemoteExecutionEvidence,
  ProductionChromiumRuntimeAuthorityInput,
} from './productionChromiumBrowserAuthority.types';
import {
  createProductionBrowserBuildBundleDigest,
  createProductionBrowserCanaryScanReceipt,
  createProductionBrowserExecutableSnapshotReceipt,
  createProductionBrowserRemoteExecutionEvidence,
  scanProductionBrowserInputs,
} from './productionChromiumBrowserAuthorityResources';

const signal: VerificationAbortSignal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});
const scannerAuthorityDigest = digestVerificationValue('scanner-authority');
const previewAuthorityDigest = digestVerificationValue('preview-authority');
const runtimeImplementationDigest = digestVerificationValue('runtime-provider');

const temporaryPaths: string[] = [];
const openServers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    openServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          if (!server.listening) resolve();
          else server.close(() => resolve());
        })
    )
  );
  await Promise.all(
    temporaryPaths
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

const buildFile = (path: string, contents: string) => {
  const value = bytes(contents);
  return Object.freeze({
    path,
    size: value.byteLength,
    digest: digestBrowserVerificationBytes(value),
    contents: value,
  });
};

const createFixture = () => {
  const snapshot = createExecutableProjectSnapshot({
    workspace: Object.freeze({
      workspaceId: 'workspace-production-browser',
      snapshotId: 'snapshot-production-browser',
      partitionRevisions: Object.freeze({ workspace: '1' }),
    }),
    target: Object.freeze({
      presetId: 'react-vite',
      framework: 'react',
      runtime: 'vite',
    }),
    files: Object.freeze([
      Object.freeze({
        path: 'package.json',
        contents: '{"private":true}',
      }),
      Object.freeze({
        path: 'src/main.tsx',
        contents: 'export const mounted = true;',
      }),
    ]),
    dependencyPlan: Object.freeze({ manifestFilePath: 'package.json' }),
    entrypoints: Object.freeze([
      Object.freeze({ kind: 'preview' as const, path: 'src/main.tsx' }),
    ]),
    capabilityRequirements: Object.freeze({
      preview: Object.freeze(['filesystem'] as const),
      build: Object.freeze(['filesystem', 'build'] as const),
      test: Object.freeze([]),
      production: Object.freeze([]),
    }),
    publicBuildConfiguration: Object.freeze([]),
    cacheHints: Object.freeze({ dependencyInstall: 'isolated' as const }),
    installCommand: Object.freeze({ command: 'pnpm', args: ['install'] }),
    previewCommand: Object.freeze({ command: 'pnpm', args: ['preview'] }),
    buildCommand: Object.freeze({ command: 'pnpm', args: ['build'] }),
    previewPlan: Object.freeze({
      mode: 'static-bundle' as const,
      command: Object.freeze({ command: 'pnpm', args: ['preview'] }),
      outputDirectoryPath: 'dist',
      entryFilePath: 'index.html',
    }),
  });
  const buildBundle: ExecutionBuildBundle = Object.freeze({
    format: 'prodivix.execution-build-bundle.v1',
    snapshotDigest: snapshot.contentDigest,
    target: snapshot.target,
    files: Object.freeze([
      buildFile('assets/app.js', 'globalThis.__production = true;'),
      buildFile(
        'index.html',
        '<!doctype html><script src="/assets/app.js"></script>'
      ),
    ]),
  });
  const controlProfileDigest = digestBehaviorControlProfile(
    BEHAVIOR_DETERMINISTIC_CONTROL_PRESET
  );
  const programBase = Object.freeze({
    scenarioId: 'scenario:production-browser',
    scenarioDigest: digestVerificationValue('scenario'),
    workspaceRevision: 1,
    semanticSnapshotDigest: digestVerificationValue('semantic'),
    executableSnapshotDigest: snapshot.contentDigest,
    compilerDigest: digestVerificationValue('compiler'),
    registryDigest: digestVerificationValue('registry'),
    controlProfileDigest,
    fixtureSetDigests: Object.freeze([]),
    baselineSetDigests: Object.freeze([]),
    requiredCapabilities: Object.freeze([]),
    capabilityManifest: Object.freeze([]),
    targetManifest: Object.freeze([]),
    instructions: Object.freeze([]),
    observations: Object.freeze([]),
    sourceTrace: Object.freeze([]),
    budgets: Object.freeze({
      totalMs: 30_000,
      stepMs: 5_000,
      settleMs: 2_000,
    }),
  });
  const program: BehaviorScenarioProgram = Object.freeze({
    ...programBase,
    programDigest: digestBehaviorValue(programBase),
  });
  const cell: VerificationPlanCell = Object.freeze({
    id: 'cell:production-browser',
    checkId: 'check:production-browser',
    checkKind: 'e2e',
    scenarioId: program.scenarioId,
    targetId: 'target:production-browser',
    targetPolicy: Object.freeze({
      authority: 'verification-policy',
      policyDigest: digestVerificationValue('policy'),
      semanticTargetId: 'target:production-browser',
      capture: 'allowed',
    }),
    frameworkTarget: 'react-vite',
    surface: 'preview',
    browserEngine: 'chromium',
    viewport: Object.freeze({ id: 'desktop', width: 1280, height: 720 }),
    colorScheme: 'light',
    motion: 'reduced',
    locale: 'en-US',
    controlProfileRef: Object.freeze({
      kind: 'preset',
      presetId: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET.id,
      digest: controlProfileDigest,
    }),
    adapter: FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.identity,
    requirement: 'required',
    policyRuleIds: Object.freeze(['rule:production-browser']),
    appliedExemptionIds: Object.freeze([]),
    retryPolicy: Object.freeze({
      id: 'retry:none',
      maximumAttempts: 1,
      retryableOutcomes: Object.freeze([]),
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    }),
    evidenceRequirements: Object.freeze({
      acceptedTrust: Object.freeze(['remote-attested'] as const),
      maximumAgeMs: 60_000,
      requireAttestation: true,
      requireCompatibleIdentity: true,
      requiredArtifactKinds: Object.freeze([
        'console-summary',
        'network-summary',
        'replay-record',
        'trace',
      ] as const),
    }),
    resources: Object.freeze([]),
    inputKinds: Object.freeze([
      'executable-snapshot',
      'scenario-program',
    ] as const),
    artifactKinds: Object.freeze([
      'console-summary',
      'network-summary',
      'replay-record',
      'trace',
    ] as const),
    estimatedCost: Object.freeze({
      durationMs: 30_000,
      artifactBytes: 4 * 1024 * 1024,
      computeUnits: 1,
    }),
    preflight: Object.freeze({ status: 'supported' as const }),
    dependencyCellIds: Object.freeze([]),
    inputDigest: digestVerificationValue('production-browser-cell-input'),
  });
  return { snapshot, buildBundle, program, cell };
};

const listen = (server: Server): Promise<string> =>
  new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Test preview server did not bind TCP.'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

const remoteEvidence = (input: {
  origin: string;
  attemptId: string;
  generation: number;
  snapshotDigest: string;
  buildBundle: ExecutionBuildBundle;
}): ProductionBrowserRemoteExecutionEvidence => {
  const entry = input.buildBundle.files.find(
    ({ path }) => path === 'index.html'
  )!;
  const identity = Object.freeze({
    attemptId: input.attemptId,
    generation: input.generation,
    requestId: 'request:production-browser',
    executionId: 'execution:production-browser',
    snapshotDigest: input.snapshotDigest,
    materializedBundleDigest: createProductionBrowserBuildBundleDigest(
      input.buildBundle
    ),
    materializedOrigin: input.origin,
    materializedEntryUrl: `${input.origin}/index.html`,
    materializedEntryFilePath: 'index.html',
    materializedEntryDigest: entry.digest,
    materializedFileCount: input.buildBundle.files.length,
  });
  return createProductionBrowserRemoteExecutionEvidence(identity);
};

const createPreviewHost = async (input: {
  attemptId: string;
  generation: number;
  snapshotDigest: string;
  buildBundle: ExecutionBuildBundle;
  oversize?: boolean;
  retireResult?: ProductionBrowserPreviewHostReleaseResult;
}): Promise<
  Readonly<{
    port: ProductionBrowserPreviewHostPort;
    evidence: ProductionBrowserRemoteExecutionEvidence;
  }>
> => {
  let resources = new Map<string, Uint8Array>();
  const server = createServer((request, response) => {
    const source = resources.get(request.url ?? '');
    if (!source) {
      response.statusCode = 404;
      response.end();
      return;
    }
    const body = input.oversize ? new Uint8Array([...source, 0x78]) : source;
    response.setHeader('content-length', String(body.byteLength));
    response.statusCode = 200;
    response.end(body);
  });
  openServers.push(server);
  const origin = await listen(server);
  const evidence = remoteEvidence({
    origin,
    attemptId: input.attemptId,
    generation: input.generation,
    snapshotDigest: input.snapshotDigest,
    buildBundle: input.buildBundle,
  });
  return Object.freeze({
    evidence,
    port: Object.freeze({
      authorityDigest: previewAuthorityDigest,
      async materialize(
        request: Parameters<ProductionBrowserPreviewHostPort['materialize']>[0]
      ) {
        resources = new Map(
          request.resources.map(
            (resource: ProductionBrowserPreviewResource) => [
              resource.path,
              resource.contents,
            ]
          )
        );
        let retired = false;
        return Object.freeze({
          leaseId: 'preview:production-browser',
          origin,
          servingMode: 'route-verified-content-addressed' as const,
          remoteExecution: evidence,
          retire: async () => {
            if (!retired && server.listening) {
              retired = true;
              await new Promise<void>((resolve) =>
                server.close(() => resolve())
              );
            }
            return (
              input.retireResult ??
              Object.freeze({
                status: 'clean' as const,
                residualCanaryIds: Object.freeze([]),
                diagnosticCodes: Object.freeze([]),
              })
            );
          },
        });
      },
    }),
  });
};

const createRuntimeAuthorityInput =
  async (): Promise<ProductionChromiumRuntimeAuthorityInput> => {
    const root = await mkdtemp(join(tmpdir(), 'prodivix-browser-authority-'));
    temporaryPaths.push(root);
    const executablePath = join(root, 'chromium-fake.exe');
    await writeFile(executablePath, 'pinned chromium image', 'utf8');
    const browserImageAuthority = await observePlaywrightBrowserImageAuthority({
      engine: 'chromium',
      executablePath,
    });
    return Object.freeze({
      executablePath,
      machineClass: 'evaluation-runner',
      operatingSystemImageDigest: digestVerificationValue('runner-os'),
      browserVersion: 'production-browser-test',
      fontSetDigest: digestVerificationValue('font-set'),
      devicePixelRatio: 1,
      cacheClass: 'cold',
      rendererGeneration: 'renderer:production',
      normalizer: Object.freeze({ id: 'pdx-rgba', version: '1' }),
      browserImageAuthority,
    });
  };

const createAuthority = async (input: {
  previewHost: ProductionBrowserPreviewHostPort;
  canaryScanner?: ProductionBrowserCanaryScannerPort;
}) =>
  createProductionChromiumBrowserAuthority({
    runtimeAuthority: await createRuntimeAuthorityInput(),
    previewHost: input.previewHost,
    runtimeProvider: Object.freeze({
      providerId: 'prodivix.remote.production-browser-test',
      providerVersion: '1',
      implementationDigest: runtimeImplementationDigest,
      create: (hooks) =>
        createDeterministicRuntimeProvider({
          id: 'prodivix.remote.production-browser-test',
          version: '1',
          surface: 'remote',
          implementationDigest: runtimeImplementationDigest,
          hooks,
        }),
    }),
    canaryScanner:
      input.canaryScanner ??
      Object.freeze({
        authorityDigest: scannerAuthorityDigest,
        scan: async ({ contents }) =>
          createProductionBrowserCanaryScanReceipt({
            contents,
            scannerAuthorityDigest,
          }),
      }),
    resourceVerificationTimeoutMs: 1_000,
  });

describe('production Chromium browser authority', () => {
  it('fails closed when a required production owner is not injected', async () => {
    await expect(
      createProductionChromiumBrowserAuthority(
        {} as Parameters<typeof createProductionChromiumBrowserAuthority>[0]
      )
    ).rejects.toThrow(
      /requires explicit runtime-authority, preview-host, remote-runtime-provider, and canary-scanner owners/u
    );
  });

  it('rejects an aggregate canary-scan budget overflow before invoking the scanner', async () => {
    const fixture = createFixture();
    let scanCalls = 0;
    const oversizedSnapshot = {
      ...fixture.snapshot,
      files: Object.freeze([
        Object.freeze({
          ...fixture.snapshot.files[0]!,
          contents: Object.freeze({ byteLength: 513 * 1024 * 1024 }),
        }),
      ]),
    } as unknown as typeof fixture.snapshot;
    await expect(
      scanProductionBrowserInputs({
        scanner: Object.freeze({
          authorityDigest: scannerAuthorityDigest,
          scan: async ({ contents }) => {
            scanCalls += 1;
            return createProductionBrowserCanaryScanReceipt({
              contents,
              scannerAuthorityDigest,
            });
          },
        }),
        snapshot: oversizedSnapshot,
        buildBundle: fixture.buildBundle,
        program: fixture.program,
        signal,
      })
    ).rejects.toThrow(/aggregate budget/u);
    expect(scanCalls).toBe(0);
  });

  it('re-observes the pinned Chromium image immediately before acquisition', async () => {
    const runtimeAuthority = await createRuntimeAuthorityInput();
    await writeFile(
      runtimeAuthority.executablePath,
      'mutated chromium image',
      'utf8'
    );
    const pool = new PlaywrightBrowserPool();
    await expect(
      pool.acquire({
        engine: 'chromium',
        runtimeIdentity: {
          browserImageDigest:
            runtimeAuthority.browserImageAuthority.imageDigest,
        },
        launch: {
          headless: true,
          executablePath: runtimeAuthority.executablePath,
        },
      } as Parameters<PlaywrightBrowserPool['acquire']>[0])
    ).rejects.toThrow(/image authority/u);
    await pool.dispose();
  });

  it('binds one exact remote no-fixture registration and drains cleanly', async () => {
    const fixture = createFixture();
    const preview = await createPreviewHost({
      attemptId: 'attempt:production-browser',
      generation: 1,
      snapshotDigest: fixture.snapshot.contentDigest,
      buildBundle: fixture.buildBundle,
    });
    const projectionAuthorityDigest = digestVerificationValue(
      'production-projection-authority'
    );
    const executableSnapshotReceipt =
      createProductionBrowserExecutableSnapshotReceipt({
        snapshot: fixture.snapshot,
        sourceRef: `executable-snapshot:${projectionAuthorityDigest.slice('sha256-'.length)}`,
        compilerProjectionReceiptDigest: projectionAuthorityDigest,
      });
    const authority = await createAuthority({ previewHost: preview.port });
    const registration = await authority.register(
      {
        ...fixture,
        attemptId: preview.evidence.attemptId,
        generation: preview.evidence.generation,
        providerKind: 'remote',
        runtimeAuthority: authority.runtimeAuthority,
        remoteExecution: preview.evidence,
        executableSnapshotReceipt,
        projectionAuthorityDigest,
      },
      signal
    );
    expect(registration.lease.binding.browserEngine).toBe('chromium');
    expect(registration.remoteBinding.snapshotDigest).toBe(
      fixture.snapshot.contentDigest
    );
    expect(registration.executableSnapshotReceipt).toEqual(
      executableSnapshotReceipt
    );
    expect(registration.runtimeReceipt).toMatchObject({
      executableSnapshotReceiptDigest: executableSnapshotReceipt.receiptDigest,
      browserImageDigest: registration.browserImageAuthority.imageDigest,
      runtimeAuthorityDigest: registration.runtimeAuthority.authorityDigest,
    });
    expect(authority.snapshot()).toMatchObject({ registered: 1 });

    await expect(
      authority.targetLease.acquire(
        {
          cell: fixture.cell,
          attemptId: preview.evidence.attemptId,
          generation: 1,
          executableSnapshotDigest: fixture.snapshot.contentDigest,
          executableSnapshotArtifactDigest: digestVerificationValue(
            'drifted-executable-snapshot-artifact'
          ),
          expectedBindingDigest: registration.lease.bindingDigest,
        },
        signal
      )
    ).rejects.toThrow(/drifted/u);

    const targetLease = await authority.targetLease.acquire(
      {
        cell: fixture.cell,
        attemptId: preview.evidence.attemptId,
        generation: 1,
        executableSnapshotDigest: fixture.snapshot.contentDigest,
        executableSnapshotArtifactDigest:
          executableSnapshotReceipt.artifactDigest,
        expectedBindingDigest: registration.lease.bindingDigest,
      },
      signal
    );
    const runtimeLease = await authority.runtimeControls.acquire(
      {
        cell: fixture.cell,
        targetLease,
        attemptId: preview.evidence.attemptId,
        generation: 1,
        providerKind: 'remote',
        executableSnapshotDigest: fixture.snapshot.contentDigest,
        expectedControlDigest: registration.appliedControlDigest,
        expectedCapabilitySnapshotDigest:
          registration.controlCapabilitySnapshotDigest,
        expectedControlCapabilityIds: registration.controlCapabilityIds,
      },
      signal
    );
    expect(
      await authority.runtimeControls.release(runtimeLease, undefined, signal)
    ).toMatchObject({ status: 'clean' });
    expect(
      await authority.targetLease.release(targetLease, signal)
    ).toMatchObject({ status: 'clean' });
    expect(authority.snapshot()).toMatchObject({ registered: 0 });
    await expect(authority.drainAndDispose()).resolves.toMatchObject({
      status: 'clean',
    });
    await expect(authority.drainAndDispose()).resolves.toMatchObject({
      status: 'clean',
    });
  });

  it('consumes one package-owned reserved preview and callback-bound canary authority', async () => {
    const fixture = createFixture();
    const previewHost = createProductionBrowserLoopbackPreviewHost();
    const entry = fixture.buildBundle.files.find(
      ({ path }) => path === fixture.snapshot.previewPlan.entryFilePath
    )!;
    const remoteExecution = await previewHost.reserve(
      {
        attemptId: 'attempt:package-preview-authority',
        generation: 1,
        requestId: 'request:package-preview-authority',
        executionId: 'execution:package-preview-authority',
        snapshotDigest: fixture.snapshot.contentDigest,
        buildBundleDigest: createProductionBrowserBuildBundleDigest(
          fixture.buildBundle
        ),
        entryFilePath: fixture.snapshot.previewPlan.entryFilePath,
        entryDigest: entry.digest,
        buildFileCount: fixture.buildBundle.files.length,
      },
      signal
    );
    const projectionAuthorityDigest = digestVerificationValue(
      'package-preview-projection-authority'
    );
    const authority = await createAuthority({
      previewHost,
      canaryScanner: createProductionBrowserCanaryScanner({
        secretAuthorityDigest: digestVerificationValue(
          'package-preview-secret-authority'
        ),
        forbiddenCanaries: () =>
          Object.freeze(['PRODIVIX-PACKAGE-PREVIEW-CANARY-0001']),
      }),
    });
    const registration = await authority.register(
      {
        ...fixture,
        attemptId: remoteExecution.attemptId,
        generation: remoteExecution.generation,
        providerKind: 'remote',
        runtimeAuthority: authority.runtimeAuthority,
        remoteExecution,
        executableSnapshotReceipt:
          createProductionBrowserExecutableSnapshotReceipt({
            snapshot: fixture.snapshot,
            sourceRef: `executable-snapshot:${projectionAuthorityDigest.slice('sha256-'.length)}`,
            compilerProjectionReceiptDigest: projectionAuthorityDigest,
          }),
        projectionAuthorityDigest,
      },
      signal
    );
    expect(registration.origin).toBe(remoteExecution.materializedOrigin);
    expect(registration.remoteBinding.snapshotDigest).toBe(
      fixture.snapshot.contentDigest
    );
    await expect(registration.retire()).resolves.toMatchObject({
      status: 'clean',
    });
    await expect(authority.drainAndDispose()).resolves.toMatchObject({
      status: 'clean',
    });
    await expect(previewHost.drainAndDispose()).resolves.toMatchObject({
      status: 'clean',
    });
  });

  it('fails before issuing a lease when a loopback resource exceeds its exact byte budget', async () => {
    const fixture = createFixture();
    const preview = await createPreviewHost({
      attemptId: 'attempt:oversize-browser',
      generation: 1,
      snapshotDigest: fixture.snapshot.contentDigest,
      buildBundle: fixture.buildBundle,
      oversize: true,
    });
    const projectionAuthorityDigest = digestVerificationValue(
      'production-projection-authority'
    );
    const authority = await createAuthority({
      previewHost: preview.port,
    });
    await expect(
      authority.register(
        {
          ...fixture,
          attemptId: preview.evidence.attemptId,
          generation: preview.evidence.generation,
          providerKind: 'remote',
          runtimeAuthority: authority.runtimeAuthority,
          remoteExecution: preview.evidence,
          executableSnapshotReceipt:
            createProductionBrowserExecutableSnapshotReceipt({
              snapshot: fixture.snapshot,
              sourceRef: `executable-snapshot:${projectionAuthorityDigest.slice('sha256-'.length)}`,
              compilerProjectionReceiptDigest: projectionAuthorityDigest,
            }),
          projectionAuthorityDigest,
        },
        signal
      )
    ).rejects.toThrow(/length|byte budget/u);
    expect(authority.snapshot()).toMatchObject({ registered: 0 });
    await expect(authority.drainAndDispose()).resolves.toMatchObject({
      status: 'clean',
    });
  });

  it('blocks loopback bytes that mutate after registration verification', async () => {
    const fixture = createFixture();
    const preview = await createPreviewHost({
      attemptId: 'attempt:mutated-browser',
      generation: 1,
      snapshotDigest: fixture.snapshot.contentDigest,
      buildBundle: fixture.buildBundle,
    });
    const projectionAuthorityDigest = digestVerificationValue(
      'production-projection-authority'
    );
    const authority = await createAuthority({ previewHost: preview.port });
    const registration = await authority.register(
      {
        ...fixture,
        attemptId: preview.evidence.attemptId,
        generation: preview.evidence.generation,
        providerKind: 'remote',
        runtimeAuthority: authority.runtimeAuthority,
        remoteExecution: preview.evidence,
        executableSnapshotReceipt:
          createProductionBrowserExecutableSnapshotReceipt({
            snapshot: fixture.snapshot,
            sourceRef: `executable-snapshot:${projectionAuthorityDigest.slice('sha256-'.length)}`,
            compilerProjectionReceiptDigest: projectionAuthorityDigest,
          }),
        projectionAuthorityDigest,
      },
      signal
    );
    const targetLease = await authority.targetLease.acquire(
      {
        cell: fixture.cell,
        attemptId: preview.evidence.attemptId,
        generation: 1,
        executableSnapshotDigest: fixture.snapshot.contentDigest,
        executableSnapshotArtifactDigest:
          registration.executableSnapshotReceipt.artifactDigest,
        expectedBindingDigest: registration.lease.bindingDigest,
      },
      signal
    );
    const runtimeLease = await authority.runtimeControls.acquire(
      {
        cell: fixture.cell,
        targetLease,
        attemptId: preview.evidence.attemptId,
        generation: 1,
        providerKind: 'remote',
        executableSnapshotDigest: fixture.snapshot.contentDigest,
        expectedControlDigest: registration.appliedControlDigest,
        expectedCapabilitySnapshotDigest:
          registration.controlCapabilitySnapshotDigest,
        expectedControlCapabilityIds: registration.controlCapabilityIds,
      },
      signal
    );
    const resource = runtimeLease.resourceManifest.resources.find(({ url }) =>
      url.endsWith('/index.html')
    )!;
    const router = new PlaywrightDeterministicResourceRouter(
      registration.origin,
      runtimeLease,
      new Map([[resource.url, resource]])
    );
    const mutated = new Uint8Array(resource.byteLength).fill(0x78);
    let abortReason: string | undefined;
    let fulfilled = false;
    const route = {
      request: () => ({
        url: () => resource.url,
        method: () => 'GET',
        resourceType: () => 'document',
      }),
      fetch: async () => ({
        body: async () => Buffer.from(mutated),
        headers: () => ({
          'content-length': String(mutated.byteLength),
          'content-type': 'text/html',
        }),
        status: () => 200,
        url: () => resource.url,
      }),
      abort: async (reason: string) => {
        abortReason = reason;
      },
      fulfill: async () => {
        fulfilled = true;
      },
    } as unknown as Route;
    await router.route(route);
    expect(abortReason).toBe('blockedbyclient');
    expect(fulfilled).toBe(false);
    expect(router.snapshot()).toMatchObject({
      manifestViolations: 1,
      responseCount: 0,
    });
    await expect(
      authority.runtimeControls.release(runtimeLease, undefined, signal)
    ).resolves.toMatchObject({ status: 'clean' });
    await expect(
      authority.targetLease.release(targetLease, signal)
    ).resolves.toMatchObject({ status: 'clean' });
    await expect(authority.drainAndDispose()).resolves.toMatchObject({
      status: 'clean',
    });
  });

  it('retains an earlier preview residual in the idempotent drain receipt', async () => {
    const fixture = createFixture();
    const retireResult = Object.freeze({
      status: 'residual' as const,
      residualCanaryIds: Object.freeze(['canary:preview:retained']),
      diagnosticCodes: Object.freeze(['VER-PREVIEW-RETAINED']),
    });
    const preview = await createPreviewHost({
      attemptId: 'attempt:residual-browser',
      generation: 1,
      snapshotDigest: fixture.snapshot.contentDigest,
      buildBundle: fixture.buildBundle,
      retireResult,
    });
    const projectionAuthorityDigest = digestVerificationValue(
      'production-projection-authority'
    );
    const authority = await createAuthority({ previewHost: preview.port });
    const registration = await authority.register(
      {
        ...fixture,
        attemptId: preview.evidence.attemptId,
        generation: preview.evidence.generation,
        providerKind: 'remote',
        runtimeAuthority: authority.runtimeAuthority,
        remoteExecution: preview.evidence,
        executableSnapshotReceipt:
          createProductionBrowserExecutableSnapshotReceipt({
            snapshot: fixture.snapshot,
            sourceRef: `executable-snapshot:${projectionAuthorityDigest.slice('sha256-'.length)}`,
            compilerProjectionReceiptDigest: projectionAuthorityDigest,
          }),
        projectionAuthorityDigest,
      },
      signal
    );
    await expect(registration.retire()).resolves.toEqual(retireResult);
    expect(authority.snapshot()).toMatchObject({ registered: 0 });
    await expect(authority.drainAndDispose()).resolves.toEqual(retireResult);
    await expect(authority.drainAndDispose()).resolves.toEqual(retireResult);
  });
});
