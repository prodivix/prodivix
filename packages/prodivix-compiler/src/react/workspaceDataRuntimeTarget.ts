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
}>;

export type WorkspaceDataRuntimeTargetAnalysis = Readonly<{
  target: WorkspaceDataRuntimeTarget;
  requirements: WorkspaceDataRuntimeRequirements;
  diagnostics: readonly CompileDiagnostic[];
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

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

      if (data.source.adapterId !== 'core.http') {
        diagnostics.push({
          code: 'WKS-EXPORT-DATA-ADAPTER-UNSUPPORTED',
          severity: 'error',
          source: 'export',
          message:
            'The React/Vite standalone target does not support this Data adapter.',
          path: document.path,
          suggestion:
            'Use the core.http adapter or a target that declares this adapter runtime.',
        });
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
        message: `Data runtime zone ${zone} is not supported by the React/Vite standalone runtime.`,
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
    }),
    diagnostics: Object.freeze(diagnostics),
  });
};
