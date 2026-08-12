import { describe, expect, it } from 'vitest';
import { decodeCanonicalBase64 } from '@prodivix/shared/canonical';
import {
  digestAgentCanonicalBytes,
  digestAgentCanonicalValue,
} from '../domain/agentCanonical';
import {
  decodeAgentEvaluationFact,
  encodeAgentEvaluationFact,
} from './agentEvaluationCodec';
import {
  createAgentEvaluationReviewCandidate,
  createAgentEvaluationReviewRasterScanReceipt,
  isAgentEvaluationReviewCandidate,
} from './agentEvaluationResults';

const pngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const digest = (label: string) => digestAgentCanonicalValue({ label });

const bytesToBase64 = (bytes: Uint8Array): string => {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const chunk = (first << 16) | (second << 8) | third;
    result += alphabet[(chunk >>> 18) & 63];
    result += alphabet[(chunk >>> 12) & 63];
    result += index + 1 < bytes.length ? alphabet[(chunk >>> 6) & 63] : '=';
    result += index + 2 < bytes.length ? alphabet[chunk & 63] : '=';
  }
  return result;
};

const candidateInput = (): Parameters<
  typeof createAgentEvaluationReviewCandidate
>[0] => {
  const rasterBytes = decodeCanonicalBase64(pngBase64, {
    label: 'Test raster',
    maximumBytes: 2_097_152,
  });
  const base = {
    candidateId: 'review-candidate.1',
    attemptId: 'evaluation-attempt.1',
    planDigest: digest('plan'),
    repositoryCommit: 'a'.repeat(40),
    descriptorDigest: digest('descriptor'),
    responseDigest: digest('response'),
    executionReceiptDigest: digest('execution-receipt'),
    graderArtifactDigest: digest('grader-artifact'),
    projectionAuthorityDigest: digest('projection-authority'),
    mediaType: 'image/png',
    width: 1,
    height: 1,
    bytesBase64: pngBase64,
    generatedAt: '2026-08-08T00:00:00.000Z',
  } as const;
  return {
    ...base,
    scanReceipt: createAgentEvaluationReviewRasterScanReceipt({
      scanReceiptId: 'review-raster-scan.1',
      planDigest: base.planDigest,
      repositoryCommit: base.repositoryCommit,
      attemptId: base.attemptId,
      descriptorDigest: base.descriptorDigest,
      projectionAuthorityDigest: base.projectionAuthorityDigest,
      mediaType: base.mediaType,
      width: base.width,
      height: base.height,
      byteLength: rasterBytes.byteLength,
      policyDigest: digest('raster-scan-policy'),
      bytesDigest: digestAgentCanonicalBytes(rasterBytes),
      decodedPixelDigest: digest('decoded-rgba8-pixels'),
      metadataProfileDigest: digest('raster-metadata-profile'),
      canarySetDigest: digest('canary-set'),
      fingerprintSetDigest: digest('fingerprint-set'),
      findingDigests: Object.freeze([]),
      verdict: 'safe',
      scannedAt: '2026-08-07T23:59:59.000Z',
    }),
  };
};

const createCandidate = () =>
  createAgentEvaluationReviewCandidate(candidateInput());

describe('AgentEvaluationReviewCandidate', () => {
  it('binds exact canonical raster bytes and round-trips through the fact codec', () => {
    const candidate = createCandidate();
    expect(isAgentEvaluationReviewCandidate(candidate)).toBe(true);
    const rasterBytes = decodeCanonicalBase64(pngBase64, {
      label: 'Test raster',
      maximumBytes: 2_097_152,
    });
    expect(candidate.bytesDigest).toBe(digestAgentCanonicalBytes(rasterBytes));
    expect(candidate.byteLength).toBe(rasterBytes.byteLength);
    expect(candidate.publicArtifactScanDigest).toBe(
      candidateInput().scanReceipt.receiptDigest
    );
    const encoded = encodeAgentEvaluationFact({
      factType: 'evaluation-review-candidate',
      value: candidate,
    });
    expect(decodeAgentEvaluationFact(encoded)).toEqual({
      ok: true,
      value: {
        factType: 'evaluation-review-candidate',
        value: candidate,
      },
    });
  });

  it('rejects digest, body-shape, media, and dimension drift', () => {
    const candidate = createCandidate();
    expect(
      isAgentEvaluationReviewCandidate({
        ...candidate,
        bytesDigest: digest('drifted'),
      })
    ).toBe(false);
    expect(
      decodeAgentEvaluationFact({
        ...encodeAgentEvaluationFact({
          factType: 'evaluation-review-candidate',
          value: candidate,
        }),
        value: { ...candidate, rawResponse: 'forbidden' },
      }).ok
    ).toBe(false);
    expect(() =>
      createAgentEvaluationReviewCandidate({
        ...candidateInput(),
        mediaType: 'image/webp',
      })
    ).toThrow(/raster or dimensions/u);
    expect(() =>
      createAgentEvaluationReviewCandidate({
        ...candidateInput(),
        width: 2,
      })
    ).toThrow(/raster or dimensions/u);
  });

  it('rejects arbitrary review text and protected-reference fields', () => {
    for (const extra of [
      { targetRefs: ['target://protected-case'] },
      { sourceRefs: ['source://protected-corpus'] },
      { actionIds: ['action.protected'] },
      { context: 'holdout context' },
      { artifact: { arbitrary: 'json' } },
    ]) {
      expect(() =>
        createAgentEvaluationReviewCandidate({
          ...candidateInput(),
          ...extra,
        } as Parameters<typeof createAgentEvaluationReviewCandidate>[0])
      ).toThrow(/input shape/u);
    }
  });

  it('rejects malformed and oversized decoded raster bytes', () => {
    expect(() =>
      createAgentEvaluationReviewCandidate({
        ...candidateInput(),
        bytesBase64: bytesToBase64(
          new TextEncoder().encode('{"raw":"response"}')
        ),
      })
    ).toThrow(/raster or dimensions/u);
    expect(() =>
      createAgentEvaluationReviewCandidate({
        ...candidateInput(),
        bytesBase64: bytesToBase64(new Uint8Array(2_097_153)),
      })
    ).toThrow(/bounded canonical base64/u);
  });

  it('requires a safe structured scan receipt with exact raster bindings', () => {
    const input = candidateInput();
    const {
      format: _format,
      version: _version,
      receiptDigest: _receiptDigest,
      ...scanInput
    } = input.scanReceipt;
    expect(() =>
      createAgentEvaluationReviewCandidate({
        ...input,
        scanReceipt: createAgentEvaluationReviewRasterScanReceipt({
          ...scanInput,
          findingDigests: Object.freeze([digest('protected-fingerprint')]),
          verdict: 'blocked',
        }),
      })
    ).toThrow(/scan binding/u);
    expect(() =>
      createAgentEvaluationReviewCandidate({
        ...input,
        scanReceipt: createAgentEvaluationReviewRasterScanReceipt({
          ...scanInput,
          bytesDigest: digest('different-raster'),
        }),
      })
    ).toThrow(/scan binding/u);
  });
});
