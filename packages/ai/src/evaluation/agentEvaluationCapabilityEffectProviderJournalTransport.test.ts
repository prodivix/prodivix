import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENVELOPE_AUTHORITY_FORMAT,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION,
  isAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority,
} from './agentEvaluationCapabilityEffectProviderJournalSpool';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY,
  createAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt,
  createAgentEvaluationCapabilityEffectProviderJournalCleanupRequest,
  createAgentEvaluationCapabilityEffectProviderJournalHealth,
  createAgentEvaluationCapabilityEffectProviderJournalRoutes,
  createAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt,
  doesAgentEvaluationCapabilityEffectProviderJournalCleanupReceiptMatchRequest,
  isAgentEvaluationCapabilityEffectProviderJournalHealth,
  isAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt,
} from './agentEvaluationCapabilityEffectProviderJournalTransport';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const repositoryCommit = '1234567890abcdef1234567890abcdef12345678';

describe('capability effect Provider journal transport contracts', () => {
  it('freezes the purpose-bound health and partition routes', () => {
    const planDigest = digest('plan');
    const routes = createAgentEvaluationCapabilityEffectProviderJournalRoutes({
      namespaceId: 'namespace.release',
      planDigest,
      repositoryCommit,
    });
    const base = `/v1/evaluations/namespace.release/${encodeURIComponent(planDigest)}/${repositoryCommit}/capability-effect-provider-runtime-journal`;
    expect(routes.health).toBe(
      '/v1/evaluations/namespace.release/capability-effect-provider-runtime-journal/health'
    );
    expect(routes.stages).toBe(`${base}/stages`);
    expect(routes.executions).toBe(`${base}/executions`);
    expect(routes.results).toBe(`${base}/results`);
    expect(routes.ownerRequest(digest('owner-request'))).toBe(
      `${base}/owner-requests/${encodeURIComponent(digest('owner-request'))}`
    );
    expect(routes.cleanup).toBe(`${base}/cleanup`);
    expect(routes.zeroResidual('attempt.release')).toBe(
      `${base}/attempts/attempt.release/zero-residual`
    );
  });

  it('keeps health subset counts and status exact under recomputed digests', () => {
    const health = createAgentEvaluationCapabilityEffectProviderJournalHealth({
      authorityId:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityId,
      authorityDigest:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityDigest,
      ownerInstanceId: 'journal-owner.release',
      retentionPolicyDigest:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
      status: 'unavailable',
      residualEncryptedSpoolCount: 1,
      expiredEncryptedSpoolCount: 1,
      unfinishedOwnerCount: 1,
      overdueUnfinishedOwnerCount: 1,
      abandonedOwnerCount: 0,
      checkedAt: '2026-08-09T07:00:00.000Z',
      expiresAt: '2026-08-09T07:02:05.000Z',
    });
    expect(isAgentEvaluationCapabilityEffectProviderJournalHealth(health)).toBe(
      true
    );

    const { healthDigest: _healthDigest, ...healthBase } = health;
    const impossibleExpiredBase = Object.freeze({
      ...healthBase,
      residualEncryptedSpoolCount: 0,
    });
    expect(
      isAgentEvaluationCapabilityEffectProviderJournalHealth(
        Object.freeze({
          ...impossibleExpiredBase,
          healthDigest: digestAgentCanonicalValue(impossibleExpiredBase),
        })
      )
    ).toBe(false);

    const impossibleOverdueBase = Object.freeze({
      ...healthBase,
      unfinishedOwnerCount: 0,
    });
    expect(
      isAgentEvaluationCapabilityEffectProviderJournalHealth(
        Object.freeze({
          ...impossibleOverdueBase,
          healthDigest: digestAgentCanonicalValue(impossibleOverdueBase),
        })
      )
    ).toBe(false);
  });

  it('binds abandoned spool counts to bounded abandoned owners', () => {
    const receipt =
      createAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt({
        namespaceId: 'namespace.release',
        planDigest: digest('plan'),
        repositoryCommit,
        attemptId: 'attempt.release',
        journalAuthorityDigest:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityDigest,
        residualEncryptedSpoolCount: 0,
        unfinishedOwnerCount: 0,
        abandonedSpoolCount: 4,
        abandonedOwnerCount: 1,
        checkedAt: '2026-08-09T07:00:00.000Z',
        expiresAt: '2026-08-09T07:02:05.000Z',
      });
    expect(
      isAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt(
        receipt
      )
    ).toBe(true);

    const { receiptDigest: _receiptDigest, ...receiptBase } = receipt;
    const impossibleBase = Object.freeze({
      ...receiptBase,
      abandonedOwnerCount: 0,
    });
    expect(
      isAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt(
        Object.freeze({
          ...impossibleBase,
          receiptDigest: digestAgentCanonicalValue(impossibleBase),
        })
      )
    ).toBe(false);
  });

  it('cross-validates cleanup timing and bounded disposition ownership', () => {
    const request =
      createAgentEvaluationCapabilityEffectProviderJournalCleanupRequest({
        namespaceId: 'namespace.release',
        planDigest: digest('plan'),
        repositoryCommit,
        attemptId: 'attempt.release',
        reason: 'cleanup-requested',
        requestedAt: '2026-08-09T07:00:00.000Z',
      });
    const dispositionDigests = Object.freeze(
      [0, 1, 2, 3].map((index) => digest(`disposition-${index}`)).sort()
    );
    const receipt =
      createAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt({
        requestDigest: request.requestDigest,
        destroyedEncryptedSpoolCount: dispositionDigests.length,
        abandonmentDispositionReceiptDigests: dispositionDigests,
        abandonmentRecordDigests: Object.freeze([digest('abandonment-record')]),
        residualEncryptedSpoolCount: 0,
        unfinishedOwnerCount: 0,
        completedAt: '2026-08-09T07:00:01.000Z',
      });
    expect(
      doesAgentEvaluationCapabilityEffectProviderJournalCleanupReceiptMatchRequest(
        request,
        receipt
      )
    ).toBe(true);

    const earlyReceipt =
      createAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt({
        requestDigest: request.requestDigest,
        destroyedEncryptedSpoolCount: 0,
        abandonmentDispositionReceiptDigests: Object.freeze([]),
        abandonmentRecordDigests: Object.freeze([]),
        residualEncryptedSpoolCount: 0,
        unfinishedOwnerCount: 0,
        completedAt: '2026-08-09T06:59:59.999Z',
      });
    expect(
      doesAgentEvaluationCapabilityEffectProviderJournalCleanupReceiptMatchRequest(
        request,
        earlyReceipt
      )
    ).toBe(false);
    expect(() =>
      createAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt({
        requestDigest: request.requestDigest,
        destroyedEncryptedSpoolCount: 5,
        abandonmentDispositionReceiptDigests: Object.freeze(
          [0, 1, 2, 3, 4]
            .map((index) => digest(`overflow-disposition-${index}`))
            .sort()
        ),
        abandonmentRecordDigests: Object.freeze([
          digest('single-abandonment-record'),
        ]),
        residualEncryptedSpoolCount: 0,
        unfinishedOwnerCount: 0,
        completedAt: '2026-08-09T07:00:01.000Z',
      })
    ).toThrow(/cleanup receipt is invalid/u);
  });

  it('rejects non-canonical raw base64url even when the envelope digest is recomputed', () => {
    const envelopeDigestFor = (
      authenticationTagBase64Url: string,
      keyId: string = AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID
    ) =>
      digestAgentCanonicalValue({
        algorithm: 'aes-256-gcm',
        keyId,
        keyVersion: 1,
        keyRefDigest:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
        encryptionProfileDigest:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
        nonceBase64Url: 'AAAAAAAAAAAAAAAA',
        authenticationTagBase64Url,
        ciphertextDigest: digest('journal-spool-ciphertext'),
        ciphertextSizeBytes: 1,
        aadDigest: digest('journal-spool-aad'),
      });
    const authorityFor = (authenticationTagBase64Url: string) =>
      Object.freeze({
        format:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENVELOPE_AUTHORITY_FORMAT,
        version: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_VERSION,
        spoolRef: 'provider-runtime-spool.release',
        algorithm: 'aes-256-gcm' as const,
        keyId: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
        keyVersion: 1,
        keyRefDigest:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
        encryptionProfileDigest:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
        nonceBase64Url: 'AAAAAAAAAAAAAAAA',
        authenticationTagBase64Url,
        ciphertextDigest: digest('journal-spool-ciphertext'),
        ciphertextSizeBytes: 1,
        aadDigest: digest('journal-spool-aad'),
        envelopeDigest: envelopeDigestFor(authenticationTagBase64Url),
      });

    expect(
      isAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
        authorityFor('AAAAAAAAAAAAAAAAAAAAAA')
      )
    ).toBe(true);
    expect(
      isAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
        authorityFor('AAAAAAAAAAAAAAAAAAAAAB')
      )
    ).toBe(false);
    const foreignKeyAuthorityBase = Object.freeze({
      ...authorityFor('AAAAAAAAAAAAAAAAAAAAAA'),
      keyId: 'key.g4-model-eval.foreign-spool.v1',
    });
    expect(
      isAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
        Object.freeze({
          ...foreignKeyAuthorityBase,
          envelopeDigest: envelopeDigestFor(
            foreignKeyAuthorityBase.authenticationTagBase64Url,
            foreignKeyAuthorityBase.keyId
          ),
        })
      )
    ).toBe(false);
  });
});
