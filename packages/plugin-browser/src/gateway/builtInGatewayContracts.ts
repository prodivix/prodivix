import {
  createPluginDiagnostic,
  PLUGIN_DIAGNOSTIC_CODES,
  type JsonValue,
} from '@prodivix/plugin-contracts';
import {
  pluginHostFailure,
  pluginHostSuccess,
  type PluginHostResult,
} from '@prodivix/plugin-host';
import type {
  GatewayContract,
  GatewayContractDefinition,
  GatewayExecutionContext,
} from '#browser/gateway/gatewayContract';
import { defineGatewayContract } from '#browser/gateway/gatewayContract';
import {
  createGatewayContractRegistry,
  type GatewayContractRegistry,
} from '#browser/gateway/gatewayContractRegistry';
import {
  validateGatewayRequest,
  validateGatewayResponse,
} from '#browser/gateway/gatewaySchemaValidation';
import type {
  GatewayNetworkAdapter,
  GatewayNetworkRequest,
  GatewayNetworkResponse,
} from '#browser/gateway/network/gatewayNetworkAdapter';

export type GatewayHealthPingRequest = Readonly<{ nonce: string }>;
export type GatewayHealthPingResponse = Readonly<{ nonce: string }>;

export type GatewayTelemetryEmitRequest = Readonly<{
  name: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  attributes?: Readonly<Record<string, string>>;
}>;
export type GatewayTelemetryEmitResponse = Readonly<{ accepted: true }>;

export type GatewayWorkspaceSummary = Readonly<{
  workspaceId: string;
  revision: number;
  documentCount: number;
  routeCount: number;
  componentCount: number;
}>;

export type GatewayWorkspaceIntentRequest = Readonly<{
  intentId: string;
  payload: JsonValue;
  expectedRevision?: number;
}>;
export type GatewayWorkspaceIntentResponse = Readonly<{
  accepted: true;
  operationId: string;
  revision: number;
}>;

export type GatewayDocumentReadRequest = Readonly<{
  documentId: string;
  scope: string;
}>;
export type GatewayDocumentReadResponse = Readonly<{
  documentId: string;
  revision: number;
  content: JsonValue;
}>;

export type GatewayDocumentPatchRequest = Readonly<{
  documentId: string;
  scope: string;
  baseRevision: number;
  patch: JsonValue;
}>;
export type GatewayDocumentPatchResponse = Readonly<{
  documentId: string;
  revision: number;
  applied: true;
}>;

export type GatewayTelemetryPort = Readonly<{
  emit(
    context: GatewayExecutionContext,
    request: GatewayTelemetryEmitRequest
  ): Promise<PluginHostResult<void>>;
}>;

export type GatewayWorkspacePort = Readonly<{
  readSummary(
    context: GatewayExecutionContext
  ): Promise<PluginHostResult<GatewayWorkspaceSummary>>;
  dispatchIntent(
    context: GatewayExecutionContext,
    request: GatewayWorkspaceIntentRequest
  ): Promise<PluginHostResult<GatewayWorkspaceIntentResponse>>;
}>;

export type GatewayDocumentPort = Readonly<{
  read(
    context: GatewayExecutionContext,
    request: GatewayDocumentReadRequest
  ): Promise<PluginHostResult<GatewayDocumentReadResponse>>;
  applyPatch(
    context: GatewayExecutionContext,
    request: GatewayDocumentPatchRequest
  ): Promise<PluginHostResult<GatewayDocumentPatchResponse>>;
}>;

export type BuiltInGatewayServicePorts = Readonly<{
  telemetry?: GatewayTelemetryPort;
  workspace?: GatewayWorkspacePort;
  documents?: GatewayDocumentPort;
  network?: GatewayNetworkAdapter;
}>;

const unavailable = <T>(method: string): PluginHostResult<T> =>
  pluginHostFailure([
    createPluginDiagnostic(
      PLUGIN_DIAGNOSTIC_CODES.GATEWAY_HANDLER_UNAVAILABLE,
      'Gateway service port is unavailable for this Host session.',
      { contractVersion: '1.0', protocolMethod: method }
    ),
  ]);

const defineBuiltIn = <TRequest extends JsonValue, TResponse extends JsonValue>(
  definition: Omit<
    GatewayContractDefinition<TRequest, TResponse>,
    'contractVersion' | 'validateRequest' | 'validateResponse'
  >
): GatewayContract => {
  return defineGatewayContract({
    ...definition,
    contractVersion: '1.0',
    validateRequest: (value) =>
      validateGatewayRequest(
        definition.method,
        '1.0',
        value
      ) as PluginHostResult<TRequest>,
    validateResponse: (value) =>
      validateGatewayResponse(
        definition.method,
        '1.0',
        value
      ) as PluginHostResult<TResponse>,
  });
};

const SMALL_READ_LIMITS = Object.freeze({
  timeoutMs: 2_000,
  maxRequestBytes: 4 * 1024,
  maxResponseBytes: 16 * 1024,
  requestsPerSecond: 16,
  requestBurst: 24,
  maxConcurrency: 4,
});

export const createBuiltInGatewayContracts = (
  services: BuiltInGatewayServicePorts
): readonly GatewayContract[] =>
  Object.freeze([
    defineBuiltIn<GatewayHealthPingRequest, GatewayHealthPingResponse>({
      method: 'runtime.health/ping',
      auditMode: 'best-effort',
      limits: {
        ...SMALL_READ_LIMITS,
        timeoutMs: 1_000,
        maxRequestBytes: 1_024,
        maxResponseBytes: 1_024,
        requestsPerSecond: 32,
        requestBurst: 48,
        maxConcurrency: 8,
      },
      requiredCapability: () => undefined,
      execute: async (_context, request) =>
        pluginHostSuccess(Object.freeze({ nonce: request.nonce })),
    }),
    defineBuiltIn<GatewayTelemetryEmitRequest, GatewayTelemetryEmitResponse>({
      method: 'telemetry/emit',
      auditMode: 'best-effort',
      limits: {
        ...SMALL_READ_LIMITS,
        maxRequestBytes: 16 * 1024,
        maxResponseBytes: 1_024,
      },
      requiredCapability: () => ({ id: 'telemetry.emit' }),
      auditMetadata: (request) => ({
        telemetryName: request.name,
        telemetryLevel: request.level,
      }),
      execute: async (context, request) => {
        if (!services.telemetry) return unavailable('telemetry/emit');
        const result = await services.telemetry.emit(context, request);
        return result.ok
          ? pluginHostSuccess(Object.freeze({ accepted: true as const }))
          : result;
      },
    }),
    defineBuiltIn<Record<string, never>, GatewayWorkspaceSummary>({
      method: 'workspace/read-summary',
      auditMode: 'required-before-effect',
      limits: SMALL_READ_LIMITS,
      requiredCapability: () => ({ id: 'workspace.read' }),
      auditMetadata: (_request, response) => ({
        ...(response ? { workspaceId: response.workspaceId } : {}),
      }),
      execute: (context) =>
        services.workspace?.readSummary(context) ??
        Promise.resolve(unavailable('workspace/read-summary')),
    }),
    defineBuiltIn<
      GatewayWorkspaceIntentRequest,
      GatewayWorkspaceIntentResponse
    >({
      method: 'workspace/dispatch-intent',
      auditMode: 'required-before-effect',
      limits: {
        timeoutMs: 5_000,
        maxRequestBytes: 128 * 1024,
        maxResponseBytes: 8 * 1024,
        requestsPerSecond: 8,
        requestBurst: 8,
        maxConcurrency: 1,
      },
      requiredCapability: () => ({ id: 'workspace.intent.dispatch' }),
      auditMetadata: (request, response) => ({
        intentId: request.intentId,
        ...(request.expectedRevision === undefined
          ? {}
          : { expectedRevision: request.expectedRevision }),
        ...(response ? { revision: response.revision } : {}),
      }),
      execute: (context, request) =>
        services.workspace?.dispatchIntent(context, request) ??
        Promise.resolve(unavailable('workspace/dispatch-intent')),
    }),
    defineBuiltIn<GatewayDocumentReadRequest, GatewayDocumentReadResponse>({
      method: 'document/read',
      auditMode: 'required-before-effect',
      limits: {
        ...SMALL_READ_LIMITS,
        maxResponseBytes: 192 * 1024,
      },
      requiredCapability: (request) => ({
        id: 'document.read',
        scope: request.scope,
      }),
      auditMetadata: (request, response) => ({
        documentId: request.documentId,
        capabilityScope: request.scope,
        ...(response ? { revision: response.revision } : {}),
      }),
      execute: (context, request) =>
        services.documents?.read(context, request) ??
        Promise.resolve(unavailable('document/read')),
    }),
    defineBuiltIn<GatewayDocumentPatchRequest, GatewayDocumentPatchResponse>({
      method: 'document/apply-patch',
      auditMode: 'required-before-effect',
      limits: {
        timeoutMs: 5_000,
        maxRequestBytes: 192 * 1024,
        maxResponseBytes: 8 * 1024,
        requestsPerSecond: 8,
        requestBurst: 8,
        maxConcurrency: 1,
      },
      requiredCapability: (request) => ({
        id: 'document.write',
        scope: request.scope,
      }),
      auditMetadata: (request, response) => ({
        documentId: request.documentId,
        capabilityScope: request.scope,
        baseRevision: request.baseRevision,
        ...(response ? { revision: response.revision } : {}),
      }),
      execute: (context, request) =>
        services.documents?.applyPatch(context, request) ??
        Promise.resolve(unavailable('document/apply-patch')),
    }),
    defineBuiltIn<GatewayNetworkRequest, GatewayNetworkResponse>({
      method: 'network/request',
      auditMode: 'required-before-effect',
      limits: {
        timeoutMs: 5_000,
        maxRequestBytes: 192 * 1024,
        maxResponseBytes: 192 * 1024,
        requestsPerSecond: 8,
        requestBurst: 8,
        maxConcurrency: 2,
      },
      requiredCapability: (request) => ({
        id: 'network.request',
        scope: request.scope,
      }),
      auditMetadata: (request, response) => {
        let networkOrigin = 'invalid';
        try {
          networkOrigin = new URL(request.url).origin;
        } catch {
          // An unparsable URL stays recorded as the 'invalid' origin above; audit
          // metadata must never fail the Gateway call it is describing.
        }
        return {
          capabilityScope: request.scope,
          networkOrigin,
          networkMethod: request.method,
          ...(response
            ? {
                networkStatus: response.status,
                responseBytes: response.bodyBytes,
              }
            : {}),
        };
      },
      execute: (context, request) =>
        services.network?.request(context, request) ??
        Promise.resolve(unavailable('network/request')),
    }),
  ]);

export const createBuiltInGatewayContractRegistry = (
  services: BuiltInGatewayServicePorts
): PluginHostResult<GatewayContractRegistry> =>
  createGatewayContractRegistry(createBuiltInGatewayContracts(services));
