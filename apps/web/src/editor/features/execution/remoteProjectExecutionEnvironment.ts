import type { ExecutionRequest } from '@prodivix/runtime-core';
import {
  createRemoteExecutionArtifactResolver,
  createRemoteExecutionClient,
  createRemoteExecutionHttpTransports,
  createRemoteExecutionTerminalClient,
  createRemoteExecutionTerminalHttpTransport,
  createRemotePreviewExecutionProvider,
  createRemoteTestExecutionProvider,
  type RemoteExecutionTerminalClient,
  type RemoteExecutionSnapshotSource,
} from '@prodivix/runtime-remote';
import { API_ROOT } from '@/infra/api/apiConfig';
import { createWebRemoteExecutionHttpPort } from './remoteExecutionHttpPort';
import { createRemotePreviewOriginClient } from './remotePreviewOriginClient';
import {
  createRemoteDataGatewayClient,
  type RemoteDataGatewayClient,
} from './remoteDataGatewayClient';
import {
  createRemoteDataStreamGatewayClient,
  type RemoteDataStreamGatewayClient,
} from './remoteDataStreamGatewayClient';
import {
  createRemoteServerFunctionGatewayClient,
  type RemoteServerFunctionGatewayClient,
} from './remoteServerFunctionGatewayClient';

export type CreateRemoteProjectExecutionEnvironmentOptions = Readonly<{
  accessToken: string;
  resolveAccessToken?: () => string | Promise<string>;
  resolveSnapshot(
    request: ExecutionRequest
  ): RemoteExecutionSnapshotSource | Promise<RemoteExecutionSnapshotSource>;
}>;

export type RemoteProjectExecutionEnvironment = Readonly<{
  client: ReturnType<typeof createRemoteExecutionClient>;
  provider: ReturnType<typeof createRemotePreviewExecutionProvider>;
  testProvider: ReturnType<typeof createRemoteTestExecutionProvider>;
  artifacts: ReturnType<typeof createRemoteExecutionArtifactResolver>;
  dataGateway: RemoteDataGatewayClient;
  dataStreams: RemoteDataStreamGatewayClient;
  serverFunctions: RemoteServerFunctionGatewayClient;
  terminal: RemoteExecutionTerminalClient;
  previewOrigins: ReturnType<typeof createRemotePreviewOriginClient>;
}>;

/** Composes Remote Preview through the authenticated Backend gateway; no service credential reaches Web. */
export const createRemoteProjectExecutionEnvironment = (
  options: CreateRemoteProjectExecutionEnvironmentOptions
): RemoteProjectExecutionEnvironment => {
  if (!options.accessToken.trim())
    throw new TypeError(
      'Remote project execution requires an authenticated session.'
    );
  const baseUrl = new URL(API_ROOT, globalThis.location.origin).toString();
  const http = createWebRemoteExecutionHttpPort();
  const { transport, contentTransport } = createRemoteExecutionHttpTransports({
    baseUrl,
    executionPath: '/remote-executions',
    accessToken: options.accessToken,
    http,
  });
  const client = createRemoteExecutionClient({ transport });
  const previewOrigins = createRemotePreviewOriginClient({
    baseUrl,
    accessToken: options.accessToken,
    http,
  });
  const dataGateway = createRemoteDataGatewayClient({
    baseUrl,
    accessToken: options.accessToken,
    http,
  });
  const dataStreams = createRemoteDataStreamGatewayClient({
    baseUrl,
    accessToken: options.resolveAccessToken ?? options.accessToken,
  });
  const serverFunctions = createRemoteServerFunctionGatewayClient({
    baseUrl,
    accessToken: options.accessToken,
    http,
  });
  const terminal = createRemoteExecutionTerminalClient({
    transport: createRemoteExecutionTerminalHttpTransport({
      baseUrl,
      executionPath: '/remote-executions',
      accessToken: options.accessToken,
      terminalAccessMode: 'x-prodivix-terminal-token',
      http,
    }),
  });
  return Object.freeze({
    client,
    provider: createRemotePreviewExecutionProvider({
      client,
      resolveSnapshot: options.resolveSnapshot,
      materializeArtifact: ({ executionId, artifact }) =>
        previewOrigins.materialize({ executionId, artifact }),
    }),
    testProvider: createRemoteTestExecutionProvider({
      client,
      resolveSnapshot: options.resolveSnapshot,
    }),
    artifacts: createRemoteExecutionArtifactResolver({
      client,
      contentTransport,
    }),
    dataGateway,
    dataStreams,
    serverFunctions,
    terminal,
    previewOrigins,
  });
};
