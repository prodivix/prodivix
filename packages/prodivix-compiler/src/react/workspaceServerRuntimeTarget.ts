import {
  decodeServerRuntimeProfile,
  normalizeServerRuntimeTestProvision,
  PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID,
  resolveServerFunctionDefinition,
  SERVER_RUNTIME_PROFILE_METADATA_KEY,
  type ServerFunctionDefinition,
  type ServerRuntimeTestProvision,
} from '@prodivix/server-runtime';
import {
  readWorkspaceServerRuntimeAuthConfiguration,
  type WorkspaceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { CompileDiagnostic } from '#src/core/diagnostics';
import type { ExportRouteRuntimeRef, ExportRouteTopology } from '#src/export';

export const WORKSPACE_SERVER_RUNTIME_TARGET_FORMAT =
  'prodivix.workspace-server-runtime-target.v1' as const;

export type WorkspaceServerRuntimeTarget = Readonly<{
  format: typeof WORKSPACE_SERVER_RUNTIME_TARGET_FORMAT;
  kind: 'static-client' | 'execution-parent-gateway' | 'deterministic-test';
  serverGateway:
    | 'none'
    | 'execution-server-function-gateway-message-v1'
    | 'deterministic-test-fixture-v1';
  authProvider:
    'none' | 'prodivix-product-session' | 'deterministic-test-principal';
}>;

export const STATIC_CLIENT_SERVER_RUNTIME_TARGET: WorkspaceServerRuntimeTarget =
  Object.freeze({
    format: WORKSPACE_SERVER_RUNTIME_TARGET_FORMAT,
    kind: 'static-client',
    serverGateway: 'none',
    authProvider: 'none',
  });

export const EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET: WorkspaceServerRuntimeTarget =
  Object.freeze({
    format: WORKSPACE_SERVER_RUNTIME_TARGET_FORMAT,
    kind: 'execution-parent-gateway',
    serverGateway: 'execution-server-function-gateway-message-v1',
    authProvider: 'prodivix-product-session',
  });

export const DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET: WorkspaceServerRuntimeTarget =
  Object.freeze({
    format: WORKSPACE_SERVER_RUNTIME_TARGET_FORMAT,
    kind: 'deterministic-test',
    serverGateway: 'deterministic-test-fixture-v1',
    authProvider: 'deterministic-test-principal',
  });

export type WorkspaceServerRuntimeBinding = Readonly<{
  routeNodeId: string;
  routeKind: ExportRouteRuntimeRef['kind'];
  definition: ServerFunctionDefinition;
  documentPath: string;
}>;

export type WorkspaceServerRuntimeRequirements = Readonly<{
  functionCount: number;
  routeNodeCount: number;
  requiresServerGateway: boolean;
  requiresEnvironmentBinding: boolean;
  requiresProductAuth: boolean;
  requiresDeterministicTestRuntime: boolean;
}>;

export type WorkspaceServerRuntimeTargetAnalysis = Readonly<{
  target: WorkspaceServerRuntimeTarget;
  serverArtifactIds: readonly string[];
  bindings: readonly WorkspaceServerRuntimeBinding[];
  requirements: WorkspaceServerRuntimeRequirements;
  diagnostics: readonly CompileDiagnostic[];
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const normalizeTarget = (
  value: WorkspaceServerRuntimeTarget | undefined
): WorkspaceServerRuntimeTarget => {
  if (value === undefined) return STATIC_CLIENT_SERVER_RUNTIME_TARGET;
  const keys = Object.keys(value).sort(compareText).join('\0');
  if (
    keys !==
      ['authProvider', 'format', 'kind', 'serverGateway']
        .sort(compareText)
        .join('\0') ||
    value.format !== WORKSPACE_SERVER_RUNTIME_TARGET_FORMAT
  ) {
    throw new TypeError('Workspace Server runtime target is invalid.');
  }
  if (
    value.kind === 'static-client' &&
    value.serverGateway === 'none' &&
    value.authProvider === 'none'
  ) {
    return STATIC_CLIENT_SERVER_RUNTIME_TARGET;
  }
  if (
    value.kind === 'execution-parent-gateway' &&
    value.serverGateway === 'execution-server-function-gateway-message-v1' &&
    value.authProvider === 'prodivix-product-session'
  ) {
    return EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET;
  }
  if (
    value.kind === 'deterministic-test' &&
    value.serverGateway === 'deterministic-test-fixture-v1' &&
    value.authProvider === 'deterministic-test-principal'
  ) {
    return DETERMINISTIC_TEST_SERVER_RUNTIME_TARGET;
  }
  throw new TypeError('Workspace Server runtime target is unsupported.');
};

const expectedFunctionKind = (
  kind: ExportRouteRuntimeRef['kind']
): ServerFunctionDefinition['kind'] => `route-${kind}`;

const supportedBackendAdapter = (
  definition: ServerFunctionDefinition
): boolean => {
  if (
    definition.adapterId === 'core.auth.current-principal' &&
    definition.kind === 'route-loader' &&
    definition.runtimeZone === 'server' &&
    definition.effect === 'read' &&
    definition.environment === undefined
  ) {
    return (
      definition.auth.kind === 'authenticated' ||
      (definition.auth.kind === 'permission' &&
        definition.auth.permissionId === 'workspace.owner')
    );
  }
  if (
    definition.adapterId === 'core.server.execution-state.put' &&
    definition.kind === 'route-action' &&
    definition.runtimeZone === 'server' &&
    definition.effect === 'mutation' &&
    definition.auth.kind === 'authenticated' &&
    definition.environment === undefined
  ) {
    return definition.idempotency?.kind === 'invocation-key';
  }
  if (
    definition.adapterId === 'core.server.hmac-sha256' &&
    definition.kind === 'route-action' &&
    definition.runtimeZone === 'server' &&
    definition.effect === 'read' &&
    definition.auth.kind === 'authenticated' &&
    definition.idempotency === undefined
  ) {
    const secretsByField = definition.environment?.secretsByField;
    return (
      secretsByField !== undefined &&
      Object.keys(secretsByField).length === 1 &&
      secretsByField.key?.bindingId !== undefined
    );
  }
  return (
    definition.adapterId === 'core.auth.require-workspace-owner' &&
    definition.kind === 'route-guard' &&
    definition.runtimeZone === 'server' &&
    definition.effect === 'read' &&
    definition.auth.kind === 'permission' &&
    definition.auth.permissionId === 'workspace.owner' &&
    definition.environment === undefined
  );
};

const readCodeDocument = (
  workspace: WorkspaceSnapshot,
  artifactId: string
): WorkspaceDocument | undefined => {
  const document = workspace.docsById[artifactId];
  return document?.type === 'code' ? document : undefined;
};

/** Treats the whole profiled Code document as server-owned so no sibling source leaks into client output. */
export const isWorkspaceServerRuntimeDocument = (
  document: WorkspaceDocument
): boolean => {
  if (
    document.type !== 'code' ||
    !document.content ||
    typeof document.content !== 'object' ||
    Array.isArray(document.content)
  ) {
    return false;
  }
  const metadata = (document.content as Readonly<Record<string, unknown>>)
    .metadata;
  return Boolean(
    metadata &&
    typeof metadata === 'object' &&
    !Array.isArray(metadata) &&
    Object.hasOwn(metadata, SERVER_RUNTIME_PROFILE_METADATA_KEY)
  );
};

/** Partitions route CodeReferences without ever importing server-owned source into the client graph. */
export const analyzeWorkspaceServerRuntimeTarget = (
  workspace: WorkspaceSnapshot,
  routeTopology: ExportRouteTopology,
  requestedTarget?: WorkspaceServerRuntimeTarget,
  requestedTestProvision?: ServerRuntimeTestProvision
): WorkspaceServerRuntimeTargetAnalysis => {
  const target = normalizeTarget(requestedTarget);
  const diagnostics: CompileDiagnostic[] = [];
  const authConfigurationRead =
    readWorkspaceServerRuntimeAuthConfiguration(workspace);
  let testProvision: ServerRuntimeTestProvision | undefined;
  let invalidTestProvision = false;
  if (
    target.kind === 'deterministic-test' &&
    requestedTestProvision !== undefined
  ) {
    try {
      testProvision = normalizeServerRuntimeTestProvision(
        requestedTestProvision
      );
    } catch {
      invalidTestProvision = true;
      diagnostics.push({
        code: 'WKS-EXPORT-SERVER-TEST-PROVISION-INVALID',
        severity: 'error',
        source: 'export',
        message:
          'Deterministic Server Runtime Test requires one valid execution-only fixture provision.',
        path: '/execution/serverRuntimeMockProvision',
      });
    }
  }
  const bindings: WorkspaceServerRuntimeBinding[] = [];
  const serverArtifactIds = Object.values(workspace.docsById)
    .filter(isWorkspaceServerRuntimeDocument)
    .map((document) => document.id)
    .sort(compareText);

  [...routeTopology.runtimeRefs]
    .sort(
      (left, right) =>
        compareText(left.routeNodeId, right.routeNodeId) ||
        compareText(left.kind, right.kind) ||
        compareText(left.artifactId, right.artifactId)
    )
    .forEach((reference) => {
      const document = readCodeDocument(workspace, reference.artifactId);
      if (
        !document ||
        !document.content ||
        typeof document.content !== 'object'
      ) {
        return;
      }
      const content = document.content as Readonly<Record<string, unknown>>;
      if (
        typeof content.language !== 'string' ||
        (content.language !== 'ts' && content.language !== 'js')
      ) {
        return;
      }
      const metadata =
        content.metadata &&
        typeof content.metadata === 'object' &&
        !Array.isArray(content.metadata)
          ? (content.metadata as Readonly<Record<string, unknown>>)
          : undefined;
      const decoded = decodeServerRuntimeProfile(metadata, content.language);
      if (decoded.status === 'absent') return;
      if (decoded.status === 'invalid') {
        diagnostics.push({
          code: 'WKS-EXPORT-SERVER-PROFILE-INVALID',
          severity: 'error',
          source: 'export',
          message: 'The referenced Server runtime profile is invalid.',
          path: document.path,
        });
        return;
      }
      if (!reference.exportName) {
        diagnostics.push({
          code: 'WKS-EXPORT-SERVER-EXPORT-REQUIRED',
          severity: 'error',
          source: 'export',
          message: `Route ${reference.routeNodeId} must name the Server Function export explicitly.`,
          path: `/routeManifest/runtime/${reference.routeNodeId}/${reference.kind}`,
        });
        return;
      }
      const definition = resolveServerFunctionDefinition(
        decoded.profile,
        reference.artifactId,
        reference.exportName
      );
      if (!definition) {
        diagnostics.push({
          code: 'WKS-EXPORT-SERVER-DEFINITION-MISSING',
          severity: 'error',
          source: 'export',
          message: `Route ${reference.routeNodeId} references a Server Function export that is not declared by its canonical profile.`,
          path: `/routeManifest/runtime/${reference.routeNodeId}/${reference.kind}`,
        });
        return;
      }
      if (definition.kind !== expectedFunctionKind(reference.kind)) {
        diagnostics.push({
          code: 'WKS-EXPORT-SERVER-SLOT-MISMATCH',
          severity: 'error',
          source: 'export',
          message: `Route ${reference.routeNodeId} ${reference.kind} does not match the Server Function kind.`,
          path: `/routeManifest/runtime/${reference.routeNodeId}/${reference.kind}`,
        });
        return;
      }
      bindings.push(
        Object.freeze({
          routeNodeId: reference.routeNodeId,
          routeKind: reference.kind,
          definition,
          documentPath: document.path,
        })
      );
      if (definition.auth.kind !== 'public') {
        if (authConfigurationRead.status === 'invalid') {
          const issue = authConfigurationRead.issues[0];
          diagnostics.push({
            code: 'WKS-EXPORT-SERVER-AUTH-CONFIG-INVALID',
            severity: 'error',
            source: 'export',
            message:
              issue?.message ??
              'Protected Server Functions require a valid Auth configuration.',
            path: issue?.path ?? '/config/auth.json',
          });
        } else if (!authConfigurationRead.configuration) {
          diagnostics.push({
            code: 'WKS-EXPORT-SERVER-AUTH-CONFIG-REQUIRED',
            severity: 'error',
            source: 'export',
            message:
              'Protected Server Functions require the canonical /config/auth.json declaration.',
            path: '/config/auth.json',
          });
        } else {
          if (
            target.kind === 'execution-parent-gateway' &&
            authConfigurationRead.configuration.providerId !==
              PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID
          ) {
            diagnostics.push({
              code: 'WKS-EXPORT-SERVER-AUTH-PROVIDER-UNSUPPORTED',
              severity: 'error',
              source: 'export',
              message: `The Remote gateway does not support Auth provider ${authConfigurationRead.configuration.providerId}.`,
              path: '/config/auth.json/providerId',
            });
          }
          if (
            definition.auth.kind === 'permission' &&
            !authConfigurationRead.configuration.permissionIds.includes(
              definition.auth.permissionId
            )
          ) {
            diagnostics.push({
              code: 'WKS-EXPORT-SERVER-PERMISSION-UNDECLARED',
              severity: 'error',
              source: 'export',
              message: `Server Function permission is not declared by /config/auth.json: ${definition.auth.permissionId}.`,
              path: '/config/auth.json/permissionIds',
            });
          }
        }
      }
      if (target.serverGateway === 'none') {
        diagnostics.push({
          code: 'WKS-EXPORT-SERVER-GATEWAY-REQUIRED',
          severity: 'error',
          source: 'export',
          message:
            'Server Function execution requires an explicit authenticated server gateway target.',
          path: document.path,
          suggestion:
            'Select Remote Preview with the execution Server Function gateway.',
        });
        return;
      }
      if (
        definition.environment !== undefined &&
        target.kind !== 'execution-parent-gateway'
      ) {
        diagnostics.push({
          code: 'WKS-EXPORT-SERVER-ENVIRONMENT-UNSUPPORTED',
          severity: 'error',
          source: 'export',
          message:
            'Secret-bound Server Functions require the audited Remote live environment gateway.',
          path: document.path,
          suggestion:
            'Select Remote Preview with a live Environment snapshot; deterministic Test and static output do not resolve Secrets.',
        });
      }
      if (
        target.kind === 'execution-parent-gateway' &&
        !supportedBackendAdapter(definition)
      ) {
        diagnostics.push({
          code: 'WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED',
          severity: 'error',
          source: 'export',
          message: `The current Remote gateway does not support Server Function adapter ${definition.adapterId}.`,
          path: document.path,
          suggestion:
            'Use the product Auth first-vertical adapters or a future full-stack server target.',
        });
      }
      if (target.kind === 'deterministic-test' && testProvision) {
        const fixture = testProvision.fixtures.find(
          ({ functionRef }) =>
            functionRef.artifactId === definition.reference.artifactId &&
            functionRef.exportName === definition.reference.exportName
        );
        if (!fixture) {
          diagnostics.push({
            code: 'WKS-EXPORT-SERVER-TEST-FIXTURE-MISSING',
            severity: 'error',
            source: 'export',
            message: `Deterministic Server Runtime Test has no fixture for ${definition.reference.artifactId}:${definition.reference.exportName}.`,
            path: document.path,
          });
        }
        if (definition.auth.kind !== 'public' && !testProvision.principal) {
          diagnostics.push({
            code: 'WKS-EXPORT-SERVER-TEST-PRINCIPAL-REQUIRED',
            severity: 'error',
            source: 'export',
            message:
              'The deterministic Server Function fixture requires an explicit test principal.',
            path: document.path,
          });
        }
        if (
          definition.auth.kind === 'permission' &&
          !testProvision.permissions.some(
            ({ permissionId }) =>
              permissionId ===
              (definition.auth.kind === 'permission'
                ? definition.auth.permissionId
                : undefined)
          )
        ) {
          diagnostics.push({
            code: 'WKS-EXPORT-SERVER-TEST-PERMISSION-REQUIRED',
            severity: 'error',
            source: 'export',
            message: `The deterministic Server Function fixture must decide permission ${definition.auth.permissionId}.`,
            path: document.path,
          });
        }
        if (
          definition.effect === 'mutation' &&
          definition.idempotency?.kind !== 'invocation-key'
        ) {
          diagnostics.push({
            code: 'WKS-EXPORT-SERVER-MUTATION-IDEMPOTENCY-REQUIRED',
            severity: 'error',
            source: 'export',
            message:
              'Route action mutation fixtures require invocation-key replay fencing.',
            path: document.path,
          });
        }
      }
    });

  const routeNodeCount = new Set(bindings.map((binding) => binding.routeNodeId))
    .size;
  if (
    target.kind === 'deterministic-test' &&
    bindings.length > 0 &&
    !testProvision &&
    !invalidTestProvision
  ) {
    diagnostics.push({
      code: 'WKS-EXPORT-SERVER-TEST-PROVISION-INVALID',
      severity: 'error',
      source: 'export',
      message:
        'Deterministic Server Runtime Test requires one valid execution-only fixture provision.',
      path: '/execution/serverRuntimeMockProvision',
    });
  }
  return Object.freeze({
    target,
    serverArtifactIds: Object.freeze(serverArtifactIds),
    bindings: Object.freeze(bindings),
    requirements: Object.freeze({
      functionCount: bindings.length,
      routeNodeCount,
      requiresServerGateway:
        bindings.length > 0 && target.kind === 'execution-parent-gateway',
      requiresEnvironmentBinding: bindings.some(
        (binding) =>
          target.kind === 'execution-parent-gateway' &&
          binding.definition.environment !== undefined
      ),
      requiresProductAuth: bindings.some(
        (binding) =>
          target.kind === 'execution-parent-gateway' &&
          binding.definition.auth.kind !== 'public'
      ),
      requiresDeterministicTestRuntime:
        bindings.length > 0 && target.kind === 'deterministic-test',
    }),
    diagnostics: Object.freeze(diagnostics),
  });
};
