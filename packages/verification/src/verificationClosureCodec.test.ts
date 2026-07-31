import { describe, expect, it } from 'vitest';
import { digestVerificationValue } from './verificationCanonical';
import {
  decodeVerificationClosure,
  encodeVerificationClosure,
} from './verificationClosureCodec';
import type { VerificationClosure } from './verification.types';

const digest = (character: string): string => `sha256-${character.repeat(64)}`;

const closureFixture = (): VerificationClosure => {
  const withoutDigest = Object.freeze({
    workspaceId: 'workspace-closure',
    targetRevision: 7,
    targetPartitionRevisions: Object.freeze({
      workspaceRev: 7,
      routeRev: 3,
      opSeq: 11,
      documentRevisions: Object.freeze({
        'scenario.catalog': Object.freeze({ contentRev: 2, metaRev: 1 }),
      }),
    }),
    scenarioRegistryDigest: digest('1'),
    semanticSchemaDigest: digest('2'),
    providerSetDigest: digest('3'),
    adapterRegistryDigest: digest('4'),
    impactDigest: digest('5'),
    policyRevision: 4,
    policyDigest: digest('6'),
    compilerDigest: digest('7'),
    plannerDigest: digest('8'),
    policyEvaluationInstant: '2026-07-31T08:00:00Z',
    planDigest: digest('9'),
    closureEvaluationInstant: '2026-07-31T08:05:00Z',
    evidenceSetDigest: digest('a'),
    revocationRecordDigest: digest('b'),
    baselineSetDigests: Object.freeze([digest('c')]),
    toolchainSetDigest: digest('d'),
    verdict: 'unsatisfied' as const,
    cellStatuses: Object.freeze({
      'cell.catalog': 'failed' as const,
    }),
    evidenceDigests: Object.freeze([digest('e')]),
    appliedExemptionIds: Object.freeze([]),
    issues: Object.freeze([
      Object.freeze({
        cellId: 'cell.catalog',
        status: 'failed' as const,
        message: 'The exact Scenario assertion failed.',
        evidenceIds: Object.freeze(['evidence-catalog']),
      }),
    ]),
  });
  return Object.freeze({
    ...withoutDigest,
    closureDigest: digestVerificationValue(withoutDigest),
  });
};

describe('Verification Closure wire codec', () => {
  it('round-trips strict versioned Closure JSON', () => {
    const closure = closureFixture();
    expect(
      decodeVerificationClosure(encodeVerificationClosure(closure))
    ).toEqual({ ok: true, value: closure });
  });

  it('rejects unknown fields and digest drift', () => {
    const wire = encodeVerificationClosure(closureFixture());
    expect(decodeVerificationClosure({ ...wire, vendor: true }).ok).toBe(false);
    expect(
      decodeVerificationClosure({
        ...wire,
        verdict: 'satisfied',
      }).ok
    ).toBe(false);
  });
});
