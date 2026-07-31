import { describe, expect, it } from 'vitest';
import {
  assessVerificationCiPromotion,
  createVerificationCiJobContext,
  decodeVerificationCiJobContext,
  encodeVerificationCiJobContext,
} from './verificationCiJobContext';

const digest = (character: string): string => `sha256-${character.repeat(64)}`;

const contextFixture = () =>
  createVerificationCiJobContext({
    identity: Object.freeze({
      repository: 'github:prodivix/prodivix',
      ref: 'refs/heads/main',
      commit: `sha1-${'a'.repeat(40)}`,
    }),
    event: 'push',
    sourceRepository: 'github:prodivix/prodivix',
    runId: '30494182310',
    runAttempt: 1,
    jobId: 'g3-product',
    workflowRef:
      'prodivix/prodivix/.github/workflows/g3-boundaries.yml@refs/heads/main',
    oidc: Object.freeze({
      issuer: 'https://token.actions.githubusercontent.com',
      audience: 'prodivix-verification',
      subject: 'repo:prodivix/prodivix:ref:refs/heads/main',
      workflowRef:
        'prodivix/prodivix/.github/workflows/g3-boundaries.yml@refs/heads/main',
      claimsDigest: digest('b'),
      proofDigest: digest('c'),
      verifiedAt: '2026-07-31T08:00:00Z',
    }),
  });

describe('Verification CI job admission', () => {
  it('admits an exact push identity and round-trips versioned context', () => {
    const context = contextFixture();
    expect(
      decodeVerificationCiJobContext(encodeVerificationCiJobContext(context))
    ).toEqual({ ok: true, value: context });
    expect(assessVerificationCiPromotion(context)).toEqual({
      status: 'allowed',
      contextDigest: context.contextDigest,
    });
  });

  it('hard-cuts fork and pull-request promotion', () => {
    const context = contextFixture();
    expect(
      assessVerificationCiPromotion(
        createVerificationCiJobContext({
          ...context,
          sourceRepository: 'github:someone/fork',
        })
      )
    ).toMatchObject({ status: 'forbidden', reason: 'fork' });
    expect(
      assessVerificationCiPromotion(
        createVerificationCiJobContext({
          ...context,
          event: 'pull_request',
        })
      )
    ).toMatchObject({ status: 'forbidden', reason: 'untrusted-event' });
  });

  it('rejects digest drift and credential-shaped extra fields', () => {
    const wire = encodeVerificationCiJobContext(contextFixture());
    expect(
      decodeVerificationCiJobContext({
        ...wire,
        token: 'must-never-enter-the-contract',
      }).ok
    ).toBe(false);
    expect(
      decodeVerificationCiJobContext({
        ...wire,
        runAttempt: 2,
      }).ok
    ).toBe(false);
  });
});
