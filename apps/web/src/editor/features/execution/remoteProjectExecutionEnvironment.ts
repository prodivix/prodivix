import type { ExecutionRequest } from '@prodivix/runtime-core';
import {
  createRemoteExecutionArtifactResolver,
  createRemoteExecutionClient,
  createRemoteExecutionHttpTransports,
  createRemotePreviewExecutionProvider,
  type RemoteExecutionSnapshotSource,
} from '@prodivix/runtime-remote';
import { API_ROOT } from '@/infra/api/apiConfig';
import { createWebRemoteExecutionHttpPort } from './remoteExecutionHttpPort';
import { createRemotePreviewOriginClient } from './remotePreviewOriginClient';

export type CreateRemoteProjectExecutionEnvironmentOptions = Readonly<{
  accessToken: string;
  resolveSnapshot(
    request: ExecutionRequest
  ): RemoteExecutionSnapshotSource | Promise<RemoteExecutionSnapshotSource>;
}>;

/** Composes Remote Preview through the authenticated Backend gateway; no service credential reaches Web. */
export const createRemoteProjectExecutionEnvironment = (
  options: CreateRemoteProjectExecutionEnvironmentOptions
) => {
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
  return Object.freeze({
    client,
    provider: createRemotePreviewExecutionProvider({
      client,
      resolveSnapshot: options.resolveSnapshot,
      materializeArtifact: ({ executionId, artifact }) =>
        previewOrigins.materialize({ executionId, artifact }),
    }),
    artifacts: createRemoteExecutionArtifactResolver({
      client,
      contentTransport,
    }),
    previewOrigins,
  });
};
