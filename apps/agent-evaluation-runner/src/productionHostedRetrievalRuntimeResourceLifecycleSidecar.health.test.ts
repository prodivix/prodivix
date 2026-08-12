import { digestAgentCanonicalValue, type Instant } from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL,
  AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES,
} from './productionOwnerAuthoritySidecarEnvironment';
import {
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderClient,
  createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecar,
} from './productionHostedRetrievalRuntimeResourceLifecycleSidecar';
import type { ProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider } from './productionHostedRetrievalRuntimeResourceProvider';

const SERVICE_TOKEN = 'hosted-lifecycle-health-service-token-value';
const NAMESPACE_ID = 'namespace.hosted-lifecycle-health';
const OWNER_INSTANCE_ID = 'owner.hosted-lifecycle-health';
const CHECKED_AT = '2026-08-12T03:00:00.000Z' as Instant;

const environment = Object.freeze({
  [AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL,
  [AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.serviceToken]:
    SERVICE_TOKEN,
});

const provider = (
  unfinishedMutationCount: number,
  overdueMutationCount: number
): ProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider =>
  Object.freeze({
    async createResource() {
      throw new TypeError('unexpected create');
    },
    async deleteResource() {
      throw new TypeError('unexpected delete');
    },
    async recoverUnfinished() {
      return Object.freeze({
        journalArchiveRecords: Object.freeze([]),
        budgetClosureProjections: Object.freeze([]),
        unfinishedMutationCount,
        overdueMutationCount,
      });
    },
    async snapshot() {
      return Object.freeze({
        journalArchiveRecords: Object.freeze([]),
        budgetClosureProjections: Object.freeze([]),
        unfinishedMutationCount,
        overdueMutationCount,
      });
    },
    async close() {
      const base = Object.freeze({
        format:
          'prodivix.agent-evaluation-provider-resource-transport-close-receipt' as const,
        version: 1 as const,
        status: 'clean' as const,
        acceptedSessionCount: 0,
        completedSessionCount: 0,
        inFlightSessionCount: 0 as const,
        closedAt: CHECKED_AT,
      });
      return Object.freeze({
        ...base,
        receiptDigest: digestAgentCanonicalValue(base),
      });
    },
  });

const withSidecar = async <T>(
  role: 'cleanup' | 'prepare' | 'recovery',
  counts: Readonly<{ unfinished: number; overdue: number }>,
  operation: () => Promise<T>
): Promise<T> => {
  const listener =
    await createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecar(
      {
        provider: provider(counts.unfinished, counts.overdue),
        serviceToken: SERVICE_TOKEN,
        role,
        namespaceId: NAMESPACE_ID,
        lifecycleOwnerInstanceId: OWNER_INSTANCE_ID,
        clock: () => new Date(CHECKED_AT),
      }
    ).listen();
  try {
    return await operation();
  } finally {
    await listener.close();
  }
};

const client = () =>
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderClient(
    { environment }
  );

describe('production hosted lifecycle Sidecar health', () => {
  it('requires fresh durable zero backlog for prepare and cleanup startup', async () => {
    for (const role of ['prepare', 'cleanup'] as const) {
      await withSidecar(
        role,
        { unfinished: role === 'prepare' ? 1 : 0, overdue: 1 },
        async () => {
          await expect(client().readHealth()).rejects.toThrow();
        }
      );
    }
  });

  it('admits recovery with a durable restart backlog and reports its exact counts', async () => {
    await withSidecar('recovery', { unfinished: 2, overdue: 1 }, async () => {
      await expect(client().readHealth()).resolves.toMatchObject({
        status: 'ready',
        role: 'recovery',
        namespaceId: NAMESPACE_ID,
        lifecycleOwnerInstanceId: OWNER_INSTANCE_ID,
        unfinishedMutationCount: 2,
        overdueMutationCount: 1,
      });
    });
  });

  it('returns canonical ready health at exact zero for every lifecycle role', async () => {
    for (const role of ['prepare', 'cleanup', 'recovery'] as const) {
      await withSidecar(role, { unfinished: 0, overdue: 0 }, async () => {
        await expect(client().readHealth()).resolves.toMatchObject({
          status: 'ready',
          role,
          unfinishedMutationCount: 0,
          overdueMutationCount: 0,
        });
      });
    }
  });
});
