import { beforeAll, describe, expect, it } from 'vitest';
import {
  EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
  generateWorkspaceIsolatedServerFunctionExecutableProject,
  generateWorkspaceReactViteExecutableProject,
} from '@prodivix/prodivix-compiler';
import {
  applyWorkspaceTransaction,
  createWorkspaceOwnerGuardTransactionPlan,
  createWorkspaceReadGuardTransactionPlan,
  createWorkspaceReadSecretLoaderTransactionPlan,
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
  }, 30_000);

  it('keeps every supported and denied target cell explicit', () => {
    expect(matrix.targetMatrix).toEqual({
      'browser-static': {
        'audited-owner-adapter': 'blocked',
        'audited-secret-hmac': 'blocked',
        'isolated-code-export': 'blocked',
        'isolated-workspace-read-code-export': 'blocked',
        'isolated-secret-code-export': 'blocked',
        'isolated-workspace-read-secret-code-export': 'blocked',
        'isolated-project-source-mutation': 'blocked',
      },
      'deterministic-test': {
        'audited-owner-adapter': 'supported',
        'audited-secret-hmac': 'blocked',
        'isolated-code-export': 'supported',
        'isolated-workspace-read-code-export': 'supported',
        'isolated-secret-code-export': 'blocked',
        'isolated-workspace-read-secret-code-export': 'blocked',
        'isolated-project-source-mutation': 'blocked',
      },
      'remote-live': {
        'audited-owner-adapter': 'supported',
        'audited-secret-hmac': 'supported',
        'isolated-code-export': 'blocked',
        'isolated-workspace-read-code-export': 'blocked',
        'isolated-secret-code-export': 'blocked',
        'isolated-workspace-read-secret-code-export': 'blocked',
        'isolated-project-source-mutation': 'blocked',
      },
      'isolated-production': {
        'audited-owner-adapter': 'blocked',
        'audited-secret-hmac': 'blocked',
        'isolated-code-export': 'supported',
        'isolated-workspace-read-code-export': 'supported',
        'isolated-secret-code-export': 'supported',
        'isolated-workspace-read-secret-code-export': 'supported',
        'isolated-project-source-mutation': 'supported',
      },
    });
    expect(matrix.blockedDiagnostics.browserStaticAuditedAdapter).toContain(
      'WKS-EXPORT-SERVER-GATEWAY-REQUIRED'
    );
    expect(matrix.blockedDiagnostics.browserStaticCodeExport).toContain(
      'WKS-EXPORT-SERVER-GATEWAY-REQUIRED'
    );
    expect(
      matrix.blockedDiagnostics.browserStaticWorkspaceReadCodeExport
    ).toContain('WKS-EXPORT-SERVER-GATEWAY-REQUIRED');
    expect(matrix.blockedDiagnostics.browserStaticSecretHmac).toContain(
      'WKS-EXPORT-SERVER-GATEWAY-REQUIRED'
    );
    expect(matrix.blockedDiagnostics.deterministicTestSecretHmac).toContain(
      'WKS-EXPORT-SERVER-ENVIRONMENT-UNSUPPORTED'
    );
    expect(matrix.blockedDiagnostics.deterministicTestIsolatedSecret).toContain(
      'WKS-EXPORT-SERVER-ENVIRONMENT-UNSUPPORTED'
    );
    expect(
      matrix.blockedDiagnostics.deterministicTestWorkspaceReadSecret
    ).toContain('WKS-EXPORT-SERVER-ENVIRONMENT-UNSUPPORTED');
    expect(matrix.blockedDiagnostics.remoteLiveCodeExport).toContain(
      'WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED'
    );
    expect(
      matrix.blockedDiagnostics.remoteLiveWorkspaceReadCodeExport
    ).toContain('WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED');
    expect(matrix.blockedDiagnostics.remoteLiveIsolatedSecret).toContain(
      'WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED'
    );
    expect(matrix.blockedDiagnostics.remoteLiveWorkspaceReadSecret).toContain(
      'WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED'
    );
    expect(matrix.blockedDiagnostics.browserStaticIsolatedSecret).toContain(
      'WKS-EXPORT-SERVER-GATEWAY-REQUIRED'
    );
    expect(
      matrix.blockedDiagnostics.browserStaticWorkspaceReadSecret
    ).toContain('WKS-EXPORT-SERVER-GATEWAY-REQUIRED');
    expect(
      matrix.blockedDiagnostics.browserStaticProjectSourceMutation
    ).toContain('WKS-EXPORT-SERVER-GATEWAY-REQUIRED');
    expect(
      matrix.blockedDiagnostics.deterministicTestProjectSourceMutation
    ).toContain('WKS-EXPORT-SERVER-TEST-SOURCE-MUTATION-UNSUPPORTED');
    expect(matrix.blockedDiagnostics.remoteLiveProjectSourceMutation).toContain(
      'WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED'
    );
    expect(
      matrix.blockedDiagnostics.isolatedProductionAuditedAdapter
    ).toContain('WKS-EXPORT-SERVER-ISOLATED-POLICY-UNSUPPORTED');
    expect(matrix.blockedDiagnostics.isolatedProductionSecretHmac).toContain(
      'WKS-EXPORT-SERVER-ISOLATED-POLICY-UNSUPPORTED'
    );
  });

  it('executes owner and workspace.read contracts in the deterministic Test session', () => {
    expect(matrix.deterministicTest.outcomes).toEqual([
      'allow',
      'allow',
      'allow',
    ]);
    expect(matrix.deterministicTest.observationCount).toBe(3);
    expect(matrix.deterministicTest.invocationTraceCount).toBe(1);
    expect(matrix.deterministicTest.snapshotsRequireServerFunction).toBe(true);
    expect(matrix.deterministicTest.snapshotsProvisionServerRuntime).toBe(true);
    expect(matrix.deterministicTest.auditedAdapterSnapshotDigest).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );
    expect(matrix.deterministicTest.codeExportSnapshotDigest).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );
    expect(matrix.deterministicTest.workspaceReadSnapshotDigest).toMatch(
      /^sha256-[a-f0-9]{64}$/u
    );
    expect(matrix.deterministicTest.vueAuditedAdapterSnapshotDigest).toMatch(
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

  it('executes Secret-free workspace.read with the same one-shot authority fence', () => {
    expect(matrix.isolatedWorkspaceRead.snapshot).toMatchObject({
      format: 'prodivix.executable-project.v6',
      target: { presetId: 'isolated-server-function' },
      serverFunctionPlan: {
        functionRef: {
          artifactId: GOLDEN_G2_AUTH_SERVER_IDS.serverDocument,
          exportName: GOLDEN_G2_AUTH_SERVER_IDS.isolatedReadExport,
        },
        runtimeManifest: {
          functionsByExport: {
            [GOLDEN_G2_AUTH_SERVER_IDS.isolatedReadExport]: {
              auth: {
                kind: 'permission',
                permissionId: 'workspace.read',
              },
            },
          },
        },
      },
    });
    expect(
      matrix.isolatedWorkspaceRead.snapshot.capabilityRequirements.production
    ).not.toContain('environment-binding');
    expect(matrix.isolatedWorkspaceRead.authorityConsumed).toBe(true);
    expect(matrix.isolatedWorkspaceRead.response).toMatchObject({
      requestId: 'golden-isolated-read:1',
      ok: true,
      result: { kind: 'allow' },
    });
    expect(matrix.isolatedWorkspaceRead.sourceArtifactIds).toEqual([
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

  it('requires exact workspace.read authority and one-shot Secret material together', () => {
    expect(matrix.isolatedWorkspaceReadSecret.snapshot).toMatchObject({
      format: 'prodivix.executable-project.v6',
      target: { presetId: 'isolated-server-function' },
      serverFunctionPlan: {
        functionRef: {
          artifactId: GOLDEN_G2_AUTH_SERVER_IDS.serverDocument,
          exportName: GOLDEN_G2_AUTH_SERVER_IDS.isolatedReadSecretExport,
        },
        runtimeManifest: {
          functionsByExport: {
            [GOLDEN_G2_AUTH_SERVER_IDS.isolatedReadSecretExport]: {
              auth: {
                kind: 'permission',
                permissionId: 'workspace.read',
              },
              environment: {
                secretsByField: {
                  signingKey: { bindingId: 'golden-webhook-signing-key' },
                },
              },
            },
          },
        },
      },
    });
    expect(
      matrix.isolatedWorkspaceReadSecret.snapshot.capabilityRequirements
        .production
    ).toEqual(
      expect.arrayContaining(['environment-binding', 'server-function'])
    );
    expect(matrix.isolatedWorkspaceReadSecret.authorityConsumed).toBe(true);
    expect(matrix.isolatedWorkspaceReadSecret.secretMaterialConsumed).toBe(
      true
    );
    expect(matrix.isolatedWorkspaceReadSecret.response).toMatchObject({
      requestId: 'golden-isolated-read-secret:1',
      ok: true,
      result: {
        kind: 'value',
        value: { secretLength: 'golden-secret-material-canary'.length },
      },
    });
    expect(
      JSON.stringify(matrix.isolatedWorkspaceReadSecret.response)
    ).not.toContain('golden-secret-material-canary');
  });

  it('executes one isolated source mutation and adopts only its selected revision-fenced diff', () => {
    expect(matrix.isolatedProjectSourceMutation.snapshot).toMatchObject({
      format: 'prodivix.executable-project.v6',
      target: { presetId: 'isolated-server-function' },
      serverFunctionPlan: {
        functionRef: {
          artifactId: 'code-golden-source-mutation-action',
          exportName: 'replaceProjectSource',
        },
        runtimeManifest: {
          functionsByExport: {
            replaceProjectSource: {
              kind: 'route-action',
              effect: 'mutation',
              auth: {
                kind: 'permission',
                permissionId: 'workspace.write',
              },
              idempotency: { kind: 'invocation-key' },
            },
          },
        },
      },
    });
    expect(
      matrix.isolatedProjectSourceMutation.snapshot.capabilityRequirements
        .production
    ).not.toContain('network');
    expect(matrix.isolatedProjectSourceMutation.response).toMatchObject({
      requestId: 'golden-isolated-source-mutation:1',
      ok: true,
      result: { kind: 'value', value: { updated: true } },
    });
    expect(matrix.isolatedProjectSourceMutation.authorityConsumed).toBe(true);
    expect(
      matrix.isolatedProjectSourceMutation.workspaceUnchangedBeforeAdoption
    ).toBe(true);
    expect(matrix.isolatedProjectSourceMutation.eligibleChangeIds).toHaveLength(
      1
    );
    expect(matrix.isolatedProjectSourceMutation.targetArtifactId).toBe(
      'code-golden-source-mutation-target'
    );
    expect(matrix.isolatedProjectSourceMutation.adoptedTargetSource).toBe(
      "export const projectSourceValue = 'Adopted from isolated execution.';\n"
    );
    expect(matrix.isolatedProjectSourceMutation.actionSourceUnchanged).toBe(
      true
    );
    expect(matrix.isolatedProjectSourceMutation.staleAdoptionBlocked).toBe(
      true
    );
    expect(
      JSON.stringify(matrix.isolatedProjectSourceMutation.response)
    ).not.toContain('Adopted from isolated execution.');
  });

  it('keeps credential material, client-side source, and SourceTrace text outside their boundaries', () => {
    expect(matrix.boundary).toEqual({
      clientSnapshotsExcludeServerSource: true,
      snapshotsExcludeCredentialCanaries: true,
      responseExcludesCredentialAndSourceCanaries: true,
      sourceTraceExcludesSourceText: true,
      strictInvocationRejectsCredentialField: true,
      strictAuthorityRejectsCredentialField: true,
      invocationTraceExcludesCredentialCanaries: true,
      strictInvocationTraceRejectsCredentialField: true,
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
          permissionIds: [
            'workspace.owner',
            'workspace.read',
            'workspace.write',
          ],
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

  it('authors, reloads, and compiles the isolated workspace.read preset', () => {
    const workspace = createGoldenG2AuthServerWorkspace('isolated-read');
    const plan = createWorkspaceReadGuardTransactionPlan({
      workspace,
      routeNodeId: GOLDEN_G2_AUTH_SERVER_IDS.route,
      documentId: 'code-authored-isolated-read',
      path: '/server/isolated-read.guard.server.ts',
      transactionId: 'golden-author-isolated-read',
      issuedAt: '2026-07-19T03:00:00.000Z',
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') throw new Error(plan.message);
    const applied = applyWorkspaceTransaction(workspace, plan.plan.transaction);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
    const reloaded = decodeWorkspaceSnapshot(
      encodeWorkspaceSnapshot(applied.snapshot, {})
    ).workspace;
    expect(projectWorkspaceServerRuntimeAuthoring(reloaded).issues).toEqual([]);
    const project = generateWorkspaceIsolatedServerFunctionExecutableProject(
      reloaded,
      { functionRef: plan.plan.functionRef }
    );
    if (project.status !== 'ready') {
      throw new Error(
        `Authored isolated workspace.read guard did not compile: ${JSON.stringify(project.diagnostics)}`
      );
    }
    expect(project.snapshot.serverFunctionPlan).toMatchObject({
      functionRef: plan.plan.functionRef,
      runtimeManifest: {
        functionsByExport: {
          requireWorkspaceRead: {
            auth: { kind: 'permission', permissionId: 'workspace.read' },
          },
        },
      },
    });
    expect(JSON.stringify(project.snapshot)).not.toMatch(
      /bearer|token|cookie|sessionId|secretValue/iu
    );
  });

  it('authors, reloads, and compiles a reference-only workspace.read Secret loader', () => {
    const workspace = createGoldenG2AuthServerWorkspace('isolated-read-secret');
    const plan = createWorkspaceReadSecretLoaderTransactionPlan({
      workspace,
      routeNodeId: GOLDEN_G2_AUTH_SERVER_IDS.route,
      documentId: 'code-authored-isolated-read-secret',
      path: '/server/isolated-read-secret.loader.server.ts',
      secretBindingId: 'golden-product-signing-key',
      transactionId: 'golden-author-isolated-read-secret',
      issuedAt: '2026-07-19T04:00:00.000Z',
    });
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') throw new Error(plan.message);
    const applied = applyWorkspaceTransaction(workspace, plan.plan.transaction);
    expect(applied.ok).toBe(true);
    if (!applied.ok) throw new Error(JSON.stringify(applied.issues));
    const reloaded = decodeWorkspaceSnapshot(
      encodeWorkspaceSnapshot(applied.snapshot, {})
    ).workspace;
    expect(projectWorkspaceServerRuntimeAuthoring(reloaded).issues).toEqual([]);
    const project = generateWorkspaceIsolatedServerFunctionExecutableProject(
      reloaded,
      { functionRef: plan.plan.functionRef }
    );
    if (project.status !== 'ready') {
      throw new Error(
        `Authored isolated workspace.read Secret loader did not compile: ${JSON.stringify(project.diagnostics)}`
      );
    }
    expect(project.snapshot.serverFunctionPlan).toMatchObject({
      functionRef: plan.plan.functionRef,
      runtimeManifest: {
        functionsByExport: {
          loadWorkspaceReadSecret: {
            auth: { kind: 'permission', permissionId: 'workspace.read' },
            environment: {
              secretsByField: {
                signingKey: { bindingId: 'golden-product-signing-key' },
              },
            },
          },
        },
      },
    });
    expect(project.snapshot.capabilityRequirements.production).toContain(
      'environment-binding'
    );
    expect(JSON.stringify(project.snapshot)).not.toMatch(
      /bearer|token|cookie|sessionId|secretValue/iu
    );
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
