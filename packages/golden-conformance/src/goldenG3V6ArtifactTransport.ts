import { createHash } from 'node:crypto';
import {
  digestVerificationValue,
  type VerificationAdapterArtifactAttemptCoordinates,
  type VerificationAdapterArtifactRetirementPort,
  type VerificationAdapterArtifactStagingTransportPort,
} from '@prodivix/verification';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';

type AttemptState = {
  retired: boolean;
  artifacts: Map<
    string,
    Readonly<{
      digest: string;
      size: number;
      mediaType: string;
    }>
  >;
  retirementReceipt?: GoldenG3V6ArtifactRetirementReceipt;
};

export type GoldenG3V6ArtifactTransportSnapshot = Readonly<{
  attemptCount: number;
  activeAttemptCount: number;
  retiredAttemptCount: number;
  activeArtifactCount: number;
  retirementReceiptCount: number;
  retirementCallCount: number;
  duplicateRetirementCount: number;
  lateWriteRejectionCount: number;
  inspectedArtifactCount: number;
  forbiddenMarkerHitCount: number;
}>;

export type GoldenG3V6ArtifactRetirementReceipt = Readonly<{
  format: 'prodivix.golden-g3-v6-artifact-retirement-receipt';
  version: 1;
  planDigest: string;
  cellId: string;
  attemptId: string;
  generation: number;
  retiredArtifacts: readonly Readonly<{
    stagingArtifactId: string;
    digest: string;
    size: number;
    mediaType: string;
  }>[];
  retiredArtifactCount: number;
  postState: Readonly<{
    writable: false;
    activeArtifactCount: 0;
  }>;
  receiptDigest: string;
}>;

export type GoldenG3V6ArtifactTransport = Readonly<{
  staging: VerificationAdapterArtifactStagingTransportPort;
  retirement: VerificationAdapterArtifactRetirementPort;
  readRetirementReceipt(
    input: VerificationAdapterArtifactAttemptCoordinates
  ): GoldenG3V6ArtifactRetirementReceipt;
  snapshot(): GoldenG3V6ArtifactTransportSnapshot;
}>;

export type GoldenG3V6ArtifactTransportOptions = Readonly<{
  forbiddenTextMarkers?: readonly string[];
}>;

const attemptKey = (
  input: VerificationAdapterArtifactAttemptCoordinates
): string =>
  `${input.planDigest}\u0000${input.cellId}\u0000${input.attemptId}\u0000${input.generation}`;

const artifactContentDigest = (bytes: Uint8Array): string =>
  `sha256-${createHash('sha256').update(bytes).digest('hex')}`;

const createAttemptState = (): AttemptState => ({
  retired: false,
  artifacts: new Map(),
});

const containsBytes = (bytes: Uint8Array, marker: Uint8Array): boolean => {
  if (marker.byteLength === 0 || marker.byteLength > bytes.byteLength) {
    return false;
  }
  const maximumStart = bytes.byteLength - marker.byteLength;
  for (let start = 0; start <= maximumStart; start += 1) {
    let matches = true;
    for (let offset = 0; offset < marker.byteLength; offset += 1) {
      if (bytes[start + offset] !== marker[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
};

/**
 * In-memory persistence transport with the same attempt-generation fence as
 * durable staging: retirement atomically rejects later writes and clears all
 * artifacts, including writes whose receipt is no longer known to the caller.
 */
export const createGoldenG3V6ArtifactTransport = (
  options: GoldenG3V6ArtifactTransportOptions = Object.freeze({})
): GoldenG3V6ArtifactTransport => {
  const attempts = new Map<string, AttemptState>();
  const forbiddenMarkers = Object.freeze(
    (options.forbiddenTextMarkers ?? []).map((marker) =>
      new TextEncoder().encode(marker)
    )
  );
  let inspectedArtifactCount = 0;
  let forbiddenMarkerHitCount = 0;
  let retirementCallCount = 0;
  let duplicateRetirementCount = 0;
  let lateWriteRejectionCount = 0;
  const staging: VerificationAdapterArtifactStagingTransportPort =
    Object.freeze({
      async stage(input, signal) {
        const key = attemptKey(input);
        const state = attempts.get(key) ?? createAttemptState();
        attempts.set(key, state);
        if (signal.aborted || state.retired) {
          if (state.retired) {
            lateWriteRejectionCount += 1;
          }
          return Object.freeze({
            status: 'rejected' as const,
            reasonCode: state.retired
              ? 'verification-attempt-retired'
              : 'verification-attempt-aborted',
            message: 'Golden V6 artifact stage is no longer writable.',
          });
        }
        inspectedArtifactCount += 1;
        if (
          forbiddenMarkers.some((marker) =>
            containsBytes(input.artifact.bytes, marker)
          )
        ) {
          forbiddenMarkerHitCount += 1;
          return Object.freeze({
            status: 'rejected' as const,
            reasonCode: 'verification-staging-forbidden-marker',
            message:
              'Golden V6 artifact contains a forbidden verification canary.',
          });
        }
        const digest = artifactContentDigest(input.artifact.bytes);
        const stagingArtifactId = `staging:${digestVerificationValue({
          planDigest: input.planDigest,
          cellId: input.cellId,
          attemptId: input.attemptId,
          generation: input.generation,
          artifactId: input.artifact.id,
          digest,
        }).slice('sha256-'.length)}`;
        if (state.artifacts.has(stagingArtifactId)) {
          return Object.freeze({
            status: 'rejected' as const,
            reasonCode: 'verification-staging-duplicate',
            message: 'Golden V6 artifact was staged more than once.',
          });
        }
        state.artifacts.set(
          stagingArtifactId,
          Object.freeze({
            digest,
            size: input.artifact.bytes.byteLength,
            mediaType: input.artifact.mediaType,
          })
        );
        return Object.freeze({
          status: 'staged' as const,
          stagingArtifactId,
          digest,
          size: input.artifact.bytes.byteLength,
          mediaType: input.artifact.mediaType,
        });
      },
    });
  const retirement: VerificationAdapterArtifactRetirementPort = Object.freeze({
    async retireAttempt(input) {
      retirementCallCount += 1;
      const key = attemptKey(input);
      const state = attempts.get(key) ?? createAttemptState();
      attempts.set(key, state);
      if (state.retirementReceipt) {
        duplicateRetirementCount += 1;
        return Object.freeze({
          status: 'retired' as const,
          planDigest: input.planDigest,
          cellId: input.cellId,
          attemptId: input.attemptId,
          generation: input.generation,
        });
      }
      const retiredArtifacts = Object.freeze(
        [...state.artifacts.entries()]
          .map(([stagingArtifactId, artifact]) =>
            Object.freeze({
              stagingArtifactId,
              digest: artifact.digest,
              size: artifact.size,
              mediaType: artifact.mediaType,
            })
          )
          .sort((left, right) =>
            compareUnicodeCodePoints(
              left.stagingArtifactId,
              right.stagingArtifactId
            )
          )
      );
      const receiptIdentity = Object.freeze({
        format: 'prodivix.golden-g3-v6-artifact-retirement-receipt' as const,
        version: 1 as const,
        planDigest: input.planDigest,
        cellId: input.cellId,
        attemptId: input.attemptId,
        generation: input.generation,
        retiredArtifacts,
        retiredArtifactCount: retiredArtifacts.length,
        postState: Object.freeze({
          writable: false as const,
          activeArtifactCount: 0 as const,
        }),
      });
      state.retired = true;
      state.artifacts.clear();
      state.retirementReceipt = Object.freeze({
        ...receiptIdentity,
        receiptDigest: digestVerificationValue(receiptIdentity),
      });
      return Object.freeze({
        status: 'retired' as const,
        planDigest: input.planDigest,
        cellId: input.cellId,
        attemptId: input.attemptId,
        generation: input.generation,
      });
    },
  });
  return Object.freeze({
    staging,
    retirement,
    readRetirementReceipt(input) {
      const receipt = attempts.get(attemptKey(input))?.retirementReceipt;
      if (!receipt) {
        throw new Error(
          `Golden V6 attempt "${input.attemptId}" has no first retirement receipt.`
        );
      }
      return receipt;
    },
    snapshot: (): GoldenG3V6ArtifactTransportSnapshot => {
      const states = [...attempts.values()];
      return Object.freeze({
        attemptCount: states.length,
        activeAttemptCount: states.filter(({ retired }) => !retired).length,
        retiredAttemptCount: states.filter(({ retired }) => retired).length,
        activeArtifactCount: states.reduce(
          (total, state) => total + state.artifacts.size,
          0
        ),
        retirementReceiptCount: states.filter(
          ({ retirementReceipt }) => retirementReceipt !== undefined
        ).length,
        retirementCallCount,
        duplicateRetirementCount,
        lateWriteRejectionCount,
        inspectedArtifactCount,
        forbiddenMarkerHitCount,
      });
    },
  });
};
