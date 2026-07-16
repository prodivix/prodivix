import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  decodeExecutionPreviewBundle,
  EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE,
  type ExecutionArtifact,
  type ExecutionPreviewBundle,
} from '@prodivix/runtime-core';
import { projectRemoteExecutionArtifact } from './remoteExecutionArtifact';
import type { RemoteExecutionClient } from './remoteExecutionProtocol.types';

export type RemoteExecutionArtifactContentTransport = Readonly<{
  download(
    input: Readonly<{
      executionId: string;
      artifactId: string;
      maximumBytes: number;
    }>
  ): Promise<Uint8Array>;
}>;

export type CreateRemoteExecutionArtifactResolverOptions = Readonly<{
  client: Pick<RemoteExecutionClient, 'resolveArtifact'>;
  contentTransport: RemoteExecutionArtifactContentTransport;
  maximumArtifactBytes?: number;
  now?: () => number;
}>;

export type ResolvedRemotePreviewBundle = Readonly<{
  artifact: ExecutionArtifact;
  bundle: ExecutionPreviewBundle;
}>;

export class RemoteExecutionArtifactResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteExecutionArtifactResolutionError';
  }
}

const positiveSafeInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError(`${label} must be a positive safe integer.`);
  return value;
};

/** Resolves authorized Remote bytes without exposing grants or trusting descriptor digest facts. */
export const createRemoteExecutionArtifactResolver = (
  options: CreateRemoteExecutionArtifactResolverOptions
) => {
  const maximumArtifactBytes = positiveSafeInteger(
    options.maximumArtifactBytes ?? 64 * 1024 * 1024,
    'Remote artifact resolver byte limit'
  );
  const now = options.now ?? Date.now;

  const resolvePreviewBundle = async (
    input: Readonly<{
      executionId: string;
      artifactId: string;
      snapshotDigest: string;
    }>
  ): Promise<ResolvedRemotePreviewBundle> => {
    const { artifact: descriptor } = await options.client.resolveArtifact({
      executionId: input.executionId,
      artifactId: input.artifactId,
    });
    if (
      descriptor.kind !== 'bundle' ||
      descriptor.mediaType !== EXECUTION_PREVIEW_BUNDLE_MEDIA_TYPE ||
      descriptor.metadata?.snapshotDigest !== input.snapshotDigest ||
      descriptor.metadata?.readiness !== 'ready' ||
      descriptor.metadata?.health !== 'healthy' ||
      descriptor.authorizationScope !== `execution:${input.executionId}` ||
      descriptor.expiresAt <= now() ||
      !descriptor.sourceTrace?.length ||
      descriptor.size > maximumArtifactBytes
    )
      throw new RemoteExecutionArtifactResolutionError(
        'Remote Preview artifact descriptor is unavailable or invalid.'
      );
    const contents = await options.contentTransport.download({
      executionId: input.executionId,
      artifactId: input.artifactId,
      maximumBytes: maximumArtifactBytes,
    });
    const digest = `sha256-${bytesToHex(sha256(contents))}`;
    if (
      contents.byteLength !== descriptor.size ||
      contents.byteLength > maximumArtifactBytes ||
      digest !== descriptor.digest
    )
      throw new RemoteExecutionArtifactResolutionError(
        'Remote Preview artifact bytes do not match the durable descriptor.'
      );
    let bundle: ExecutionPreviewBundle;
    try {
      bundle = decodeExecutionPreviewBundle(contents);
    } catch {
      throw new RemoteExecutionArtifactResolutionError(
        'Remote Preview artifact payload is invalid.'
      );
    }
    if (
      bundle.snapshotDigest !== input.snapshotDigest ||
      bundle.entryFilePath !== descriptor.metadata.entryFilePath
    )
      throw new RemoteExecutionArtifactResolutionError(
        'Remote Preview bundle identity drifted from its descriptor.'
      );
    return Object.freeze({
      artifact: projectRemoteExecutionArtifact(descriptor),
      bundle,
    });
  };

  return Object.freeze({ resolvePreviewBundle });
};
