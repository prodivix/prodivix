import type { RuntimeZone } from '@prodivix/runtime-core';
import {
  decodeWorkspaceDataSourceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { CompileDiagnostic } from '#src/core/diagnostics';

export const WORKSPACE_DATA_RUNTIME_TARGET_FORMAT =
  'prodivix.workspace-data-runtime-target.v1' as const;

export type WorkspaceDataRuntimeTarget = Readonly<{
  format: typeof WORKSPACE_DATA_RUNTIME_TARGET_FORMAT;
  kind: 'static-client' | 'execution-parent-gateway' | 'provider-mock';
  runtimeMode: 'live' | 'mock-only';
  serverGateway: 'none' | 'execution-data-gateway-message-v1';
}>;

export const STATIC_CLIENT_DATA_RUNTIME_TARGET: WorkspaceDataRuntimeTarget =
  Object.freeze({
    format: WORKSPACE_DATA_RUNTIME_TARGET_FORMAT,
    kind: 'static-client',
    runtimeMode: 'live',
    serverGateway: 'none',
  });

export const EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET: WorkspaceDataRuntimeTarget =
  Object.freeze({
    format: WORKSPACE_DATA_RUNTIME_TARGET_FORMAT,
    kind: 'execution-parent-gateway',
    runtimeMode: 'live',
    serverGateway: 'execution-data-gateway-message-v1',
  });

export const PROVIDER_MOCK_DATA_RUNTIME_TARGET: WorkspaceDataRuntimeTarget =
  Object.freeze({
    format: WORKSPACE_DATA_RUNTIME_TARGET_FORMAT,
    kind: 'provider-mock',
    runtimeMode: 'mock-only',
    serverGateway: 'none',
  });

export type WorkspaceDataRuntimeRequirements = Readonly<{
  dataDocumentCount: number;
  runtimeZones: readonly RuntimeZone[];
  requiresNetwork: boolean;
  requiresServerGateway: boolean;
  requiresEnvironmentBinding: boolean;
  requiresDataStream: boolean;
}>;

export type WorkspaceDataRuntimeTargetAnalysis = Readonly<{
  target: WorkspaceDataRuntimeTarget;
  requirements: WorkspaceDataRuntimeRequirements;
  diagnostics: readonly CompileDiagnostic[];
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const STATIC_CLIENT_LIVE_DATA_ADAPTER_IDS = new Set([
  'core.asyncapi',
  'core.graphql',
  'core.http',
]);

// Every server/edge protocol must pass the same execution-bound Backend
// authority, Secret, replay, response-budget, and sanitized trace boundary.
const EXECUTION_GATEWAY_LIVE_DATA_ADAPTER_IDS = new Set([
  'core.asyncapi',
  'core.graphql',
  'core.http',
]);

const normalizeTarget = (
  value: WorkspaceDataRuntimeTarget | undefined
): WorkspaceDataRuntimeTarget => {
  if (value === undefined) return STATIC_CLIENT_DATA_RUNTIME_TARGET;
  const keys = Object.keys(value).sort(compareText);
  if (
    keys.join('\0') !==
      ['format', 'kind', 'runtimeMode', 'serverGateway']
        .sort(compareText)
        .join('\0') ||
    value.format !== WORKSPACE_DATA_RUNTIME_TARGET_FORMAT
  ) {
    throw new TypeError('Workspace Data runtime target manifest is invalid.');
  }
  if (
    value.kind === 'static-client' &&
    value.runtimeMode === 'live' &&
    value.serverGateway === 'none'
  ) {
    return STATIC_CLIENT_DATA_RUNTIME_TARGET;
  }
  if (
    value.kind === 'execution-parent-gateway' &&
    value.runtimeMode === 'live' &&
    value.serverGateway === 'execution-data-gateway-message-v1'
  ) {
    return EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET;
  }
  if (
    value.kind === 'provider-mock' &&
    value.runtimeMode === 'mock-only' &&
    value.serverGateway === 'none'
  ) {
    return PROVIDER_MOCK_DATA_RUNTIME_TARGET;
  }
  throw new TypeError('Workspace Data runtime target manifest is unsupported.');
};

const hasConfigurationReference = (
  values: Readonly<Record<string, Readonly<{ kind: string }>>>
): boolean =>
  Object.values(values).some(
    (value) => value.kind === 'environment-ref' || value.kind === 'secret-ref'
  );

/** Resolves target requirements before any standalone project is considered runnable. */
export const analyzeWorkspaceDataRuntimeTarget = (
  workspace: WorkspaceSnapshot,
  requestedTarget?: WorkspaceDataRuntimeTarget
): WorkspaceDataRuntimeTargetAnalysis => {
  const target = normalizeTarget(requestedTarget);
  const diagnostics: CompileDiagnostic[] = [];
  const runtimeZones = new Set<RuntimeZone>();
  const mockOnly = target.runtimeMode === 'mock-only';
  let dataDocumentCount = 0;
  let requiresServerGateway = false;
  let requiresEnvironmentBinding = false;
  let requiresDataStream = false;

  Object.values(workspace.docsById)
    .filter((document) => document.type === 'data-source')
    .sort(
      (left, right) =>
        compareText(left.path, right.path) || compareText(left.id, right.id)
    )
    .forEach((document) => {
      const read = decodeWorkspaceDataSourceDocument(document);
      if (read.status !== 'valid') return;
      dataDocumentCount += 1;
      const data = read.decodedContent;
      const zone = data.source.runtimeZone;
      runtimeZones.add(zone);
      const configurationUsesEnvironment =
        hasConfigurationReference(data.source.configurationByKey) ||
        Object.values(data.operationsById).some((operation) =>
          hasConfigurationReference(operation.configurationByKey)
        );
      if (mockOnly) return;
      requiresEnvironmentBinding ||= configurationUsesEnvironment;

      const supportedLiveAdapter =
        zone === 'client'
          ? STATIC_CLIENT_LIVE_DATA_ADAPTER_IDS.has(data.source.adapterId)
          : (zone === 'server' || zone === 'edge') &&
            EXECUTION_GATEWAY_LIVE_DATA_ADAPTER_IDS.has(data.source.adapterId);
      if (!supportedLiveAdapter) {
        diagnostics.push({
          code: 'WKS-EXPORT-DATA-ADAPTER-UNSUPPORTED',
          severity: 'error',
          source: 'export',
          message: `The standalone ${zone} target does not support live Data adapter ${data.source.adapterId}.`,
          path: document.path,
          suggestion:
            zone === 'client'
              ? 'Use a finite core.http, core.graphql, or core.asyncapi client adapter, or select mock execution.'
              : 'Use the audited finite HTTP, GraphQL, or AsyncAPI execution gateway, or select mock execution.',
        });
      }

      const subscriptions = Object.values(data.operationsById).filter(
        (operation) => operation.kind === 'subscription'
      );
      if (subscriptions.length) {
        requiresDataStream = true;
        if (
          data.source.adapterId !== 'core.graphql' &&
          data.source.adapterId !== 'core.asyncapi'
        ) {
          diagnostics.push({
            code: 'WKS-EXPORT-DATA-STREAM-ADAPTER-UNSUPPORTED',
            severity: 'error',
            source: 'export',
            message: `Data subscription requires the GraphQL or AsyncAPI stream gateway; ${data.source.adapterId} is finite-only.`,
            path: document.path,
          });
        }
        if (zone !== 'server' && zone !== 'edge') {
          diagnostics.push({
            code: 'WKS-EXPORT-DATA-STREAM-GATEWAY-REQUIRED',
            severity: 'error',
            source: 'export',
            message:
              'Data subscription currently requires an explicit server/edge execution gateway.',
            path: document.path,
            suggestion:
              'Move the source to server or edge and run it through Remote Preview.',
          });
        }
        const streamAuthorizations = [
          data.source.configurationByKey.authorization,
          ...subscriptions.map(
            (operation) => operation.configurationByKey.authorization
          ),
        ].filter((authorization) => authorization !== undefined);
        const streamUsesAuthorization = streamAuthorizations.length > 0;
        const streamUsesUnsafeAuthorization = streamAuthorizations.some(
          (authorization) => authorization?.kind !== 'secret-ref'
        );
        const streamCredentialRenewalReady = subscriptions.every(
          (operation) =>
            operation.policies.stream?.credentialRenewal === 'per-connection'
        );
        if (
          streamUsesUnsafeAuthorization ||
          (streamUsesAuthorization && !streamCredentialRenewalReady)
        ) {
          diagnostics.push({
            code: 'WKS-EXPORT-DATA-STREAM-SECRET-UNAVAILABLE',
            severity: 'error',
            source: 'export',
            message:
              'Long-lived Data streams cannot retain callback-only Secret material.',
            path: document.path,
            suggestion:
              'Declare the bounded SSE resume and per-connection credential-renewal stream policy, or use a public stream.',
          });
        }
      }

      if (zone === 'server' || zone === 'edge') {
        requiresServerGateway = true;
        requiresEnvironmentBinding = true;
        if (target.serverGateway === 'none') {
          diagnostics.push({
            code: 'WKS-EXPORT-DATA-SERVER-GATEWAY-REQUIRED',
            severity: 'error',
            source: 'export',
            message: `Data runtime zone ${zone} requires an explicit server gateway target.`,
            path: document.path,
            suggestion:
              'Select Remote Preview with the execution Data gateway, or move this source to a safe client-only configuration.',
          });
        }
        return;
      }

      if (zone === 'client') {
        if (configurationUsesEnvironment) {
          diagnostics.push({
            code: 'WKS-EXPORT-DATA-CLIENT-ENVIRONMENT-UNAVAILABLE',
            severity: 'error',
            source: 'export',
            message:
              'Client Data configuration cannot resolve environment or Secret references.',
            path: document.path,
            suggestion:
              'Use literal public client configuration, or move the operation behind a server/edge gateway.',
          });
        }
        return;
      }

      diagnostics.push({
        code: 'WKS-EXPORT-DATA-RUNTIME-ZONE-UNSUPPORTED',
        severity: 'error',
        source: 'export',
        message: `Data runtime zone ${zone} is not supported by the standalone runtime.`,
        path: document.path,
        suggestion: 'Use client, server, or edge with a compatible target.',
      });
    });

  const sortedZones = Object.freeze([...runtimeZones].sort(compareText));
  return Object.freeze({
    target,
    requirements: Object.freeze({
      dataDocumentCount,
      runtimeZones: sortedZones,
      requiresNetwork: dataDocumentCount > 0 && !mockOnly,
      requiresServerGateway,
      requiresEnvironmentBinding,
      requiresDataStream,
    }),
    diagnostics: Object.freeze(diagnostics),
  });
};
