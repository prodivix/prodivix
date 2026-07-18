import { beforeAll, describe, expect, it } from 'vitest';
import {
  EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
  generateWorkspaceIsolatedServerFunctionExecutableProject,
  generateWorkspaceReactViteExecutableProject,
} from '@prodivix/prodivix-compiler';
import {
  applyWorkspaceTransaction,
  createWorkspaceOwnerGuardTransactionPlan,
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  projectWorkspaceServerRuntimeAuthoring,
  readWorkspaceServerRuntimeAuthConfiguration,
} from '@prodivix/workspace';
import {
  GOLDEN_G2_AUTH_SERVER_IDS,
  GOLDEN_G2_AUTH_SERVER_SOURCE_CANARY,
  GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF,
  createGoldenG2AuthServerWorkspace,
} from './goldenG2AuthServerFixture';
import {
  runGoldenG2AuthServerMatrix,
  type GoldenG2AuthServerMatrixReport,
} from './goldenG2AuthServerMatrix';

describe('G2 Golden Auth/Server target contract matrix', () => {
  let matrix: GoldenG2AuthServerMatrixReport;

  beforeAll(async () => {
    matrix = await runGoldenG2AuthServerMatrix();
  });

  it('keeps every supported and denied target cell explicit', () => {
    expect(matrix.targetMatrix).toEqual({
      'browser-static': {
        'audited-owner-adapter': 'blocked',
        'audited-secret-hmac': 'blocked',
        'isolated-code-export': 'blocked',
        'isolated-secret-code-export': 'blocked',
      },
      'deterministic-test': {
        'audited-owner-adapter': 'supported',
        'audited-secret-hmac': 'blocked',
        'isolated-code-export': 'supported',
        'isolated-secret-code-export': 'blocked',
      },
      'remote-live': {
        'audited-owner-adapter': 'supported',
        'audited-secret-hmac': 'supported',
        'isolated-code-export': 'blocked',
        'isolated-secret-code-export': 'blocked',
      },
      'isolated-production': {
        'audited-owner-adapter': 'blocked',
        'audited-secret-hmac': 'blocked',
        'isolated-code-export': 'supported',
        'isolated-secret-code-export': 'supported',
      },
    });
    expect(matrix.blockedDiagnostics.browserStaticAuditedAdapter).toContain(
      'WKS-EXPORT-SERVER-GATEWAY-REQUIRED'
    );
    expect(matrix.blockedDiagnostics.browserStaticCodeExport).toContain(
      'WKS-EXPORT-SERVER-GATEWAY-REQUIRED'
    );
    expect(matrix.blockedDiagnostics.browserStaticSecretHmac).toContain(
      'WKS-EXPORT-SERVER-GATEWAY-REQUIRED'
    );
    expect(matrix.blockedDiagnostics.deterministicTestSecretHmac).toContain(
      'WKS-EXPORT-SERVER-ENVIRONMENT-UNSUPPORTED'
    );
    expect(matrix.blockedDiagnostics.deterministicTestIsolatedSecret).toContain(
      'WKS-EXPORT-SERVER-ENVIRONMENT-UNSUPPORTED'
    );
    expect(matrix.blockedDiagnostics.remoteLiveCodeExport).toContain(
      'WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED'
    );
    expect(matrix.blockedDiagnostics.remoteLiveIsolatedSecret).toContain(
      'WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED'
    );
    expect(matrix.blockedDiagnostics.browserStaticIsolatedSecret).toContain(
      'WKS-EXPORT-SERVER-GATEWAY-REQUIRED'
    );
    expect(
      matrix.blockedDiagnostics.isolatedProductionAuditedAdapter
    ).toContain('WKS-EXPORT-SERVER-ISOLATED-POLICY-UNSUPPORTED');
    expect(matrix.blockedDiagnostics.isolatedProductionSecretHmac).toContain(
      'WKS-EXPORT-SERVER-ISOLATED-POLICY-UNSUPPORTED'
    );
  });

  it('executes both owner-guard contracts in the deterministic Test session', () => {
    expect(matrix.deterministicTest.outcomes).toEqual(['allow', 'allow']);
    expect(matrix.deterministicTest.observationCount).toBe(2);
    expect(matrix.deterministicTest.auditedAdapterSnapshotDigest).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );
    expect(matrix.deterministicTest.codeExportSnapshotDigest).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );
  });

  it('projects only the audited adapter into the Remote live gateway', () => {
    expect(matrix.remoteLive.snapshot).toMatchObject({
      format: 'prodivix.executable-project.v6',
      target: {
        presetId: 'react-vite',
        framework: 'react',
        runtime: 'vite',
      },
    });
    expect(matrix.remoteLive.requiresServerFunction).toBe(true);
    expect(matrix.remoteLive.serverSourceExcluded).toBe(true);
    const generatedRuntime = matrix.remoteLive.snapshot.files.find(
      ({ path }) => path === 'src/prodivix-server-runtime.ts'
    );
    expect(generatedRuntime?.contents).toContain(
      'prodivix.execution-server-function-gateway-request.v1'
    );
    expect(generatedRuntime?.contents).toContain(
      GOLDEN_G2_AUTH_SERVER_IDS.remoteExport
    );
    expect(generatedRuntime?.contents).not.toContain(
      GOLDEN_G2_AUTH_SERVER_SOURCE_CANARY
    );
    expect(
      matrix.remoteLive.snapshot.serverRuntimeMockProvision
    ).toBeUndefined();
  });

  it('projects the audited Secret HMAC adapter only with Remote environment-binding', () => {
    expect(matrix.remoteLiveSecret.snapshot).toMatchObject({
      format: 'prodivix.executable-project.v6',
      target: {
        presetId: 'react-vite',
        framework: 'react',
        runtime: 'vite',
      },
    });
    expect(matrix.remoteLiveSecret.requiresServerFunction).toBe(true);
    expect(matrix.remoteLiveSecret.requiresEnvironmentBinding).toBe(true);
    expect(matrix.remoteLiveSecret.serverSourceExcluded).toBe(true);
    expect(
      matrix.remoteLiveSecret.snapshot.capabilityRequirements.preview
    ).toEqual(
      expect.arrayContaining(['environment-binding', 'server-function'])
    );
    expect(JSON.stringify(matrix.remoteLiveSecret.snapshot)).not.toContain(
      'golden-secret-material-canary'
    );
  });

  it('executes the code export with one-shot owner authority and trusted result validation', () => {
    expect(matrix.isolatedProduction.snapshot).toMatchObject({
      format: 'prodivix.executable-project.v6',
      target: {
        presetId: 'isolated-server-function',
        framework: 'typescript',
        runtime: 'node',
      },
      entrypoints: [{ kind: 'production' }],
      serverFunctionPlan: {
        format: 'prodivix.executable-server-function-plan.v1',
        functionRef: {
          artifactId: GOLDEN_G2_AUTH_SERVER_IDS.serverDocument,
          exportName: GOLDEN_G2_AUTH_SERVER_IDS.isolatedExport,
        },
      },
    });
    expect(
      matrix.isolatedProduction.snapshot.capabilityRequirements.production
    ).not.toContain('network');
    expect(matrix.isolatedProduction.authorityConsumed).toBe(true);
    expect(matrix.isolatedProduction.response).toMatchObject({
      requestId: 'golden-isolated-owner:1',
      ok: true,
      result: { kind: 'allow' },
    });
    expect(matrix.isolatedProduction.sourceArtifactIds).toEqual([
      GOLDEN_G2_AUTH_SERVER_IDS.serverDocument,
      GOLDEN_G2_AUTH_SERVER_IDS.helperDocument,
    ]);
  });

  it('executes the isolated Secret code export with one-shot material and no output leak', () => {
    expect(matrix.isolatedProductionSecret.snapshot).toMatchObject({
      format: 'prodivix.executable-project.v6',
      target: { presetId: 'isolated-server-function' },
      serverFunctionPlan: {
        functionRef: {
          artifactId: GOLDEN_G2_AUTH_SERVER_IDS.serverDocument,
          exportName: GOLDEN_G2_AUTH_SERVER_IDS.isolatedSecretExport,
        },
      },
    });
    expect(
      matrix.isolatedProductionSecret.snapshot.capabilityRequirements.production
    ).toEqual(
      expect.arrayContaining(['environment-binding', 'server-function'])
    );
    expect(matrix.isolatedProductionSecret.secretMaterialConsumed).toBe(true);
    expect(matrix.isolatedProductionSecret.response).toMatchObject({
      requestId: 'golden-isolated-secret:1',
      ok: true,
      result: {
        kind: 'value',
        value: { secretLength: 'golden-secret-material-canary'.length },
      },
    });
    expect(
      JSON.stringify(matrix.isolatedProductionSecret.response)
    ).not.toContain('golden-secret-material-canary');
  });

  it('keeps credential material, client-side source, and SourceTrace text outside their boundaries', () => {
    expect(matrix.boundary).toEqual({
      clientSnapshotsExcludeServerSource: true,
      snapshotsExcludeCredentialCanaries: true,
      responseExcludesCredentialAndSourceCanaries: true,
      sourceTraceExcludesSourceText: true,
      strictInvocationRejectsCredentialField: true,
      strictAuthorityRejectsCredentialField: true,
    });
  });

  it('authors, persists, reloads, and compiles both owner-guard target presets', () => {
    const applyPreset = (
      target: 'remote-live' | 'isolated-production',
      documentId: string
    ) => {
      const plan = createWorkspaceOwnerGuardTransactionPlan({
        workspace: createGoldenG2AuthServerWorkspace(target),
        routeNodeId: GOLDEN_G2_AUTH_SERVER_IDS.route,
        target,
        documentId,
        path: `/server/${target}.guard.server.ts`,
        transactionId: `golden-author-${target}`,
        issuedAt: '2026-07-18T14:00:00.000Z',
      });
      expect(plan.status).toBe('ready');
      if (plan.status !== 'ready') throw new Error(plan.message);
      const applied = applyWorkspaceTransaction(
        createGoldenG2AuthServerWorkspace(target),
        plan.plan.transaction
      );
      expect(applied.ok).toBe(true);
      if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
      const reloaded = decodeWorkspaceSnapshot(
        encodeWorkspaceSnapshot(applied.snapshot, {})
      ).workspace;
      const projection = projectWorkspaceServerRuntimeAuthoring(reloaded);
      expect(projection.issues).toEqual([]);
      expect(
        readWorkspaceServerRuntimeAuthConfiguration(reloaded)
      ).toMatchObject({
        status: 'ready',
        configuration: {
          providerId: 'prodivix-product-session',
          permissionIds: ['workspace.owner'],
        },
      });
      expect(projection.bindings).toContainEqual(
        expect.objectContaining({
          routeNodeId: GOLDEN_G2_AUTH_SERVER_IDS.route,
          slot: 'guard',
          candidateKey: `${documentId}#requireWorkspaceOwner`,
        })
      );
      return {
        workspace: reloaded,
        functionRef: plan.plan.functionRef,
      };
    };

    const remote = applyPreset('remote-live', 'code-authored-remote-owner');
    const remoteProject = generateWorkspaceReactViteExecutableProject(
      remote.workspace,
      { serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET }
    );
    if (remoteProject.status !== 'ready') {
      throw new Error(
        `Authored Remote owner guard did not compile: ${JSON.stringify(remoteProject.diagnostics)}`
      );
    }
    expect(JSON.stringify(remoteProject.snapshot)).not.toContain(
      'Use the authenticated Prodivix Remote gateway.'
    );
    expect(remoteProject.snapshot.capabilityRequirements.preview).toContain(
      'server-function'
    );

    const isolated = applyPreset(
      'isolated-production',
      'code-authored-isolated-owner'
    );
    const isolatedProject =
      generateWorkspaceIsolatedServerFunctionExecutableProject(
        isolated.workspace,
        { functionRef: isolated.functionRef }
      );
    if (isolatedProject.status !== 'ready') {
      throw new Error(
        `Authored isolated owner guard did not compile: ${JSON.stringify(isolatedProject.diagnostics)}`
      );
    }
    expect(isolatedProject.snapshot.serverFunctionPlan?.functionRef).toEqual(
      isolated.functionRef
    );
    expect(
      isolatedProject.snapshot.files.find(
        ({ path }) => path === 'src/.prodivix/server-runtime/function.mjs'
      )?.contents
    ).toContain('WORKSPACE_OWNER_REQUIRED');
  });

  it('fails Remote and isolated protected targets closed when Auth configuration is missing or incomplete', () => {
    const missing = createGoldenG2AuthServerWorkspace('remote-live');
    const {
      [GOLDEN_G2_AUTH_SERVER_IDS.authConfigurationDocument]: _removed,
      ...missingDocuments
    } = missing.docsById;
    const missingConfiguration = {
      ...missing,
      docsById: missingDocuments,
    };
    const remote = generateWorkspaceReactViteExecutableProject(
      missingConfiguration,
      { serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET }
    );
    expect(remote.status).toBe('blocked');
    if (remote.status === 'blocked') {
      expect(remote.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'WKS-EXPORT-SERVER-AUTH-CONFIG-REQUIRED',
        })
      );
    }

    const isolated = createGoldenG2AuthServerWorkspace('isolated-production');
    const authDocument =
      isolated.docsById[GOLDEN_G2_AUTH_SERVER_IDS.authConfigurationDocument];
    const incompleteConfiguration = {
      ...isolated,
      docsById: {
        ...isolated.docsById,
        [GOLDEN_G2_AUTH_SERVER_IDS.authConfigurationDocument]: {
          ...authDocument,
          content: {
            kind: 'config',
            value: {
              schemaVersion: '1.0',
              providerId: 'prodivix-product-session',
              permissionIds: [],
            },
          },
        },
      },
    };
    const isolatedProject =
      generateWorkspaceIsolatedServerFunctionExecutableProject(
        incompleteConfiguration,
        { functionRef: GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF }
      );
    expect(isolatedProject).toMatchObject({
      status: 'blocked',
      diagnostics: [{ code: 'WKS-EXPORT-SERVER-PERMISSION-UNDECLARED' }],
    });
  });
});
