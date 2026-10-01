import {
  computeVerificationArtifactContentDigest,
  digestVerificationValue,
  type VerificationAdapterArtifactAttemptCoordinates,
  type VerificationAdapterArtifactRetirementPort,
  type VerificationAdapterArtifactStagingTransportPort,
} from '@prodivix/verification';
import type { ProductionBrowserCanaryScannerPort } from '@prodivix/verification-browser';

/** Disposable attempt bytes remain fenced until canonical Backend intake scans them. */
export const createDriverArtifactStaging = (
  scanner: ProductionBrowserCanaryScannerPort
) => {
  const bytes = new Map<string, Uint8Array>();
  const owners = new Map<string, string>();
  const retired = new Set<string>();
  let size = 0;
  const key = (coordinates: VerificationAdapterArtifactAttemptCoordinates) =>
    JSON.stringify([
      coordinates.planDigest,
      coordinates.cellId,
      coordinates.attemptId,
      coordinates.generation,
    ]);
  const staging: VerificationAdapterArtifactStagingTransportPort = {
    async stage(request, signal) {
      const owner = key(request);
      const artifact = request.artifact;
      if (
        signal.aborted ||
        retired.has(owner) ||
        artifact.bytes.byteLength > 64 * 1024 * 1024
      )
        return {
          status: 'rejected',
          reasonCode: 'VER-5002',
          message: 'G3 staging is retired or exceeds its byte budget.',
        };
      await scanner.scan(
        {
          sourceKind: 'production-bundle',
          sourceId: artifact.id,
          contents: artifact.bytes,
        },
        signal
      );
      if (signal.aborted || retired.has(owner))
        return {
          status: 'rejected',
          reasonCode: 'VER-5002',
          message: 'G3 staging was retired during scanning.',
        };
      const digest = computeVerificationArtifactContentDigest(artifact.bytes);
      const stagingArtifactId = `staging:${digestVerificationValue({ owner, artifactId: artifact.id, digest }).slice(7)}`;
      const previous = bytes.get(stagingArtifactId);
      if (previous && owners.get(stagingArtifactId) !== owner)
        return {
          status: 'rejected',
          reasonCode: 'VER-5002',
          message: 'G3 staging identity belongs to another attempt.',
        };
      if (!previous && size + artifact.bytes.byteLength > 128 * 1024 * 1024)
        return {
          status: 'rejected',
          reasonCode: 'VER-5002',
          message: 'G3 staging exceeds its aggregate byte budget.',
        };
      if (!previous) {
        bytes.set(stagingArtifactId, new Uint8Array(artifact.bytes));
        owners.set(stagingArtifactId, owner);
        size += artifact.bytes.byteLength;
      }
      return {
        status: 'staged',
        stagingArtifactId,
        digest,
        size: artifact.bytes.byteLength,
        mediaType: artifact.mediaType,
      };
    },
  };
  const retirement: VerificationAdapterArtifactRetirementPort = {
    async retireAttempt(coordinates) {
      const owner = key(coordinates);
      retired.add(owner);
      for (const [id, artifactOwner] of owners)
        if (artifactOwner === owner) {
          size -= bytes.get(id)!.byteLength;
          bytes.delete(id);
          owners.delete(id);
        }
      return { status: 'retired', ...coordinates };
    },
  };
  return {
    staging,
    retirement,
    read(id: string) {
      const value = bytes.get(id);
      if (!value) throw new Error('G3 staged artifact is unavailable.');
      return new Uint8Array(value);
    },
    dispose() {
      bytes.clear();
      owners.clear();
      retired.clear();
      size = 0;
    },
  };
};
