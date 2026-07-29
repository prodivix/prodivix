import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { computeVerificationArtifactContentDigest } from './verificationArtifactDescriptor';
import { digestVerificationValue } from './verificationCanonical';
import type {
  VerificationAbortSignal,
  VerificationAdapterArtifactRetirementPort,
  VerificationAdapterArtifactRetirementResult,
  VerificationAdapterArtifactStagingPort,
  VerificationAdapterArtifactStagingResult,
  VerificationAdapterArtifactStagingTransportPort,
  VerificationAdapterStagedArtifactRef,
} from './verificationAdapterRuntime.types';
import type { VerificationArtifactKind } from './verification.types';

const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;

type ArtifactStagingViolation =
  | 'budget-exceeded'
  | 'descriptor-drift'
  | 'duplicate-drift'
  | 'malformed-result'
  | 'retirement-drift'
  | 'terminal';

export type VerificationArtifactStagingController = Readonly<{
  port: VerificationAdapterArtifactStagingPort;
  close(): void;
  closeAndDrain(): Promise<void>;
  snapshot(): readonly VerificationAdapterStagedArtifactRef[];
  violation(): ArtifactStagingViolation | undefined;
  retire(
    signal: VerificationAbortSignal
  ): Promise<VerificationAdapterArtifactRetirementResult>;
}>;

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> | undefined => {
  if (!isPlainObject(value)) return undefined;
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) &&
    keys.every(
      (key) =>
        !isUnsafeObjectKey(key) &&
        (required.includes(key) || optional.includes(key))
    )
    ? value
    : undefined;
};

const isToken = (value: unknown): value is string =>
  typeof value === 'string' &&
  value === value.normalize('NFC') &&
  TOKEN_PATTERN.test(value);

const rejected = (
  reasonCode: string,
  message: string
): VerificationAdapterArtifactStagingResult =>
  Object.freeze({ status: 'rejected', reasonCode, message });

export const createVerificationArtifactStagingController = (
  input: Readonly<{
    planDigest: string;
    cellId: string;
    attemptId: string;
    generation: number;
    maximumArtifactBytes: number;
    artifactKinds: readonly VerificationArtifactKind[];
    signal: VerificationAbortSignal;
    port: VerificationAdapterArtifactStagingTransportPort;
    retirementPort: VerificationAdapterArtifactRetirementPort;
  }>
): VerificationArtifactStagingController => {
  const staged = new Map<
    string,
    Readonly<{
      requestDigest: string;
      receipt: Extract<
        VerificationAdapterArtifactStagingResult,
        { status: 'staged' }
      >;
      reference: VerificationAdapterStagedArtifactRef;
    }>
  >();
  const stagingIds = new Set<string>();
  let totalBytes = 0;
  let terminal = false;
  let attemptClosed = false;
  let rejectedReason: ArtifactStagingViolation | undefined;
  let stageTail: Promise<void> = Promise.resolve();
  let retirement:
    Promise<VerificationAdapterArtifactRetirementResult> | undefined;

  const fail = (
    reason: ArtifactStagingViolation,
    message: string
  ): VerificationAdapterArtifactStagingResult => {
    rejectedReason ??= reason;
    return rejected(`verification-staging-${reason}`, message);
  };

  const port: VerificationAdapterArtifactStagingPort = Object.freeze({
    async stage(
      candidate,
      _adapterSignal
    ): Promise<VerificationAdapterArtifactStagingResult> {
      if (terminal) return fail('terminal', 'Artifact staging is closed.');
      const previousStage = stageTail;
      let releaseStage = (): void => undefined;
      stageTail = new Promise<void>((resolve) => {
        releaseStage = resolve;
      });
      await previousStage;
      try {
        if (attemptClosed) {
          return rejected(
            'verification-staging-attempt-retired',
            'Artifact staging attempt is already retired.'
          );
        }
        const data = exactRecord(candidate, [
          'id',
          'kind',
          'mediaType',
          'bytes',
        ]);
        if (
          !data ||
          !isToken(data.id) ||
          !input.artifactKinds.includes(
            data.kind as VerificationArtifactKind
          ) ||
          typeof data.mediaType !== 'string' ||
          !MEDIA_TYPE_PATTERN.test(data.mediaType) ||
          !(data.bytes instanceof Uint8Array)
        ) {
          return fail(
            'descriptor-drift',
            'Artifact staging descriptor is malformed or unsupported.'
          );
        }
        if (input.signal.aborted) {
          return rejected(
            'verification-staging-cancelled',
            'Artifact staging was cancelled.'
          );
        }
        const bytes = new Uint8Array(data.bytes);
        const contentDigest = computeVerificationArtifactContentDigest(bytes);
        const requestDigest = digestVerificationValue({
          id: data.id,
          kind: data.kind,
          mediaType: data.mediaType,
          digest: contentDigest,
          size: bytes.byteLength,
        });
        const previous = staged.get(data.id);
        if (previous) {
          return previous.requestDigest === requestDigest
            ? previous.receipt
            : fail(
                'duplicate-drift',
                'Artifact staging id was reused with different content.'
              );
        }
        if (
          staged.size >= 128 ||
          !Number.isSafeInteger(totalBytes + bytes.byteLength) ||
          totalBytes + bytes.byteLength > input.maximumArtifactBytes
        ) {
          return fail(
            'budget-exceeded',
            'Artifact staging exceeded its Core budget.'
          );
        }
        const result = await input.port.stage(
          Object.freeze({
            planDigest: input.planDigest,
            cellId: input.cellId,
            attemptId: input.attemptId,
            generation: input.generation,
            artifact: Object.freeze({
              id: data.id,
              kind: data.kind as VerificationArtifactKind,
              mediaType: data.mediaType,
              bytes,
            }),
          }),
          input.signal
        );
        if (attemptClosed) {
          return result.status === 'staged'
            ? fail(
                'retirement-drift',
                'Artifact staging completed after its attempt was retired.'
              )
            : rejected(
                'verification-staging-attempt-retired',
                'Artifact staging attempt is already retired.'
              );
        }
        if (result.status === 'staged') {
          const normalized = exactRecord(result, [
            'status',
            'stagingArtifactId',
            'digest',
            'size',
            'mediaType',
          ]);
          if (
            !normalized ||
            !isToken(normalized.stagingArtifactId) ||
            typeof normalized.digest !== 'string' ||
            !DIGEST_PATTERN.test(normalized.digest) ||
            normalized.digest !== contentDigest ||
            normalized.size !== bytes.byteLength ||
            normalized.mediaType !== data.mediaType ||
            stagingIds.has(normalized.stagingArtifactId)
          ) {
            return fail(
              'malformed-result',
              'Artifact staging result drifted from the staged bytes.'
            );
          }
          const receipt = Object.freeze({
            status: 'staged' as const,
            stagingArtifactId: normalized.stagingArtifactId,
            digest: contentDigest,
            size: bytes.byteLength,
            mediaType: data.mediaType,
          });
          const reference = Object.freeze({
            id: data.id,
            stagingArtifactId: normalized.stagingArtifactId,
            kind: data.kind as VerificationArtifactKind,
            digest: contentDigest,
            size: bytes.byteLength,
            mediaType: data.mediaType,
          });
          staged.set(data.id, { requestDigest, receipt, reference });
          stagingIds.add(receipt.stagingArtifactId);
          totalBytes += bytes.byteLength;
          return receipt;
        }
        const normalized = exactRecord(result, [
          'status',
          'reasonCode',
          'message',
        ]);
        if (
          !normalized ||
          !isToken(normalized.reasonCode) ||
          typeof normalized.message !== 'string' ||
          normalized.message.length < 1 ||
          normalized.message.length > 1_024
        ) {
          return fail(
            'malformed-result',
            'Artifact staging rejection is malformed.'
          );
        }
        return Object.freeze({
          status: 'rejected',
          reasonCode: normalized.reasonCode,
          message: normalized.message,
        });
      } catch {
        if (input.signal.aborted) {
          return rejected(
            'verification-staging-cancelled',
            'Artifact staging was cancelled.'
          );
        }
        return fail('malformed-result', 'Artifact staging transport failed.');
      } finally {
        releaseStage();
      }
    },
  });

  return Object.freeze({
    port,
    close(): void {
      terminal = true;
    },
    async closeAndDrain(): Promise<void> {
      terminal = true;
      await stageTail;
    },
    snapshot(): readonly VerificationAdapterStagedArtifactRef[] {
      return Object.freeze(
        [...staged.values()]
          .map(({ reference }) => reference)
          .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
      );
    },
    violation(): ArtifactStagingViolation | undefined {
      return rejectedReason;
    },
    async retire(
      signal: VerificationAbortSignal
    ): Promise<VerificationAdapterArtifactRetirementResult> {
      if (retirement) return retirement;
      terminal = true;
      attemptClosed = true;
      retirement = (async () => {
        const coordinates = Object.freeze({
          planDigest: input.planDigest,
          cellId: input.cellId,
          attemptId: input.attemptId,
          generation: input.generation,
        });
        const result = await input.retirementPort.retireAttempt(
          coordinates,
          signal
        );
        if (result.status === 'retired') {
          const normalized = exactRecord(result, [
            'status',
            'planDigest',
            'cellId',
            'attemptId',
            'generation',
          ]);
          if (
            !normalized ||
            normalized.planDigest !== input.planDigest ||
            normalized.cellId !== input.cellId ||
            normalized.attemptId !== input.attemptId ||
            normalized.generation !== input.generation
          ) {
            return Object.freeze({
              status: 'failed' as const,
              reasonCode: 'verification-staging-retirement-drift',
            });
          }
          return Object.freeze({
            status: 'retired' as const,
            ...coordinates,
          });
        }
        const normalized = exactRecord(result, ['status', 'reasonCode']);
        return Object.freeze({
          status: 'failed' as const,
          reasonCode:
            normalized && isToken(normalized.reasonCode)
              ? normalized.reasonCode
              : 'verification-staging-retirement-malformed',
        });
      })();
      return retirement;
    },
  });
};
