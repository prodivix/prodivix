import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import {
  DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
  EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
  createWorkspaceRuntimeFilesystemProposal,
  generateWorkspaceIsolatedServerFunctionExecutableProject,
  generateWorkspaceReactViteExecutableProject,
  generateWorkspaceVueViteExecutableProject,
} from '@prodivix/prodivix-compiler';
import {
  createExecutionRequest,
  createExecutionFilesystemDiff,
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshot,
} from '@prodivix/runtime-core';
import {
  createIsolatedServerFunctionAuthority,
  createServerFunctionInvocationTrace,
  createServerRouteActionInput,
  createServerRuntimeTestSession,
  decodeServerRuntimeTestInvocationTraces,
  decodeServerRuntimeProfile,
  encodeServerRuntimeTestInvocationTraces,
  EXECUTION_SERVER_FUNCTION_BRIDGE_REQUEST_TYPE,
  ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH,
  ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_FORMAT,
  ISOLATED_SERVER_FUNCTION_SECRET_MATERIAL_PATH,
  ISOLATED_SERVER_FUNCTION_SOURCE_MUTATION_DIRECTORY,
  readExecutionServerFunctionBridgeRequest,
  readIsolatedServerFunctionAuthority,
  readIsolatedServerFunctionExecutionResponse,
  readServerFunctionInvocationTraceValue,
  resolveServerFunctionDefinition,
  toExecutionServerFunctionBridgeSuccess,
  toServerFunctionInvocationTraceValue,
  type ExecutionServerFunctionBridgeResponse,
  type ServerFunctionDefinition,
  type ServerFunctionReference,
} from '@prodivix/server-runtime';
import {
  applyWorkspaceTransaction,
  createWorkspaceSourceMutationTransactionPlan,
  isWorkspaceCodeDocumentContent,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createGoldenG2AuthServerTestProvision,
  createGoldenG2AuthServerWorkspace,
  GOLDEN_G2_AUTH_SERVER_CREDENTIAL_CANARIES,
  GOLDEN_G2_AUTH_SERVER_IDS,
  GOLDEN_G2_AUTH_SERVER_SOURCE_CANARY,
  GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF,
  GOLDEN_G2_ISOLATED_READ_FUNCTION_REF,
  GOLDEN_G2_ISOLATED_READ_SECRET_FUNCTION_REF,
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
  | 'isolated-workspace-read-code-export'
  | 'isolated-secret-code-export'
  | 'isolated-workspace-read-secret-code-export'
  | 'isolated-project-source-mutation';

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
    browserStaticWorkspaceReadCodeExport: readonly string[];
    browserStaticIsolatedSecret: readonly string[];
    browserStaticWorkspaceReadSecret: readonly string[];
    browserStaticProjectSourceMutation: readonly string[];
    deterministicTestSecretHmac: readonly string[];
    deterministicTestIsolatedSecret: readonly string[];
    deterministicTestWorkspaceReadSecret: readonly string[];
    deterministicTestProjectSourceMutation: readonly string[];
    remoteLiveCodeExport: readonly string[];
    remoteLiveWorkspaceReadCodeExport: readonly string[];
    remoteLiveIsolatedSecret: readonly string[];
    remoteLiveWorkspaceReadSecret: readonly string[];
    remoteLiveProjectSourceMutation: readonly string[];
    isolatedProductionAuditedAdapter: readonly string[];
    isolatedProductionSecretHmac: readonly string[];
  }>;
  deterministicTest: Readonly<{
    auditedAdapterSnapshotDigest: string;
    codeExportSnapshotDigest: string;
    workspaceReadSnapshotDigest: string;
    vueAuditedAdapterSnapshotDigest: string;
    outcomes: readonly ['allow', 'allow', 'allow'];
    observationCount: number;
    invocationTraceCount: number;
    snapshotsRequireServerFunction: boolean;
    snapshotsProvisionServerRuntime: boolean;
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
  isolatedWorkspaceRead: Readonly<{
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
  isolatedWorkspaceReadSecret: Readonly<{
    snapshot: ExecutableProjectSnapshot;
    response: ExecutionServerFunctionBridgeResponse;
    authorityConsumed: boolean;
    secretMaterialConsumed: boolean;
  }>;
  isolatedProjectSourceMutation: Readonly<{
    snapshot: ExecutableProjectSnapshot;
    response: ExecutionServerFunctionBridgeResponse;
    authorityConsumed: boolean;
    targetArtifactId: string;
    workspaceUnchangedBeforeAdoption: boolean;
    eligibleChangeIds: readonly string[];
    adoptedTargetSource: string;
    actionSourceUnchanged: boolean;
    staleAdoptionBlocked: boolean;
  }>;
  boundary: Readonly<{
    clientSnapshotsExcludeServerSource: boolean;
    snapshotsExcludeCredentialCanaries: boolean;
    responseExcludesCredentialAndSourceCanaries: boolean;
    sourceTraceExcludesSourceText: boolean;
    strictInvocationRejectsCredentialField: boolean;
    strictAuthorityRejectsCredentialField: boolean;
    invocationTraceExcludesCredentialCanaries: boolean;
    strictInvocationTraceRejectsCredentialField: boolean;
  }>;
}>;

const targetMatrix: GoldenG2AuthServerTargetMatrix = Object.freeze({
  'browser-static': Object.freeze({
    'audited-owner-adapter': 'blocked',
    'audited-secret-hmac': 'blocked',
    'isolated-code-export': 'blocked',
    'isolated-workspace-read-code-export': 'blocked',
    'isolated-secret-code-export': 'blocked',
    'isolated-workspace-read-secret-code-export': 'blocked',
    'isolated-project-source-mutation': 'blocked',
  }),
  'deterministic-test': Object.freeze({
    'audited-owner-adapter': 'supported',
    'audited-secret-hmac': 'blocked',
    'isolated-code-export': 'supported',
    'isolated-workspace-read-code-export': 'supported',
    'isolated-secret-code-export': 'blocked',
    'isolated-workspace-read-secret-code-export': 'blocked',
    'isolated-project-source-mutation': 'blocked',
  }),
  'remote-live': Object.freeze({
    'audited-owner-adapter': 'supported',
    'audited-secret-hmac': 'supported',
    'isolated-code-export': 'blocked',
    'isolated-workspace-read-code-export': 'blocked',
    'isolated-secret-code-export': 'blocked',
    'isolated-workspace-read-secret-code-export': 'blocked',
    'isolated-project-source-mutation': 'blocked',
  }),
  'isolated-production': Object.freeze({
    'audited-owner-adapter': 'blocked',
    'audited-secret-hmac': 'blocked',
    'isolated-code-export': 'supported',
    'isolated-workspace-read-code-export': 'supported',
    'isolated-secret-code-export': 'supported',
    'isolated-workspace-read-secret-code-export': 'supported',
    'isolated-project-source-mutation': 'supported',
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

const GOLDEN_G2_SOURCE_MUTATION_ACTION_DOCUMENT =
  'code-golden-source-mutation-action';
const GOLDEN_G2_SOURCE_MUTATION_TARGET_DOCUMENT =
  'code-golden-source-mutation-target';
const GOLDEN_G2_SOURCE_MUTATION_REPLACEMENT =
  "export const projectSourceValue = 'Adopted from isolated execution.';\n";

const codeSource = (
  workspace: WorkspaceSnapshot,
  documentId: string
): string | undefined => {
  const document = workspace.docsById[documentId];
  return document?.type === 'code' &&
    isWorkspaceCodeDocumentContent(document.content)
    ? document.content.source
    : undefined;
};

const createGoldenG2SourceMutationWorkspace = () => {
  const workspace = createGoldenG2AuthServerWorkspace('isolated-production');
  const planned = createWorkspaceSourceMutationTransactionPlan({
    workspace,
    routeNodeId: GOLDEN_G2_AUTH_SERVER_IDS.route,
    actionDocumentId: GOLDEN_G2_SOURCE_MUTATION_ACTION_DOCUMENT,
    actionPath: '/server/golden-source-mutation.action.server.ts',
    targetDocumentId: GOLDEN_G2_SOURCE_MUTATION_TARGET_DOCUMENT,
    targetPath: '/server/golden-source-mutation.target.ts',
    transactionId: 'golden-source-mutation-authoring',
    issuedAt: '2026-07-19T08:30:00.000Z',
  });
  if (planned.status !== 'ready') {
    throw new Error(
      `Golden source mutation authoring failed: ${planned.message}`
    );
  }
  const applied = applyWorkspaceTransaction(
    workspace,
    planned.plan.transaction
  );
  if (!applied.ok) {
    throw new Error(
      `Golden source mutation transaction failed: ${JSON.stringify(applied.issues)}`
    );
  }
  return Object.freeze({
    workspace: applied.snapshot,
    functionRef: planned.plan.functionRef,
    actionDocumentId: planned.plan.actionDocumentId,
    targetDocumentId: planned.plan.targetDocumentId,
  });
};

const definitions = (): readonly [
  ServerFunctionDefinition,
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
  const isolatedRead = resolveServerFunctionDefinition(
    decoded.profile,
    GOLDEN_G2_ISOLATED_READ_FUNCTION_REF.artifactId,
    GOLDEN_G2_ISOLATED_READ_FUNCTION_REF.exportName
  );
  if (!remote || !isolated || !isolatedRead) {
    throw new Error('Golden Auth/Server definitions are incomplete.');
  }
  return Object.freeze([remote, isolated, isolatedRead]);
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
  const workspaceReadCodeExport = requireReady(
    generateWorkspaceReactViteExecutableProject(
      createGoldenG2AuthServerWorkspace('isolated-read'),
      {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
        serverRuntimeMockProvision: provision,
      }
    ),
    'Deterministic workspace.read code-export target'
  );
  const vueAuditedAdapter = requireReady(
    generateWorkspaceVueViteExecutableProject(
      createGoldenG2AuthServerWorkspace('remote-live'),
      {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
        serverRuntimeMockProvision: provision,
      }
    ),
    'Deterministic Vue audited-adapter target'
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
    const workspaceReadOutcome = await session.invoke({
      functionRef: GOLDEN_G2_ISOLATED_READ_FUNCTION_REF,
      invocationId: 'golden-test-isolated-read',
      attempt: 1,
      input,
    });
    if (
      auditedOutcome.kind !== 'allow' ||
      isolatedOutcome.kind !== 'allow' ||
      workspaceReadOutcome.kind !== 'allow'
    ) {
      throw new Error('Golden deterministic owner guards did not allow.');
    }
    return Object.freeze({
      auditedAdapter,
      codeExport,
      workspaceReadCodeExport,
      vueAuditedAdapter,
      outcomes: Object.freeze(['allow', 'allow', 'allow'] as const),
      observationCount: session.listObservations().length,
    });
  } finally {
    session.dispose();
  }
};

const runIsolatedProduction = async (input: {
  binding: 'isolated-production' | 'isolated-read';
  functionRef: ServerFunctionReference;
  invocationId: string;
  label: string;
  permissions: readonly string[];
}) => {
  const result = requireReady(
    generateWorkspaceIsolatedServerFunctionExecutableProject(
      createGoldenG2AuthServerWorkspace(input.binding),
      { functionRef: input.functionRef }
    ),
    input.label
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
      requestId: `${input.invocationId}:1`,
      invocationId: input.invocationId,
      attempt: 1,
      functionRef: input.functionRef,
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
      permissions: Object.freeze([...input.permissions]),
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
      requestId: `${input.invocationId}-production-request`,
      profile: 'production',
      runtimeZone: 'server',
      workspace: result.snapshot.workspace,
      invocation: {
        kind: 'code',
        targetRef: {
          kind: 'code-artifact',
          artifactId: input.functionRef.artifactId,
        },
        entrypoint: input.functionRef.exportName,
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

const runIsolatedSourceMutationProduction = async (input: {
  workspace: WorkspaceSnapshot;
  functionRef: ServerFunctionReference;
  actionDocumentId: string;
  targetDocumentId: string;
}) => {
  const result = requireReady(
    generateWorkspaceIsolatedServerFunctionExecutableProject(input.workspace, {
      functionRef: input.functionRef,
    }),
    'Isolated production project-source mutation target'
  );
  const plan = result.snapshot.serverFunctionPlan;
  if (!plan)
    throw new Error('Golden source mutation production plan is missing.');
  const targetFile = result.snapshot.files.find(
    ({ path, sourceTrace }) =>
      path.startsWith(
        `${ISOLATED_SERVER_FUNCTION_SOURCE_MUTATION_DIRECTORY}/`
      ) &&
      sourceTrace?.length === 1 &&
      sourceTrace[0]?.sourceRef.kind === 'code-artifact' &&
      sourceTrace[0].sourceRef.artifactId === input.targetDocumentId
  );
  if (!targetFile?.sourceTrace) {
    throw new Error('Golden source mutation staging target is missing.');
  }
  const initialTargetSource = codeSource(
    input.workspace,
    input.targetDocumentId
  );
  const initialActionSource = codeSource(
    input.workspace,
    input.actionDocumentId
  );
  if (initialTargetSource === undefined || initialActionSource === undefined) {
    throw new Error('Golden source mutation canonical source is missing.');
  }
  const root = await mkdtemp(
    join(process.cwd(), '.golden-g2-auth-server-source-mutation-')
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
      requestId: 'golden-isolated-source-mutation:1',
      invocationId: 'golden-isolated-source-mutation',
      attempt: 1,
      functionRef: input.functionRef,
      input: createServerRouteActionInput({
        route: {
          routeNodeId: GOLDEN_G2_AUTH_SERVER_IDS.route,
          currentPath: '/',
          matchedPath: '/',
          params: {},
          searchParams: {},
        },
        submission: {
          method: 'PATCH',
          encType: 'application/json',
          value: { source: GOLDEN_G2_SOURCE_MUTATION_REPLACEMENT },
        },
      }),
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
      permissions: Object.freeze([
        'workspace.owner',
        'workspace.read',
        'workspace.write',
      ]),
      expiresAt: Date.now() + 60_000,
    });
    const authorityPath = join(
      root,
      ...ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH.split('/')
    );
    await writeFile(authorityPath, JSON.stringify(authority), { mode: 0o600 });
    const targetPath = join(root, ...targetFile.path.split('/'));
    const baseline = new Uint8Array(await readFile(targetPath));
    await execFileAsync(process.execPath, [plan.entrypointFilePath], {
      cwd: root,
      windowsHide: true,
    });
    const runtime = new Uint8Array(await readFile(targetPath));
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
    const request = createExecutionRequest({
      requestId: 'golden-isolated-source-mutation-production-request',
      profile: 'production',
      runtimeZone: 'server',
      workspace: result.snapshot.workspace,
      invocation: {
        kind: 'code',
        targetRef: {
          kind: 'code-artifact',
          artifactId: input.functionRef.artifactId,
        },
        entrypoint: input.functionRef.exportName,
        input: bridgeRequest,
      },
      requiredCapabilities: ['server-function'],
    });
    const response = readIsolatedServerFunctionExecutionResponse(
      JSON.parse(serializedResponse) as unknown,
      request,
      plan
    );
    if (!response) {
      throw new Error('Golden source mutation response was not trusted.');
    }
    const diff = createExecutionFilesystemDiff({
      snapshotDigest: result.snapshot.contentDigest,
      workspace: result.snapshot.workspace,
      capturedAt: Date.parse('2026-07-19T08:31:00.000Z'),
      complete: true,
      changes: [
        {
          kind: 'modified',
          path: targetFile.path,
          baseline: { contents: baseline },
          runtime: { contents: runtime },
          sourceTrace: targetFile.sourceTrace,
        },
      ],
    });
    const changeId = diff.changes[0]?.changeId;
    if (!changeId) throw new Error('Golden source mutation diff is empty.');
    const proposal = createWorkspaceRuntimeFilesystemProposal({
      workspace: input.workspace,
      diff,
      selectedChangeIds: [changeId],
      transactionId: 'golden-source-mutation-adoption',
      issuedAt: '2026-07-19T08:32:00.000Z',
    });
    if (proposal.status !== 'ready') {
      throw new Error(
        `Golden source mutation adoption was blocked: ${proposal.reason}`
      );
    }
    const workspaceUnchangedBeforeAdoption =
      codeSource(input.workspace, input.targetDocumentId) ===
      initialTargetSource;
    const adopted = applyWorkspaceTransaction(
      input.workspace,
      proposal.transaction
    );
    if (!adopted.ok) {
      throw new Error(
        `Golden source mutation adoption failed: ${JSON.stringify(adopted.issues)}`
      );
    }
    const currentTarget = input.workspace.docsById[input.targetDocumentId];
    if (!currentTarget)
      throw new Error('Golden source mutation target vanished.');
    const staleWorkspace: WorkspaceSnapshot = {
      ...input.workspace,
      workspaceRev: input.workspace.workspaceRev + 1,
      docsById: {
        ...input.workspace.docsById,
        [input.targetDocumentId]: {
          ...currentTarget,
          contentRev: currentTarget.contentRev + 1,
        },
      },
    };
    const staleProposal = createWorkspaceRuntimeFilesystemProposal({
      workspace: staleWorkspace,
      diff,
      selectedChangeIds: [changeId],
      transactionId: 'golden-source-mutation-stale-adoption',
      issuedAt: '2026-07-19T08:33:00.000Z',
    });
    return Object.freeze({
      snapshot: result.snapshot,
      response,
      serializedResponse,
      authorityConsumed,
      targetArtifactId: input.targetDocumentId,
      workspaceUnchangedBeforeAdoption,
      eligibleChangeIds: proposal.analysis.eligibleChangeIds,
      adoptedTargetSource: codeSource(adopted.snapshot, input.targetDocumentId),
      actionSourceUnchanged:
        codeSource(adopted.snapshot, input.actionDocumentId) ===
        initialActionSource,
      staleAdoptionBlocked:
        staleProposal.status === 'blocked' &&
        staleProposal.analysis.entries[0]?.reason === 'stale-content-revision',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const runIsolatedSecretProduction = async (input: {
  binding: 'isolated-secret' | 'isolated-read-secret';
  functionRef: ServerFunctionReference;
  invocationId: string;
  label: string;
  permissions?: readonly string[];
}) => {
  const result = requireReady(
    generateWorkspaceIsolatedServerFunctionExecutableProject(
      createGoldenG2AuthServerWorkspace(input.binding),
      { functionRef: input.functionRef }
    ),
    input.label
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
      requestId: `${input.invocationId}:1`,
      invocationId: input.invocationId,
      attempt: 1,
      functionRef: input.functionRef,
      input: Object.freeze({ routeId: GOLDEN_G2_AUTH_SERVER_IDS.route }),
    });
    await mkdir(join(root, '.prodivix'), { recursive: true });
    await writeFile(
      join(root, '.prodivix', 'server-function-invocation.json'),
      JSON.stringify(bridgeRequest)
    );
    const authorityPath = join(
      root,
      ...ISOLATED_SERVER_FUNCTION_AUTHORITY_PATH.split('/')
    );
    if (input.permissions) {
      await writeFile(
        authorityPath,
        JSON.stringify(
          createIsolatedServerFunctionAuthority({
            workspaceId: result.snapshot.workspace.workspaceId,
            snapshotId: result.snapshot.workspace.snapshotId,
            principal: Object.freeze({
              providerId: 'prodivix-product-session',
              principalId: 'golden-owner',
            }),
            permissions: Object.freeze([...input.permissions]),
            expiresAt: Date.now() + 60_000,
          })
        ),
        { mode: 0o600 }
      );
    }
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
    let authorityConsumed = input.permissions === undefined;
    if (input.permissions) {
      try {
        await readFile(authorityPath, 'utf8');
      } catch {
        authorityConsumed = true;
      }
    }
    const serializedResponse = await readFile(
      join(root, '.prodivix', 'server-function-result.json'),
      'utf8'
    );
    const request = createExecutionRequest({
      requestId: `${input.invocationId}-production-request`,
      profile: 'production',
      runtimeZone: 'server',
      workspace: result.snapshot.workspace,
      invocation: {
        kind: 'code',
        targetRef: {
          kind: 'code-artifact',
          artifactId: input.functionRef.artifactId,
        },
        entrypoint: input.functionRef.exportName,
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
      authorityConsumed,
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
    const isolatedWorkspaceRead =
      createGoldenG2AuthServerWorkspace('isolated-read');
    const isolatedSecretWorkspace =
      createGoldenG2AuthServerWorkspace('isolated-secret');
    const isolatedReadSecretWorkspace = createGoldenG2AuthServerWorkspace(
      'isolated-read-secret'
    );
    const isolatedSourceMutation = createGoldenG2SourceMutationWorkspace();
    const browserStaticAuditedAdapter = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(remoteWorkspace),
      'Browser/static audited-adapter target'
    );
    const browserStaticCodeExport = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedWorkspace),
      'Browser/static code-export target'
    );
    const browserStaticWorkspaceReadCodeExport = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedWorkspaceRead),
      'Browser/static workspace.read code-export target'
    );
    const browserStaticSecretHmac = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(remoteSecretWorkspace),
      'Browser/static Secret HMAC target'
    );
    const browserStaticIsolatedSecret = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedSecretWorkspace),
      'Browser/static isolated Secret code-export target'
    );
    const browserStaticWorkspaceReadSecret = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedReadSecretWorkspace),
      'Browser/static workspace.read Secret code-export target'
    );
    const browserStaticProjectSourceMutation = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(
        isolatedSourceMutation.workspace
      ),
      'Browser/static project-source mutation target'
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
    const deterministicTestWorkspaceReadSecret = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedReadSecretWorkspace, {
        serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET,
      }),
      'Deterministic Test workspace.read Secret code-export target'
    );
    const deterministicTestProjectSourceMutation = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(
        isolatedSourceMutation.workspace,
        { serverRuntimeTarget: DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET }
      ),
      'Deterministic Test project-source mutation target'
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
    const remoteLiveWorkspaceReadCodeExport = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedWorkspaceRead, {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }),
      'Remote live workspace.read code-export target'
    );
    const remoteLiveIsolatedSecret = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedSecretWorkspace, {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }),
      'Remote live isolated Secret code-export target'
    );
    const remoteLiveWorkspaceReadSecret = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(isolatedReadSecretWorkspace, {
        serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
      }),
      'Remote live workspace.read Secret code-export target'
    );
    const remoteLiveProjectSourceMutation = requireBlockedCodes(
      generateWorkspaceReactViteExecutableProject(
        isolatedSourceMutation.workspace,
        { serverRuntimeTarget: EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET }
      ),
      'Remote live project-source mutation target'
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
    const [
      deterministicTest,
      isolatedProduction,
      isolatedWorkspaceReadProduction,
      isolatedProductionSecret,
      isolatedWorkspaceReadSecret,
      isolatedProjectSourceMutation,
    ] = await Promise.all([
      runDeterministicTest(),
      runIsolatedProduction({
        binding: 'isolated-production',
        functionRef: GOLDEN_G2_ISOLATED_OWNER_FUNCTION_REF,
        invocationId: 'golden-isolated-owner',
        label: 'Isolated production owner code-export target',
        permissions: ['workspace.owner', 'workspace.read'],
      }),
      runIsolatedProduction({
        binding: 'isolated-read',
        functionRef: GOLDEN_G2_ISOLATED_READ_FUNCTION_REF,
        invocationId: 'golden-isolated-read',
        label: 'Isolated production workspace.read code-export target',
        permissions: ['workspace.owner', 'workspace.read'],
      }),
      runIsolatedSecretProduction({
        binding: 'isolated-secret',
        functionRef: GOLDEN_G2_ISOLATED_SECRET_FUNCTION_REF,
        invocationId: 'golden-isolated-secret',
        label: 'Isolated production Secret code-export target',
      }),
      runIsolatedSecretProduction({
        binding: 'isolated-read-secret',
        functionRef: GOLDEN_G2_ISOLATED_READ_SECRET_FUNCTION_REF,
        invocationId: 'golden-isolated-read-secret',
        label: 'Isolated production workspace.read Secret code-export target',
        permissions: ['workspace.owner', 'workspace.read'],
      }),
      runIsolatedSourceMutationProduction(isolatedSourceMutation),
    ]);
    const clientSnapshots = [
      remoteLive.snapshot,
      remoteLiveSecret.snapshot,
      deterministicTest.auditedAdapter.snapshot,
      deterministicTest.codeExport.snapshot,
      deterministicTest.workspaceReadCodeExport.snapshot,
      deterministicTest.vueAuditedAdapter.snapshot,
    ];
    const allSnapshots = [
      ...clientSnapshots,
      isolatedProduction.snapshot,
      isolatedWorkspaceReadProduction.snapshot,
      isolatedProductionSecret.snapshot,
      isolatedWorkspaceReadSecret.snapshot,
      isolatedProjectSourceMutation.snapshot,
    ];
    const clientText = clientSnapshots.map(snapshotText).join('\n');
    const snapshotSerialization = JSON.stringify(allSnapshots);
    const responseSerialization = [
      isolatedProduction.serializedResponse,
      isolatedWorkspaceReadProduction.serializedResponse,
      isolatedProductionSecret.serializedResponse,
      isolatedWorkspaceReadSecret.serializedResponse,
      isolatedProjectSourceMutation.serializedResponse,
    ].join('\n');
    const sourceTraceSerialization = JSON.stringify(
      [
        isolatedProduction.snapshot,
        isolatedWorkspaceReadProduction.snapshot,
        isolatedProductionSecret.snapshot,
        isolatedWorkspaceReadSecret.snapshot,
        isolatedProjectSourceMutation.snapshot,
      ].flatMap((snapshot) =>
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
    const invocationTraceRequest = Object.freeze({
      requestId: 'golden-test-trace:1',
      invocationId: 'golden-test-trace',
      attempt: 1,
      functionRef: GOLDEN_G2_REMOTE_OWNER_FUNCTION_REF,
      input: Object.freeze({
        authorization: GOLDEN_G2_AUTH_SERVER_CREDENTIAL_CANARIES[0],
      }),
    });
    const invocationTrace = createServerFunctionInvocationTrace({
      request: invocationTraceRequest,
      response: toExecutionServerFunctionBridgeSuccess(
        invocationTraceRequest.requestId,
        {
          kind: 'value',
          value: {
            privateValue: GOLDEN_G2_AUTH_SERVER_CREDENTIAL_CANARIES[1],
          },
        }
      ),
      startedAt: 1_000,
      completedAt: 1_012,
    });
    const invocationTraceWire = encodeServerRuntimeTestInvocationTraces([
      invocationTrace,
    ]);
    const decodedInvocationTraces =
      decodeServerRuntimeTestInvocationTraces(invocationTraceWire);
    const invocationTraceSerialization = new TextDecoder().decode(
      invocationTraceWire
    );
    const strictInvocationTraceRejectsCredentialField =
      readServerFunctionInvocationTraceValue({
        ...(toServerFunctionInvocationTraceValue(invocationTrace) as Readonly<
          Record<string, unknown>
        >),
        accessToken: GOLDEN_G2_AUTH_SERVER_CREDENTIAL_CANARIES[2],
      }) === undefined;
    return Object.freeze({
      targetMatrix,
      blockedDiagnostics: Object.freeze({
        browserStaticAuditedAdapter,
        browserStaticSecretHmac,
        browserStaticCodeExport,
        browserStaticWorkspaceReadCodeExport,
        browserStaticIsolatedSecret,
        browserStaticWorkspaceReadSecret,
        browserStaticProjectSourceMutation,
        deterministicTestSecretHmac,
        deterministicTestIsolatedSecret,
        deterministicTestWorkspaceReadSecret,
        deterministicTestProjectSourceMutation,
        remoteLiveCodeExport,
        remoteLiveWorkspaceReadCodeExport,
        remoteLiveIsolatedSecret,
        remoteLiveWorkspaceReadSecret,
        remoteLiveProjectSourceMutation,
        isolatedProductionAuditedAdapter,
        isolatedProductionSecretHmac,
      }),
      deterministicTest: Object.freeze({
        auditedAdapterSnapshotDigest:
          deterministicTest.auditedAdapter.snapshot.contentDigest,
        codeExportSnapshotDigest:
          deterministicTest.codeExport.snapshot.contentDigest,
        workspaceReadSnapshotDigest:
          deterministicTest.workspaceReadCodeExport.snapshot.contentDigest,
        vueAuditedAdapterSnapshotDigest:
          deterministicTest.vueAuditedAdapter.snapshot.contentDigest,
        outcomes: deterministicTest.outcomes,
        observationCount: deterministicTest.observationCount,
        invocationTraceCount: decodedInvocationTraces.length,
        snapshotsRequireServerFunction: [
          deterministicTest.auditedAdapter.snapshot,
          deterministicTest.codeExport.snapshot,
          deterministicTest.workspaceReadCodeExport.snapshot,
          deterministicTest.vueAuditedAdapter.snapshot,
        ].every((snapshot) =>
          snapshot.capabilityRequirements.test.includes('server-function')
        ),
        snapshotsProvisionServerRuntime: [
          deterministicTest.auditedAdapter.snapshot,
          deterministicTest.codeExport.snapshot,
          deterministicTest.workspaceReadCodeExport.snapshot,
          deterministicTest.vueAuditedAdapter.snapshot,
        ].every((snapshot) => Boolean(snapshot.serverRuntimeMockProvision)),
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
      isolatedWorkspaceRead: Object.freeze({
        snapshot: isolatedWorkspaceReadProduction.snapshot,
        response: isolatedWorkspaceReadProduction.response,
        authorityConsumed: isolatedWorkspaceReadProduction.authorityConsumed,
        sourceArtifactIds: isolatedWorkspaceReadProduction.sourceArtifactIds,
      }),
      isolatedProductionSecret: Object.freeze({
        snapshot: isolatedProductionSecret.snapshot,
        response: isolatedProductionSecret.response,
        secretMaterialConsumed: isolatedProductionSecret.secretMaterialConsumed,
      }),
      isolatedWorkspaceReadSecret: Object.freeze({
        snapshot: isolatedWorkspaceReadSecret.snapshot,
        response: isolatedWorkspaceReadSecret.response,
        authorityConsumed: isolatedWorkspaceReadSecret.authorityConsumed,
        secretMaterialConsumed:
          isolatedWorkspaceReadSecret.secretMaterialConsumed,
      }),
      isolatedProjectSourceMutation: Object.freeze({
        snapshot: isolatedProjectSourceMutation.snapshot,
        response: isolatedProjectSourceMutation.response,
        authorityConsumed: isolatedProjectSourceMutation.authorityConsumed,
        targetArtifactId: isolatedProjectSourceMutation.targetArtifactId,
        workspaceUnchangedBeforeAdoption:
          isolatedProjectSourceMutation.workspaceUnchangedBeforeAdoption,
        eligibleChangeIds: isolatedProjectSourceMutation.eligibleChangeIds,
        adoptedTargetSource:
          isolatedProjectSourceMutation.adoptedTargetSource ?? '',
        actionSourceUnchanged:
          isolatedProjectSourceMutation.actionSourceUnchanged,
        staleAdoptionBlocked:
          isolatedProjectSourceMutation.staleAdoptionBlocked,
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
        invocationTraceExcludesCredentialCanaries:
          !GOLDEN_G2_AUTH_SERVER_CREDENTIAL_CANARIES.some((canary) =>
            invocationTraceSerialization.includes(canary)
          ),
        strictInvocationTraceRejectsCredentialField,
      }),
    });
  };
