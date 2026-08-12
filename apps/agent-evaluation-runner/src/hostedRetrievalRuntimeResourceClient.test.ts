import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSE_HEADER,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES,
  createAgentHostedRetrievalRuntimeResourceActiveState,
  createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary,
  createAgentHostedRetrievalRuntimeResourceReadReceipt,
  createAgentHostedRetrievalRuntimeResourceReadRequest,
  createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt,
  createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
  digestAgentCanonicalValue,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { createAgentHostedRetrievalRuntimeResourceExact4Fixture } from '../../../packages/ai/src/__tests__/agentHostedRetrievalRuntimeResourceFixtures';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceClient,
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient,
} from './hostedRetrievalRuntimeResourceClient';

const COMMIT = 'a'.repeat(40);
const REQUESTED_AT = '2026-08-11T00:00:00.000Z' as Instant;
const CHECKED_AT = '2026-08-11T00:00:01.000Z' as Instant;
const OBSERVED_AT = '2026-08-11T00:00:03.000Z' as Instant;
const LOOKUP_EXPIRES_AT = '2026-08-11T00:02:06.000Z' as Instant;
const READ_EXPIRES_AT = '2026-08-11T00:02:38.000Z' as Instant;
const READ_LEASE_NOT_AFTER = '2026-08-11T00:03:01.000Z' as Instant;
const RESOURCE_EXPIRES_AT = '2026-08-13T00:00:00.000Z' as Instant;
const token = 'hosted-runtime-resource-service-token-0123456789';

const digest = (label: string): CanonicalDigest =>
  digestAgentCanonicalValue({ test: 'hosted-runtime-client', label });

const scope = Object.freeze({
  namespaceId: 'namespace.hosted-runtime-client',
  repositoryCommit: COMMIT,
  planDigest: digest('plan'),
  frozenRunDigest: digest('frozen-run'),
  runConfigArtifactBindingDigest: digest('run-config-binding'),
});

const fixture = () =>
  createAgentHostedRetrievalRuntimeResourceExact4Fixture({
    ...scope,
    runtimeResourceSetId: 'runtime-resource-set.client',
    registeredAt: REQUESTED_AT,
    expiresAt: RESOURCE_EXPIRES_AT,
  });

const environment = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: scope.namespaceId,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    scope.repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
});

const canonicalResponse = (value: unknown): Response =>
  new Response(canonicalJsonText(value), {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

describe('hosted retrieval runtime resource client', () => {
  it('uses purpose-bound raw discovery and active-read wire', async () => {
    const exact4 = fixture();
    const lookupRequest =
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest({
        ...scope,
        registrationIntentBindings: exact4.registrationResults.map(
          ({ registrationRequest }) =>
            Object.freeze({
              protocolFamily: registrationRequest.protocolFamily,
              capabilityProfileId: registrationRequest.capabilityProfileId,
              registrationIntentDigest:
                registrationRequest.registrationIntentDigest,
            })
        ),
        requestedAt: REQUESTED_AT,
      });
    const authority = exact4.registrationResults[0]!.authority;
    const readRequest = createAgentHostedRetrievalRuntimeResourceReadRequest({
      namespaceId: scope.namespaceId,
      repositoryCommit: scope.repositoryCommit,
      planDigest: scope.planDigest,
      runConfigArtifactBindingDigest: scope.runConfigArtifactBindingDigest,
      runtimeResourceSetId: authority.runtimeResourceSetId,
      authorityDigest: authority.authorityDigest,
      resourceSetCommitmentDigest:
        exact4.resourceSetCommitment.commitmentDigest,
      readerOwnerInstanceId: 'reader.hosted-runtime-client',
      readLeaseId: 'read-lease.hosted-runtime-client',
      minimumExpiresAt: READ_EXPIRES_AT,
    });
    let observedAt = OBSERVED_AT;
    const calls: Readonly<{
      url: string;
      purpose: string | null;
      idempotencyKey: string | null;
      body: unknown;
    }>[] = [];
    const client =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceClient({
        ...scope,
        environment,
        clock: () => new Date(observedAt),
        fetch: async (url, init) => {
          const headers = new Headers(init?.headers);
          const body = JSON.parse(String(init?.body)) as unknown;
          (
            calls as {
              url: string;
              purpose: string | null;
              idempotencyKey: string | null;
              body: unknown;
            }[]
          ).push({
            url: String(url),
            purpose: headers.get(
              AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSE_HEADER
            ),
            idempotencyKey: headers.get('Idempotency-Key'),
            body,
          });
          if (
            String(url).endsWith(
              `/${AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.registrationResults}`
            )
          ) {
            return canonicalResponse(
              createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
                lookupRequest,
                exact4.registrationResults,
                {
                  lookupAuthorityIssuerId:
                    'backend.hosted-runtime-registration-set',
                  lookupAuthorityImplementationDigest: digest(
                    'lookup-implementation'
                  ),
                  lookupLedgerRevision: 9,
                  checkedAt: CHECKED_AT,
                  expiresAt: LOOKUP_EXPIRES_AT,
                }
              )
            );
          }
          const activeState =
            createAgentHostedRetrievalRuntimeResourceActiveState(
              authority,
              exact4.resourceSetCommitment,
              {
                activeOwnerInstanceId: readRequest.readerOwnerInstanceId,
                claimGeneration: 4,
                readLeaseNotAfter: READ_LEASE_NOT_AFTER,
                updatedAt: CHECKED_AT,
              }
            );
          return canonicalResponse(
            createAgentHostedRetrievalRuntimeResourceReadReceipt(
              readRequest,
              authority,
              exact4.resourceSetCommitment,
              {
                activeState,
                checkedAt: CHECKED_AT,
                expiresAt: READ_EXPIRES_AT,
              }
            )
          );
        },
      });

    await expect(client.lookupRegistrationSet(lookupRequest)).resolves.toEqual(
      expect.objectContaining({
        resourceSetCommitment: exact4.resourceSetCommitment,
      })
    );
    await expect(
      client.readActiveResource(readRequest, authority)
    ).resolves.toEqual(
      expect.objectContaining({ readRequestDigest: readRequest.requestDigest })
    );
    expect(calls).toEqual([
      {
        url: `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${scope.namespaceId}/${AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.registrationResults}`,
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_PURPOSE,
        idempotencyKey: lookupRequest.requestDigest,
        body: lookupRequest,
      },
      {
        url: `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${scope.namespaceId}/${AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.reads}`,
        purpose: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.read,
        idempotencyKey: readRequest.requestDigest,
        body: readRequest,
      },
    ]);

    observedAt = LOOKUP_EXPIRES_AT;
    await expect(client.lookupRegistrationSet(lookupRequest)).resolves.toBe(
      undefined
    );
    const foreignLookupRequest =
      createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest({
        ...scope,
        namespaceId: 'namespace.foreign-hosted-runtime-client',
        registrationIntentBindings: lookupRequest.registrationIntentBindings,
        requestedAt: REQUESTED_AT,
      });
    const callCount = calls.length;
    await expect(
      client.lookupRegistrationSet(foreignLookupRequest)
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(callCount);
  });

  it('reads purpose-bound live preactivation health without a frozen run', async () => {
    const implementationDigest = digest('owner-health-implementation');
    const storageSummary =
      createAgentHostedRetrievalRuntimeResourceOwnerStorageSummary({
        namespaceId: scope.namespaceId,
        schemaContractDigest:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
        ledgerRevision: 7,
        registrationCount: 4,
        activeResourceCount: 4,
        activeReadLeaseCount: 1,
        unfinishedCleanupCount: 0,
        overdueCount: 0,
        summarizedAt: CHECKED_AT,
      });
    const receipt = createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(
      {
        namespaceId: scope.namespaceId,
        ownerAuthorityIssuerId: 'authority.hosted-runtime-resource-owner',
        implementationDigest,
        schemaContractDigest:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
        supportedOperations:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SUPPORTED_OPERATIONS,
        storageSummary,
        storageSummaryDigest: storageSummary.summaryDigest,
        checkedAt: CHECKED_AT,
        expiresAt: LOOKUP_EXPIRES_AT,
      }
    );
    const calls: {
      url: string;
      method: string | undefined;
      purpose: string | null;
      idempotencyKey: string | null;
      body: BodyInit | null | undefined;
    }[] = [];
    let returnedReceipt = receipt;
    const client =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient(
        {
          namespaceId: scope.namespaceId,
          ownerAuthorityIssuerId: 'authority.hosted-runtime-resource-owner',
          implementationDigest,
          schemaContractDigest:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
          environment,
          clock: () => new Date(OBSERVED_AT),
          fetch: async (url, init) => {
            const headers = new Headers(init?.headers);
            calls.push({
              url: String(url),
              method: init?.method,
              purpose: headers.get(
                AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSE_HEADER
              ),
              idempotencyKey: headers.get('Idempotency-Key'),
              body: init?.body,
            });
            return canonicalResponse(returnedReceipt);
          },
        }
      );

    await expect(client.readOwnerHealth()).resolves.toEqual(receipt);
    expect(calls).toEqual([
      {
        url: `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${scope.namespaceId}/${AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.ownerHealth}`,
        method: 'GET',
        purpose:
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readOwnerHealth,
        idempotencyKey: null,
        body: undefined,
      },
    ]);

    returnedReceipt =
      createAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt({
        ...(({
          format: _format,
          version: _version,
          purpose: _purpose,
          status: _status,
          receiptDigest: _receiptDigest,
          ...input
        }) => input)(receipt),
        ownerAuthorityIssuerId: 'authority.foreign-hosted-owner',
      });
    await expect(client.readOwnerHealth()).resolves.toBeUndefined();
  });
});
