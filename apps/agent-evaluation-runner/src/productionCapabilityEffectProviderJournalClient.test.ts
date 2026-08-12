import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE_HEADER,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
  createAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt,
  createAgentEvaluationCapabilityEffectProviderJournalCleanupRequest,
  createAgentEvaluationCapabilityEffectProviderJournalHealth,
  createAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt,
  digestAgentCanonicalValue,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME,
  createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalClient,
  createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalHealthReader,
} from './productionCapabilityEffectProviderJournalClient';

const namespaceId = 'evaluation.namespace.provider-journal';
const planDigest = digestAgentCanonicalValue({
  fixture: 'provider-journal-plan',
});
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const ownerInstanceId = 'owner.provider-journal.8790.1';
const token = 'provider-journal-service-token-0123456789abcdef';
const checkedAt = '2026-08-11T00:00:00.000Z';
const expiresAt = '2026-08-11T00:02:00.000Z';

const environment = (name: string): string | undefined => {
  switch (name) {
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl:
      return AGENT_EVALUATION_LEDGER_BASE_URL;
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace:
      return namespaceId;
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit:
      return repositoryCommit;
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token:
      return token;
    case PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME:
      return ownerInstanceId;
    default:
      return undefined;
  }
};

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(canonicalJsonText(value), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

const assertTransportHeaders = (init?: RequestInit): Headers => {
  const headers = new Headers(init?.headers);
  expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
  expect(
    headers.get(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE_HEADER
    )
  ).toBe(AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE);
  return headers;
};

const createClient = (fetchImplementation: typeof fetch) =>
  createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalClient(
    {
      planDigest,
      repositoryCommit,
      environment,
      fetch: fetchImplementation,
      clock: () => new Date('2026-08-11T00:00:01.000Z'),
      forbiddenCanaries: () => Object.freeze([]),
    }
  );

describe('production capability-effect Provider journal client', () => {
  it('reads namespace health before a plan exists without consulting plan or repository scope', async () => {
    const health = createAgentEvaluationCapabilityEffectProviderJournalHealth({
      authorityId:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityId,
      authorityDigest:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityDigest,
      ownerInstanceId,
      retentionPolicyDigest:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
      status: 'healthy',
      residualEncryptedSpoolCount: 0,
      expiredEncryptedSpoolCount: 0,
      unfinishedOwnerCount: 0,
      overdueUnfinishedOwnerCount: 0,
      abandonedOwnerCount: 0,
      checkedAt,
      expiresAt,
    });
    const reads: string[] = [];
    const healthEnvironment = (name: string): string | undefined => {
      reads.push(name);
      if (name === AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl) {
        return AGENT_EVALUATION_LEDGER_BASE_URL;
      }
      if (name === AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace) {
        return namespaceId;
      }
      if (name === AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token) {
        return token;
      }
      if (
        name ===
        PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME
      ) {
        return ownerInstanceId;
      }
      return undefined;
    };
    const fetchImplementation = vi.fn(
      async (source: string | URL | Request, init?: RequestInit) => {
        expect(new URL(String(source)).pathname).toBe(
          `/v1/evaluations/${namespaceId}/capability-effect-provider-runtime-journal/health`
        );
        assertTransportHeaders(init);
        return jsonResponse(health);
      }
    ) as unknown as typeof fetch;

    await expect(
      createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalHealthReader(
        {
          environment: healthEnvironment,
          fetch: fetchImplementation,
          clock: () => new Date('2026-08-11T00:00:01.000Z'),
        }
      ).readHealth()
    ).resolves.toEqual(health);
    expect(reads).not.toContain(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
    );
  });

  it('reads only a fresh, healthy, purpose-bound fixed authority', async () => {
    const health = createAgentEvaluationCapabilityEffectProviderJournalHealth({
      authorityId:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityId,
      authorityDigest:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityDigest,
      ownerInstanceId,
      retentionPolicyDigest:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
      status: 'healthy',
      residualEncryptedSpoolCount: 0,
      expiredEncryptedSpoolCount: 0,
      unfinishedOwnerCount: 0,
      overdueUnfinishedOwnerCount: 0,
      abandonedOwnerCount: 0,
      checkedAt,
      expiresAt,
    });
    const fetchImplementation = vi.fn(
      async (source: string | URL | Request, init?: RequestInit) => {
        expect(new URL(String(source)).pathname).toBe(
          `/v1/evaluations/${namespaceId}/capability-effect-provider-runtime-journal/health`
        );
        const headers = assertTransportHeaders(init);
        expect(headers.get('Idempotency-Key')).toBeNull();
        expect(init?.method).toBe('GET');
        return jsonResponse(health);
      }
    ) as unknown as typeof fetch;

    await expect(
      createClient(fetchImplementation).readHealth()
    ).resolves.toEqual(health);
  });

  it('sends exact cleanup and validates the attempt-scoped zero-residual receipt', async () => {
    const request =
      createAgentEvaluationCapabilityEffectProviderJournalCleanupRequest({
        namespaceId,
        planDigest,
        repositoryCommit,
        attemptId: 'attempt.provider-journal.1',
        reason: 'attempt-terminal',
        requestedAt: checkedAt,
      });
    const cleanupReceipt =
      createAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt({
        requestDigest: request.requestDigest,
        destroyedEncryptedSpoolCount: 0,
        abandonmentDispositionReceiptDigests: Object.freeze([]),
        abandonmentRecordDigests: Object.freeze([]),
        residualEncryptedSpoolCount: 0,
        unfinishedOwnerCount: 0,
        completedAt: '2026-08-11T00:00:00.500Z',
      });
    const zeroResidual =
      createAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt({
        namespaceId,
        planDigest,
        repositoryCommit,
        attemptId: request.attemptId,
        journalAuthorityDigest:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityDigest,
        residualEncryptedSpoolCount: 0,
        unfinishedOwnerCount: 0,
        abandonedSpoolCount: 0,
        abandonedOwnerCount: 0,
        checkedAt,
        expiresAt,
      });
    const paths: string[] = [];
    const fetchImplementation = vi.fn(
      async (source: string | URL | Request, init?: RequestInit) => {
        const path = new URL(String(source)).pathname;
        paths.push(path);
        const headers = assertTransportHeaders(init);
        if (init?.method === 'POST') {
          expect(headers.get('Idempotency-Key')).toBe(request.requestDigest);
          expect(JSON.parse(String(init.body))).toEqual(request);
          return jsonResponse(cleanupReceipt, 201);
        }
        expect(init?.method).toBe('GET');
        expect(headers.get('Idempotency-Key')).toBeNull();
        return jsonResponse(zeroResidual);
      }
    ) as unknown as typeof fetch;
    const client = createClient(fetchImplementation);

    await expect(client.cleanup(request)).resolves.toEqual(cleanupReceipt);
    await expect(client.readZeroResidual(request.attemptId)).resolves.toEqual(
      zeroResidual
    );
    const partition = `/v1/evaluations/${namespaceId}/${planDigest}/${repositoryCommit}/capability-effect-provider-runtime-journal`;
    expect(paths).toEqual([
      `${partition}/cleanup`,
      `${partition}/attempts/${request.attemptId}/zero-residual`,
    ]);
  });

  it('consumes and rejects a body-bearing 404 owner snapshot response', async () => {
    const drifted = new Response('{"unexpected":true}', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
    const fetchImplementation = vi.fn(
      async () => drifted
    ) as unknown as typeof fetch;
    const ownerRequestDigest = digestAgentCanonicalValue({
      fixture: 'absent-owner-request',
    });

    await expect(
      createClient(fetchImplementation).readSnapshot(ownerRequestDigest)
    ).resolves.toBeUndefined();
    expect(drifted.bodyUsed).toBe(true);
  });
});
