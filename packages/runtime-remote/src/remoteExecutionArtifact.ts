import type { ExecutionArtifact } from '@prodivix/runtime-core';
import type { RemoteExecutionArtifactDescriptor } from './remoteExecutionProtocol.types';

/** Removes grant/retention authority before publishing an artifact as a canonical Job event. */
export const projectRemoteExecutionArtifact = (
  descriptor: RemoteExecutionArtifactDescriptor
): ExecutionArtifact =>
  Object.freeze({
    artifactId: descriptor.artifactId,
    kind: descriptor.kind,
    ...(descriptor.label ? { label: descriptor.label } : {}),
    mediaType: descriptor.mediaType,
    size: descriptor.size,
    digest: descriptor.digest,
    ...(descriptor.sourceTrace ? { sourceTrace: descriptor.sourceTrace } : {}),
    ...(descriptor.metadata ? { metadata: descriptor.metadata } : {}),
  });
