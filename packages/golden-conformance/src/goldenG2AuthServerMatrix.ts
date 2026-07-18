import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import {
  DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
  generateWorkspaceIsolatedServerFunctionExecutableProject,
  generateWorkspaceReactViteExecutableProject,
} from '@prodivix/prodivix-compiler';
import {
  createExecutionRequest,
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import {
  createIsolatedServerFunctionAuthority,
  createServerRuntimeTestSession,
  decodeServerRuntimeProfile,
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH,
  ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
  ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH,
  readExecutionServerFunctionBridgeRequest,
  readIsolatedServerFunctionAuthority,
  readIsolatedServerFunctionExecutionResponse,
  resolveServerFunctionDefinition,
  type ExecutionServerFunctionBridgeResponse,
  type ServerFunctionDefinition,
} from '@prodivix/server-runtime';
import { isWorkspaceCodeDocumentContent } from '@prodivix/workspace';
import {
  createGoldenG2AuthServerTestProvision,
  createGoldenG2AuthServerWorkspace,
  GOLDEN_G2_AUTH_SERVER_CREDENTIAL_CANARIES,
  GOLDEN_G2_AUTH_SERVER_IDS,
  GOLDEN_G2_AUTH_SERVER_SOURCE_CANARY,
  GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF,
  GOLDEN_G2_ISOLATED_SECRET_FUNCTION_REF,
  GOLDEN_G2_REMOTE_HMAC_FUNCTION_REF,
  GOLDEN_G2_REMOTE_OWNER_FUNCTION_REF,
} from './goldenG2AuthServerFixture';

const execFileAsync = promisify(execFile);

export type GoldenG2AuthServerTarget =
  | 'browser-static'
  | 'deterministic-test'
  | 'remote-live'
  | 'isolated-production';

export type GoldenG2AuthServerFunction =
  | 'audited-owner-adapter'
  | 'audited-secret-hmac'
  | 'isolated-code-export'
  | 'isolated-secret-code-export';

export type GoldenG2AuthServerTargetMatrix = Readonly<
  Record<
    GoldenG2AuthServerTarget,
    Readonly<Record<GoldenG2AuthServerFunction, 'supported' | 'blocked'>>
  >
>;

export type GoldenG2AuthServerMatrixReport = Readonly<{
  targetMatrix: GoldenG2AuthServerTargetMatrix;
  blockedDiagnostics: Readonly<{
    browserStaticAuditedAdapter: readonly string[];
    browserStaticSecretHmac: readonly string[];
    browserStaticCodeExport: readonly string[];
    browserStaticIsolatedSecret: readonly string[];
    deterministicTestSecretHmac: readonly string[];
    deterministicTestIsolatedSecret: readonly string[];
    remoteLiveCodeExport: readonly string[];
    remoteLiveIsolatedSecret: readonly string[];
    isolatedProductionAuditedAdapter: readonly string[];
    isolatedProductionSecretHmac: readonly string[];
  }>;
  deterministicTest: Readonly<{
    auditedAdapterSnapshotDigest: string;
    codeExportSnapshotDigest: string;
    outcomes: readonly ['allow', 'allow'];
    observationCount: number;
  }>;
  remoteLive: Readonly<{
    snapshot: ExecutableProjectSnapshot;
    serverSourceExcluded: boolean;
    requiresServerFunction: boolean;
  }>;
  remoteLiveSecret: Readonly<{
    snapshot: ExecutableProjectSnapshot;
    serverSourceExcluded: boolean;
    requiresEnvironmentBinding: boolean;
    requiresServerFunction: boolean;
  }>;
  isolatedProduction: Readonly<{
    snapshot: ExecutableProjectSnapshot;
    response: ExecutionServerFunctionBridgeResponse;
    authorityConsumed: boolean;
    sourceArtifactIds: readonly string[];
  }>;
  isolatedProductionSecret: Readonly<{
    snapshot: ExecutableProjectSnapshot;
    response: ExecutionServerFunctionBridgeResponse;
    secretMaterialConsumed: boolean;
  }>;
  boundary: Readonly<{
    clientSnapshotsExcludeServerSource: boolean;
    snapshotsExcludeCredentialCanaries: boolean;
    responseExcludesCredentialAndSourceCanaries: boolean;
    sourceTraceExcludesSourceText: boolean;
    strictInvocationRejectsCredentialField: boolean;
    strictAuthorityRejectsCredentialField: boolean;
  }>;
}>;

const targetMatrix: GoldenG2AuthServerTargetMatrix = Object.freeze({
  'browser-static': Object.freeze({
    'audited-owner-adapter': 'blocked',
    'audited-secret-hmac': 'blocked',
    'isolated-code-export': 'blocked',
    'isolated-secret-code-export': 'blocked',
  }),
  'deterministic-test': Object.freeze({
    'audited-owner-adapter': 'supported',
    'audited-secret-hmac': 'blocked',
    'isolated-code-export': 'supported',
    'isolated-secret-code-export': 'blocked',
  }),
  'remote-live': Object.freeze({
    'audited-owner-adapter': 'supported',
    'audited-secret-hmac': 'supported',
    'isolated-code-export': 'blocked',
    'isolated-secret-code-export': 'blocked',
  }),
  'isolated-production': Object.freeze({
    'audited-owner-adapter': 'blocked',
    'audited-secret-hmac': 'blocked',
    'isolated-code-export': 'supported',
    'isolated-secret-code-export': 'supported',
  }),
});

const requireReady = <T extends { status: string }>(
  value: T,
  label: string
): Extract<T, { status: 'ready' }> => {
  if (value.status !== 'ready') {
    throw new Error(
      `${label} did not produce a ready executable snapshot: ${JSON.stringify(value)}`
    );
  }
  return value as Extract<T, { status: 'ready' }>;
};

const requireBlockedCodes = <T extends { status: string }>(
  value: T,
  label: string
): readonly string[] => {
  if (value.status !== 'blocked') {
    throw new Error(`${label} unexpectedly produced an executable snapshot.`);
  }
  return Object.freeze(
    (
      value as T & {
        diagnostics: readonly Readonly<{ code: string }>[];
      }
    ).diagnostics.map(({ code }) => code)
  );
};

const contentsText = (value: string | Uint8Array): string =>
  typeof value === 'string' ? value : new TextDecoder().decode(value);

const snapshotText = (snapshot: ExecutableProjectSnapshot): string =>
  snapshot.files.map(({ contents }) => contentsText(contents)).join('\n');

const definitions = (): readonly [
  ServerFunctionDefinition,
  ServerFunctionDefinition,
] => {
  const workspace = createGoldenG2AuthServerWorkspace('remote-live');
  const document = workspace.docsById[GOLDEN_G2_AUTH_SERVER_IDS.serverDocument];
  const content = document?.type === 'code' ? document.content : undefined;
  if (!isWorkspaceCodeDocumentContent(content)) {
    throw new Error('Golden Auth/Server code document is invalid.');
  }
  const decoded = decodeServerRuntimeProfile(
    content.metadata,
    content.language
  );
  if (decoded.status !== 'valid') {
    throw new Error('Golden Auth/Server runtime profile is invalid.');
  }
  const remote = resolveServerFunctionDefinition(
    decoded.profile,
    GOLDEN_G2_REMOTE_OWNER_FUNCTION_REF.artifactId,
    GOLDEN_G2_REMOTE_OWNER_FUNCTION_REF.exportName
  );
  const isolated = resolveServerFunctionDefinition(
    decoded.profile,
    GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF.artifactId,
    GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF.exportName
  );
  if (!remote || !isolated) {
    throw new Error('Golden Auth/Server definitions are incomplete.');
  }
  return Object.freeze([remote, isolated]);
};

const runDeterministicTest = async () => {
  const provision = createGoldenG2AuthServerTestProvision();
  const auditedAdapter = requireReady(
    generateWorkspaceReactViteExecutableProject(
      createGoldenG2AuthServerWorkspace('remote-live'),
      {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
        serverRuntimeMockProvision: provision,
      }
    ),
    'Deterministic audited-adapter target'
  );
  const codeExport = requireReady(
    generateWorkspaceReactViteExecutableProject(
      createGoldenG2AuthServerWorkspace('isolated-production'),
      {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
        serverRuntimeMockProvision: provision,
      }
    ),
    'Deterministic code-export target'
  );
  const session = createServerRuntimeTestSession({
    workspaceId: GOLDEN_G2_AUTH_SERVER_IDS.workspace,
    definitions: definitions(),
    provision,
  });
  try {
    const input = Object.freeze({ routeId: GOLDEN_G2_AUTH_SERVER_IDS.route });
    const auditedOutcome = await session.invoke({
      functionRef: GOLDEN_G2_REMOTE_OWNER_FUNCTION_REF,
      invocationId: 'golden-test-audited-owner',
      attempt: 1,
      input,
    });
    const isolatedOutcome = await session.invoke({
      functionRef: GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF,
      invocationId: 'golden-test-isolated-owner',
      attempt: 1,
      input,
    });
    if (auditedOutcome.kind !== 'allow' || isolatedOutcome.kind !== 'allow') {
      throw new Error('Golden deterministic owner guards did not allow.');
    }
    return Object.freeze({
      auditedAdapter,
      codeExport,
      outcomes: Object.freeze(['allow', 'allow'] as const),
      observationCount: session.listObservations().length,
    });
  } finally {
    session.dispose();
  }
};

const runIsolatedProduction = async () => {
  const result = requireReady(
    generateWorkspaceIsolatedServerFunctionExecutableProject(
      createGoldenG2AuthServerWorkspace('isolated-production'),
      { functionRef: GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF }
    ),
    'Isolated production code-export target'
  );
  const plan = result.snapshot.serverFunctionPlan;
  if (!plan) throw new Error('Golden isolated production plan is missing.');
  const root = await mkdtemp(join(process.cwd(), '.golden-g2-auth-server-'));
  try {
    for (const file of projectExecutableProjectRuntimeFiles(
      result.snapshot,
      'production'
    )) {
      const path = join(root, ...file.path.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.contents);
    }
    const bridgeRequest = Object.freeze({
      type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
      requestId: 'golden-isolated-owner:1',
      invocationId: 'golden-isolated-owner',
      attempt: 1,
      functionRef: GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF,
      input: Object.freeze({ routeId: GOLDEN_G2_AUTH_SERVER_IDS.route }),
    });
    await mkdir(join(root, '.prodivix'), { recursive: true });
    await writeFile(
      join(root, '.prodivix', 'server-function-invocation.json'),
      JSON.stringify(bridgeRequest)
    );
    const authority = createIsolatedServerFunctionAuthority({
      workspaceId: result.snapshot.workspace.workspaceId,
      snapshotId: result.snapshot.workspace.snapshotId,
      principal: Object.freeze({
        providerId: 'prodivix-product-session',
        principalId: 'golden-owner',
      }),
      permissions: Object.freeze(['workspace.owner']),
      expiresAt: Date.now() + 60_000,
    });
    const authorityPath = join(
      root,
      ...ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH.split('/')
    );
    await writeFile(authorityPath, JSON.stringify(authority), { mode: 0o600 });
    await execFileAsync(process.execPath, [plan.entrypointFilePath], {
      cwd: root,
      windowsHide: true,
    });
    let authorityConsumed = false;
    try {
      await readFile(authorityPath, 'utf8');
    } catch {
      authorityConsumed = true;
    }
    const serializedResponse = await readFile(
      join(root, '.prodivix', 'server-function-result.json'),
      'utf8'
    );
    const untrustedResponse = JSON.parse(serializedResponse) as unknown;
    const request = createExecutionRequest({
      requestId: 'golden-isolated-production-request',
      profile: 'production',
      runtimeZone: 'server',
      workspace: result.snapshot.workspace,
      invocation: {
        kind: 'code',
        targetRef: {
          kind: 'code-artifact',
          artifactId: GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF.artifactId,
        },
        entrypoint: GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF.exportName,
        input: bridgeRequest,
      },
      requiredCapabilities: ['server-function'],
    });
    const response = readIsolatedServerFunctionExecutionResponse(
      untrustedResponse,
      request,
      plan
    );
    if (!response) {
      throw new Error('Golden isolated production response was not trusted.');
    }
    const sourceArtifactIds = Object.freeze(
      [
        ...new Set(
          result.snapshot.files.flatMap(
            ({ sourceTrace }) =>
              sourceTrace
                ?.filter(({ sourceRef }) => sourceRef.kind === 'code-artifact')
                .map(({ sourceRef }) =>
                  sourceRef.kind === 'code-artifact'
                    ? sourceRef.artifactId
                    : undefined
                )
                .filter((value): value is string => value !== undefined) ?? []
          )
        ),
      ].sort()
    );
    return Object.freeze({
      snapshot: result.snapshot,
      response,
      serializedResponse,
      authority,
      authorityConsumed,
      sourceArtifactIds,
      bridgeRequest,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const runIsolatedSecretProduction = async () => {
  const result = requireReady(
    generateWorkspaceIsolatedServerFunctionExecutableProject(
      createGoldenG2AuthServerWorkspace('isolated-secret'),
      { functionRef: GOLDEN_G2_ISOLATED_SECRET_FUNCTION_REF }
    ),
    'Isolated production Secret code-export target'
  );
  const plan = result.snapshot.serverFunctionPlan;
  if (!plan)
    throw new Error('Golden isolated Secret production plan is missing.');
  const root = await mkdtemp(
    join(process.cwd(), '.golden-g2-auth-server-secret-')
  );
  try {
    for (const file of projectExecutableProjectRuntimeFiles(
      result.snapshot,
      'production'
    )) {
      const path = join(root, ...file.path.split('/'));
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, file.contents);
    }
    const bridgeRequest = Object.freeze({
      type: EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
      requestId: 'golden-isolated-secret:1',
      invocationId: 'golden-isolated-secret',
      attempt: 1,
      functionRef: GOLDEN_G2_ISOLATED_SECRET_FUNCTION_REF,
      input: Object.freeze({ routeId: GOLDEN_G2_AUTH_SERVER_IDS.route }),
    });
    await mkdir(join(root, '.prodivix'), { recursive: true });
    await writeFile(
      join(root, '.prodivix', 'server-function-invocation.json'),
      JSON.stringify(bridgeRequest)
    );
    const secretMaterialPath = join(
      root,
      ...ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH.split('/')
    );
    await writeFile(
      secretMaterialPath,
      JSON.stringify({
        format: ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
        fields: {
          signingKey: GOLDEN_G2_AUTH_SERVER_CREDENTIAL_CANARIES[3],
        },
      }),
      { mode: 0o600 }
    );
    await execFileAsync(process.execPath, [plan.entrypointFilePath], {
      cwd: root,
      windowsHide: true,
    });
    let secretMaterialConsumed = false;
    try {
      await readFile(secretMaterialPath, 'utf8');
    } catch {
      secretMaterialConsumed = true;
    }
    const serializedResponse = await readFile(
      join(root, '.prodivix', 'server-function-result.json'),
      'utf8'
    );
    const request = createExecutionRequest({
      requestId: 'golden-isolated-secret-production-request',
      profile: 'production',
      runtimeZone: 'server',
      workspace: result.snapshot.workspace,
      invocation: {
        kind: 'code',
        targetRef: {
          kind: 'code-artifact',
          artifactId: GOLDEN_G2_ISOLATED_SECRET_FUNCTION_REF.artifactId,
        },
        entrypoint: GOLDEN_G2_ISOLATED_SECRET_FUNCTION_REF.exportName,
        input: bridgeRequest,
      },
      requiredCapabilities: ['environment-binding', 'server-function'],
    });
    const response = readIsolatedServerFunctionExecutionResponse(
      JSON.parse(serializedResponse) as unknown,
      request,
      plan
    );
    if (!response)
      throw new Error(
        'Golden isolated Secret production response was not trusted.'
      );
    return Object.freeze({
      snapshot: result.snapshot,
      response,
      serializedResponse,
      secretMaterialConsumed,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

/** Runs the living Auth/Server contract through every currently valid G2 target cell. */
export const runGoldenG2AuthServerMatrix =
  async (): Promise<GoldenG2AuthServerMatrixReport> => {
    const remoteWorkspace = createGoldenG2AuthServerWorkspace('remote-live');
    const remoteSecretWorkspace =
      createGoldenG2AuthServerWorkspace('remote-secret');
    const isolatedWorkspace = createGoldenG2AuthServerWorkspace(
      'isolated-production'
    );
    const isolatedSecretWorkspace =
      createGoldenG2AuthServerWorkspace('isolated-secret');
    const browserStaticAuditedAdapter = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(remoteWorkspace),
      'Browser/static audited-adapter target'
    );
    const browserStaticCodeExport = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedWorkspace),
      'Browser/static code-export target'
    );
    const browserStaticSecretHmac = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(remoteSecretWorkspace),
      'Browser/static Secret HMAC target'
    );
    const browserStaticIsolatedSecret = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedSecretWorkspace),
      'Browser/static isolated Secret code-export target'
    );
    const deterministicTestSecretHmac = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(remoteSecretWorkspace, {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      }),
      'Deterministic Test Secret HMAC target'
    );
    const deterministicTestIsolatedSecret = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedSecretWorkspace, {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      }),
      'Deterministic Test isolated Secret code-export target'
    );
    const remoteLive = requireReady(
      generateWorkspaceReactViteExecutableProject(remoteWorkspace, {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }),
      'Remote live audited-adapter target'
    );
    const remoteLiveCodeExport = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedWorkspace, {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }),
      'Remote live code-export target'
    );
    const remoteLiveIsolatedSecret = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedSecretWorkspace, {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }),
      'Remote live isolated Secret code-export target'
    );
    const remoteLiveSecret = requireReady(
      generateWorkspaceReactViteExecutableProject(remoteSecretWorkspace, {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }),
      'Remote live Secret HMAC target'
    );
    const isolatedProductionAuditedAdapter = requireBlockedCodes(
      generateWorkspaceIsolatedServerFunctionExecutableProject(
        remoteWorkspace,
        { functionRef: GOLDEN_G2_REMOTE_OWNER_FUNCTION_REF }
      ),
      'Isolated production audited-adapter target'
    );
    const isolatedProductionSecretHmac = requireBlockedCodes(
      generateWorkspaceIsolatedServerFunctionExecutableProject(
        remoteSecretWorkspace,
        { functionRef: GOLDEN_G2_REMOTE_HMAC_FUNCTION_REF }
      ),
      'Isolated production Secret HMAC target'
    );
    const [deterministicTest, isolatedProduction, isolatedProductionSecret] =
      await Promise.all([
        runDeterministicTest(),
        runIsolatedProduction(),
        runIsolatedSecretProduction(),
      ]);
    const clientSnapshots = [
      remoteLive.snapshot,
      remoteLiveSecret.snapshot,
      deterministicTest.auditedAdapter.snapshot,
      deterministicTest.codeExport.snapshot,
    ];
    const allSnapshots = [
      ...clientSnapshots,
      isolatedProduction.snapshot,
      isolatedProductionSecret.snapshot,
    ];
    const clientText = clientSnapshots.map(snapshotText).join('\n');
    const snapshotSerialization = JSON.stringify(allSnapshots);
    const responseSerialization = [
      isolatedProduction.serializedResponse,
      isolatedProductionSecret.serializedResponse,
    ].join('\n');
    const sourceTraceSerialization = JSON.stringify(
      [isolatedProduction.snapshot, isolatedProductionSecret.snapshot].flatMap(
        (snapshot) =>
          snapshot.files.flatMap(({ sourceTrace }) => sourceTrace ?? [])
      )
    );
    const strictInvocationRejectsCredentialField =
      readExecutionServerFunctionBridgeRequest({
        ...isolatedProduction.bridgeRequest,
        accessToken: GOLDEN_G2_AUTH_SERVER_CREDENTIAL_CANARIES[0],
      }) === undefined;
    const strictAuthorityRejectsCredentialField =
      readIsolatedServerFunctionAuthority({
        ...isolatedProduction.authority,
        sessionId: GOLDEN_G2_AUTH_SERVER_CREDENTIAL_CANARIES[1],
      }) === undefined;
    return Object.freeze({
      targetMatrix,
      blockedDiagnostics: Object.freeze({
        browserStaticAuditedAdapter,
        browserStaticSecretHmac,
        browserStaticCodeExport,
        browserStaticIsolatedSecret,
        deterministicTestSecretHmac,
        deterministicTestIsolatedSecret,
        remoteLiveCodeExport,
        remoteLiveIsolatedSecret,
        isolatedProductionAuditedAdapter,
        isolatedProductionSecretHmac,
      }),
      deterministicTest: Object.freeze({
        auditedAdapterSnapshotDigest:
          deterministicTest.auditedAdapter.snapshot.contentDigest,
        codeExportSnapshotDigest:
          deterministicTest.codeExport.snapshot.contentDigest,
        outcomes: deterministicTest.outcomes,
        observationCount: deterministicTest.observationCount,
      }),
      remoteLive: Object.freeze({
        snapshot: remoteLive.snapshot,
        serverSourceExcluded: !snapshotText(remoteLive.snapshot).includes(
          GOLDEN_G2_AUTH_SERVER_SOURCE_CANARY
        ),
        requiresServerFunction:
          remoteLive.snapshot.capabilityRequirements.preview.includes(
            'server-function'
          ),
      }),
      remoteLiveSecret: Object.freeze({
        snapshot: remoteLiveSecret.snapshot,
        serverSourceExcluded: !snapshotText(remoteLiveSecret.snapshot).includes(
          GOLDEN_G2_AUTH_SERVER_SOURCE_CANARY
        ),
        requiresEnvironmentBinding:
          remoteLiveSecret.snapshot.capabilityRequirements.preview.includes(
            'environment-binding'
          ),
        requiresServerFunction:
          remoteLiveSecret.snapshot.capabilityRequirements.preview.includes(
            'server-function'
          ),
      }),
      isolatedProduction: Object.freeze({
        snapshot: isolatedProduction.snapshot,
        response: isolatedProduction.response,
        authorityConsumed: isolatedProduction.authorityConsumed,
        sourceArtifactIds: isolatedProduction.sourceArtifactIds,
      }),
      isolatedProductionSecret: Object.freeze({
        snapshot: isolatedProductionSecret.snapshot,
        response: isolatedProductionSecret.response,
        secretMaterialConsumed: isolatedProductionSecret.secretMaterialConsumed,
      }),
      boundary: Object.freeze({
        clientSnapshotsExcludeServerSource: !clientText.includes(
          GOLDEN_G2_AUTH_SERVER_SOURCE_CANARY
        ),
        snapshotsExcludeCredentialCanaries:
          !GOLDEN_G2_AUTH_SERVER_CREDENTIAL_CANARIES.some((canary) =>
            snapshotSerialization.includes(canary)
          ),
        responseExcludesCredentialAndSourceCanaries: ![
          ...GOLDEN_G2_AUTH_SERVER_CREDENTIAL_CANARIES,
          GOLDEN_G2_AUTH_SERVER_SOURCE_CANARY,
        ].some((canary) => responseSerialization.includes(canary)),
        sourceTraceExcludesSourceText: !sourceTraceSerialization.includes(
          GOLDEN_G2_AUTH_SERVER_SOURCE_CANARY
        ),
        strictInvocationRejectsCredentialField,
        strictAuthorityRejectsCredentialField,
      }),
    });
  };
