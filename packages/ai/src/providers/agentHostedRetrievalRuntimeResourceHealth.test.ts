import { describe, expect, it } from 'vitest';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_MAXIMUM_LIFETIME_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES,
  createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary,
  isAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  isAgentHostedRetrievalRuntimeResourceOwnerStorageSummary,
  matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
} from './agentHostedRetrievalRuntimeResource';

const CHECKED_AT = '2026-08-11T00:00:00.000Z' as Instant;
const EXPIRES_AT = '2026-08-11T00:02:05.000Z' as Instant;
const IMPLEMENTATION_DIGEST = digestAgentCanonicalValue({
  owner: 'hosted-runtime-resource-live-backend',
});

const createStorageSummary = (namespaceId = 'namespace.hosted-runtime') =>
  createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary({
    namespaceId,
    schemaContractDigest:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
    ledgerRevision: 1,
    registrationCount: 0,
    activeResourceCount: 0,
    activeReadLeaseCount: 0,
    unfinishedCleanupCount: 0,
    overdueCount: 0,
    summarizedAt: CHECKED_AT,
  });

const createStorageSummaryWithBacklog = (
  input: Readonly<{
    unfinishedCleanupCount: number;
    overdueCount: number;
  }>
) =>
  createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary({
    namespaceId: 'namespace.hosted-runtime',
    schemaContractDigest:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
    ledgerRevision: 2,
    registrationCount: 2,
    activeResourceCount: 1,
    activeReadLeaseCount: 1,
    unfinishedCleanupCount: input.unfinishedCleanupCount,
    overdueCount: input.overdueCount,
    summarizedAt: CHECKED_AT,
  });

const createReceipt = (
  input: Readonly<{
    namespaceId?: string;
    implementationDigest?: CanonicalDigest;
    expiresAt?: Instant;
  }> = {}
) =>
  createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt({
    namespaceId: input.namespaceId ?? 'namespace.hosted-runtime',
    ownerAuthorityIssuerId: 'authority.hosted-runtime-resource-owner',
    implementationDigest: input.implementationDigest ?? IMPLEMENTATION_DIGEST,
    schemaContractDigest:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
    supportedOperations:
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
    storageSummary: createStorageSummary(
      input.namespaceId ?? 'namespace.hosted-runtime'
    ),
    storageSummaryDigest: createStorageSummary(
      input.namespaceId ?? 'namespace.hosted-runtime'
    ).summaryDigest,
    checkedAt: CHECKED_AT,
    expiresAt: input.expiresAt ?? EXPIRES_AT,
  });

const binding = Object.freeze({
  namespaceId: 'namespace.hosted-runtime',
  ownerAuthorityIssuerId: 'authority.hosted-runtime-resource-owner',
  implementationDigest: IMPLEMENTATION_DIGEST,
  schemaContractDigest:
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
});

const recomputeReceipt = (
  receipt: ReturnType<typeof createReceipt>,
  changes: Readonly<Record<string, unknown>>
): unknown => {
  const { receiptDigest: _receiptDigest, ...base } = receipt;
  const changedBase = Object.freeze({ ...base, ...changes });
  return Object.freeze({
    ...changedBase,
    receiptDigest: digestAgentCanonicalValue(changedBase),
  });
};

describe('hosted retrieval runtime resource owner preactivation health', () => {
  it('binds a fresh live owner receipt to the canonical schema capability', () => {
    const receipt = createReceipt();

    expect(AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.ownerHealth).toBe(
      'hosted-retrieval-runtime-resource-owner-health'
    );
    expect(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readOwnerHealth
    ).toBe('hosted-retrieval-runtime-resource.preactivation-health.read');
    expect(
      isAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(receipt)
    ).toBe(true);
    expect(
      isAgentHostedRetrievalRuntimeResourceOwnerStorageSummary(
        receipt.storageSummary
      )
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(
        receipt,
        binding,
        '2026-08-11T00:02:04.999Z' as Instant
      )
    ).toBe(true);
    expect(Date.parse(receipt.expiresAt) - Date.parse(receipt.checkedAt)).toBe(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_MAXIMUM_LIFETIME_MS
    );
  });

  it('rejects stale half-open receipts and lifetimes beyond 125 seconds', () => {
    const receipt = createReceipt();

    expect(
      matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(
        receipt,
        binding,
        receipt.expiresAt
      )
    ).toBe(false);
    expect(() =>
      createReceipt({ expiresAt: '2026-08-11T00:02:05.001Z' as Instant })
    ).toThrow();
  });

  it('rejects self-valid foreign owner bindings and recomputed schema swaps', () => {
    const foreignNamespace = createReceipt({
      namespaceId: 'namespace.foreign',
    });
    const foreignImplementation = createReceipt({
      implementationDigest: digestAgentCanonicalValue({ owner: 'foreign' }),
    });
    const receipt = createReceipt();

    expect(
      isAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(foreignNamespace)
    ).toBe(true);
    expect(
      matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(
        foreignNamespace,
        binding,
        CHECKED_AT
      )
    ).toBe(false);
    expect(
      matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(
        foreignImplementation,
        binding,
        CHECKED_AT
      )
    ).toBe(false);
    expect(
      isAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(
        recomputeReceipt(receipt, {
          schemaContractDigest: digestAgentCanonicalValue({
            schema: 'foreign',
          }),
        })
      )
    ).toBe(false);
  });

  it('requires a repository-derived storage summary and rejects swapped summaries', () => {
    const receipt = createReceipt();
    const foreignSummary = createStorageSummary('namespace.foreign');
    const swapped = recomputeReceipt(receipt, {
      storageSummary: foreignSummary,
      storageSummaryDigest: foreignSummary.summaryDigest,
    });
    const missing = recomputeReceipt(receipt, {
      storageSummary: undefined,
      storageSummaryDigest: undefined,
    });

    expect(
      isAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(swapped)
    ).toBe(false);
    expect(
      isAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(missing)
    ).toBe(false);
    expect(() =>
      createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary({
        namespaceId: 'namespace.hosted-runtime',
        schemaContractDigest:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
        ledgerRevision: 0,
        registrationCount: 0,
        activeResourceCount: 0,
        activeReadLeaseCount: 0,
        unfinishedCleanupCount: 0,
        overdueCount: 0,
        summarizedAt: CHECKED_AT,
      })
    ).toThrow();
  });

  it('keeps backlog facts decodable while preactivation fails closed', () => {
    for (const storageSummary of [
      createStorageSummaryWithBacklog({
        unfinishedCleanupCount: 1,
        overdueCount: 0,
      }),
      createStorageSummaryWithBacklog({
        unfinishedCleanupCount: 1,
        overdueCount: 1,
      }),
    ]) {
      const receipt =
        createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt({
          namespaceId: 'namespace.hosted-runtime',
          ownerAuthorityIssuerId: 'authority.hosted-runtime-resource-owner',
          implementationDigest: IMPLEMENTATION_DIGEST,
          schemaContractDigest:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
          supportedOperations:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
          storageSummary,
          storageSummaryDigest: storageSummary.summaryDigest,
          checkedAt: CHECKED_AT,
          expiresAt: EXPIRES_AT,
        });
      expect(
        isAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(receipt)
      ).toBe(true);
      expect(
        matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(
          receipt,
          binding,
          CHECKED_AT
        )
      ).toBe(false);
    }
  });

  it('rejects extra, missing, reordered, and expanded operation projections', () => {
    const receipt = createReceipt();
    const extra = recomputeReceipt(receipt, { extra: true });
    const {
      status: _status,
      receiptDigest: _receiptDigest,
      ...missingBase
    } = receipt;
    const missing = Object.freeze({
      ...missingBase,
      receiptDigest: digestAgentCanonicalValue(missingBase),
    });
    const reordered = recomputeReceipt(receipt, {
      supportedOperations: Object.freeze(
        [
          ...AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
        ].reverse()
      ),
    });
    const expanded = recomputeReceipt(receipt, {
      supportedOperations: Object.freeze([
        ...AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
        'unknown.operation',
      ]),
    });

    expect(
      [extra, missing, reordered, expanded].every(
        (value) =>
          !isAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(value)
      )
    ).toBe(true);
  });
});
