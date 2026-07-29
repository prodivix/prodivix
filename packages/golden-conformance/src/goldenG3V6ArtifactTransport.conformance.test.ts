import { describe, expect, it } from 'vitest';
import { digestVerificationValue } from '@prodivix/verification';
import { createGoldenG3V6ArtifactTransport } from './goldenG3V6ArtifactTransport';

const signal = Object.freeze({
  aborted: false,
  subscribe: () => () => undefined,
});

describe('Golden G3 V6 artifact transport', () => {
  it('rejects forbidden staged bytes and still retires their attempt', async () => {
    const transport = createGoldenG3V6ArtifactTransport({
      forbiddenTextMarkers: ['__GOLDEN_FORBIDDEN_CANARY__'],
    });
    const coordinates = Object.freeze({
      planDigest: `sha256-${'a'.repeat(64)}`,
      cellId: 'cell:artifact-canary',
      attemptId: 'attempt:artifact-canary',
      generation: 1,
    });
    await expect(
      transport.staging.stage(
        {
          ...coordinates,
          artifact: {
            id: 'artifact:trace',
            kind: 'trace',
            mediaType: 'application/json',
            bytes: new TextEncoder().encode(
              '{"value":"__GOLDEN_FORBIDDEN_CANARY__"}'
            ),
          },
        },
        signal
      )
    ).resolves.toMatchObject({
      status: 'rejected',
      reasonCode: 'verification-staging-forbidden-marker',
    });
    expect(transport.snapshot()).toMatchObject({
      activeAttemptCount: 1,
      activeArtifactCount: 0,
      inspectedArtifactCount: 1,
      forbiddenMarkerHitCount: 1,
    });
    await expect(
      transport.retirement.retireAttempt(coordinates, signal)
    ).resolves.toMatchObject({ status: 'retired' });
    expect(transport.snapshot()).toMatchObject({
      activeAttemptCount: 0,
      retiredAttemptCount: 1,
      retirementReceiptCount: 1,
      retirementCallCount: 1,
      duplicateRetirementCount: 0,
      lateWriteRejectionCount: 0,
      activeArtifactCount: 0,
      inspectedArtifactCount: 1,
      forbiddenMarkerHitCount: 1,
    });
  });

  it('keeps the first retirement receipt and tracks replay and late writes', async () => {
    const transport = createGoldenG3V6ArtifactTransport();
    const coordinates = Object.freeze({
      planDigest: `sha256-${'b'.repeat(64)}`,
      cellId: 'cell:artifact-retirement',
      attemptId: 'attempt:artifact-retirement',
      generation: 1,
    });
    const staged = await transport.staging.stage(
      {
        ...coordinates,
        artifact: {
          id: 'artifact:trace',
          kind: 'trace',
          mediaType: 'application/json',
          bytes: new TextEncoder().encode('{"status":"passed"}'),
        },
      },
      signal
    );
    expect(staged.status).toBe('staged');

    const first = await transport.retirement.retireAttempt(coordinates, signal);
    const receipt = transport.readRetirementReceipt(coordinates);
    const { receiptDigest, ...receiptIdentity } = receipt;
    expect(receiptDigest).toBe(digestVerificationValue(receiptIdentity));
    expect(receipt).toMatchObject({
      retiredArtifactCount: 1,
      postState: {
        writable: false,
        activeArtifactCount: 0,
      },
    });
    expect(first).toEqual({
      status: 'retired',
      ...coordinates,
    });

    const replay = await transport.retirement.retireAttempt(
      coordinates,
      signal
    );
    expect(replay).toEqual({
      status: 'retired',
      ...coordinates,
    });
    expect(transport.readRetirementReceipt(coordinates)).toBe(receipt);
    await expect(
      transport.staging.stage(
        {
          ...coordinates,
          artifact: {
            id: 'artifact:late',
            kind: 'trace',
            mediaType: 'application/json',
            bytes: new TextEncoder().encode('{"late":true}'),
          },
        },
        signal
      )
    ).resolves.toMatchObject({
      status: 'rejected',
      reasonCode: 'verification-attempt-retired',
    });
    expect(transport.snapshot()).toMatchObject({
      activeAttemptCount: 0,
      retiredAttemptCount: 1,
      retirementReceiptCount: 1,
      retirementCallCount: 2,
      duplicateRetirementCount: 1,
      lateWriteRejectionCount: 1,
      activeArtifactCount: 0,
    });
  });
});
