import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_RECEIPT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_PURPOSE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentHostedRetrievalRuntimeResourceAuthority,
  isAgentHostedRetrievalRuntimeResourceReadRequest,
  isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
  matchAgentHostedRetrievalRuntimeResourceReadReceipt,
  matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  matchAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt,
  type AgentHostedRetrievalRuntimeResourceAuthority,
  type AgentHostedRetrievalRuntimeResourceOwnerHealthBinding,
  type AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
  type AgentHostedRetrievalRuntimeResourceReadReceipt,
  type AgentHostedRetrievalRuntimeResourceReadRequest,
  type AgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt,
  type AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import { createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransport } from './hostedRetrievalRuntimeResourceHttpTransport';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';

export type AgentEvaluationHostedRetrievalRuntimeResourceScope = Readonly<{
  namespaceId: string;
  repositoryCommit: string;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
}>;

export type AgentEvaluationHostedRetrievalRuntimeResourceClient = Readonly<{
  lookupRegistrationSet(
    request: AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest
  ): Promise<
    AgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt | undefined
  >;
  readActiveResource(
    request: AgentHostedRetrievalRuntimeResourceReadRequest,
    authority: AgentHostedRetrievalRuntimeResourceAuthority
  ): Promise<AgentHostedRetrievalRuntimeResourceReadReceipt | undefined>;
}>;

export type AgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient =
  Readonly<{
    readOwnerHealth(): Promise<
      AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt | undefined
    >;
  }>;

export type CreateEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceClientInput =
  AgentEvaluationHostedRetrievalRuntimeResourceScope &
    Readonly<{
      environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
      fetch?: typeof fetch;
      clock?: () => Date;
      forbiddenCanaries?: () => readonly string[];
      timeoutMs?: number;
    }>;

export type CreateEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClientInput =
  AgentHostedRetrievalRuntimeResourceOwnerHealthBinding &
    Readonly<{
      environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
      fetch?: typeof fetch;
      clock?: () => Date;
      forbiddenCanaries?: () => readonly string[];
      timeoutMs?: number;
    }>;

const commitPattern = /^[0-9a-f]{40}$/u;

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const scopeMatchesLookup = (
  request: AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
  scope: AgentEvaluationHostedRetrievalRuntimeResourceScope
): boolean =>
  request.namespaceId === scope.namespaceId &&
  request.repositoryCommit === scope.repositoryCommit &&
  request.planDigest === scope.planDigest &&
  request.frozenRunDigest === scope.frozenRunDigest &&
  request.runConfigArtifactBindingDigest ===
    scope.runConfigArtifactBindingDigest;

const scopeMatchesRead = (
  request: AgentHostedRetrievalRuntimeResourceReadRequest,
  authority: AgentHostedRetrievalRuntimeResourceAuthority,
  scope: AgentEvaluationHostedRetrievalRuntimeResourceScope
): boolean =>
  request.namespaceId === scope.namespaceId &&
  request.repositoryCommit === scope.repositoryCommit &&
  request.planDigest === scope.planDigest &&
  request.runConfigArtifactBindingDigest ===
    scope.runConfigArtifactBindingDigest &&
  authority.planDigest === scope.planDigest &&
  authority.frozenRunDigest === scope.frozenRunDigest &&
  authority.runConfigArtifactBindingDigest ===
    scope.runConfigArtifactBindingDigest &&
  request.authorityDigest === authority.authorityDigest &&
  request.runtimeResourceSetId === authority.runtimeResourceSetId;

/**
 * Provides the purpose-bound 8791 read-only view of the durable hosted
 * resource owner. Set discovery returns historical registration evidence;
 * every usable resource still requires a fresh active read receipt.
 */
export const createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceClient =
  (
    input: CreateEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceClientInput
  ): AgentEvaluationHostedRetrievalRuntimeResourceClient => {
    const scope = Object.freeze({
      namespaceId: input.namespaceId,
      repositoryCommit: input.repositoryCommit,
      planDigest: input.planDigest,
      frozenRunDigest: input.frozenRunDigest,
      runConfigArtifactBindingDigest: input.runConfigArtifactBindingDigest,
    });
    if (
      !isAgentControlIdentity(scope.namespaceId) ||
      !commitPattern.test(scope.repositoryCommit) ||
      ![
        scope.planDigest,
        scope.frozenRunDigest,
        scope.runConfigArtifactBindingDigest,
      ].every(isAgentCanonicalDigest)
    ) {
      return invalid();
    }
    const clock = input.clock ?? (() => new Date());
    const transport =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransport(
        {
          namespaceId: scope.namespaceId,
          repositoryCommit: scope.repositoryCommit,
          ...(input.environment === undefined
            ? {}
            : { environment: input.environment }),
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          ...(input.forbiddenCanaries === undefined
            ? {}
            : { forbiddenCanaries: input.forbiddenCanaries }),
          ...(input.timeoutMs === undefined
            ? {}
            : { timeoutMs: input.timeoutMs }),
        }
      );

    return Object.freeze({
      async lookupRegistrationSet(request) {
        if (
          !isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest(
            request
          ) ||
          !scopeMatchesLookup(request, scope)
        ) {
          return undefined;
        }
        const value = await transport.post({
          route:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.registrationResults,
          purpose:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_PURPOSE,
          request,
          idempotencyKey: request.requestDigest,
          maximumRequestBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
          maximumResponseBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_MAXIMUM_BYTES,
          acceptedStatuses: Object.freeze([200]),
        });
        const now = clock();
        if (!Number.isFinite(now.getTime())) return undefined;
        const observedAt = now.toISOString() as Instant;
        return matchAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
          value as AgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt,
          request,
          observedAt
        )
          ? (value as AgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt)
          : undefined;
      },
      async readActiveResource(request, authority) {
        if (
          !isAgentHostedRetrievalRuntimeResourceReadRequest(request) ||
          !isAgentHostedRetrievalRuntimeResourceAuthority(authority) ||
          !scopeMatchesRead(request, authority, scope)
        ) {
          return undefined;
        }
        const value = await transport.post({
          route: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.reads,
          purpose: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.read,
          request,
          idempotencyKey: request.requestDigest,
          maximumRequestBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
          maximumResponseBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
          acceptedStatuses: Object.freeze([200]),
        });
        const now = clock();
        if (!Number.isFinite(now.getTime())) return undefined;
        const observedAt = now.toISOString() as Instant;
        return matchAgentHostedRetrievalRuntimeResourceReadReceipt(
          value as AgentHostedRetrievalRuntimeResourceReadReceipt,
          request,
          authority,
          observedAt
        )
          ? (value as AgentHostedRetrievalRuntimeResourceReadReceipt)
          : undefined;
      },
    });
  };

/** Reads the live Backend repository/schema receipt before any run is frozen. */
export const createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient =
  (
    input: CreateEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClientInput
  ): AgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient => {
    const binding = Object.freeze({
      namespaceId: input.namespaceId,
      ownerAuthorityIssuerId: input.ownerAuthorityIssuerId,
      implementationDigest: input.implementationDigest,
      schemaContractDigest: input.schemaContractDigest,
    });
    if (
      !isAgentControlIdentity(binding.namespaceId) ||
      !isAgentControlIdentity(binding.ownerAuthorityIssuerId) ||
      ![binding.implementationDigest, binding.schemaContractDigest].every(
        isAgentCanonicalDigest
      ) ||
      binding.schemaContractDigest !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_SCHEMA_CONTRACT_DIGEST
    ) {
      return invalid();
    }
    const clock = input.clock ?? (() => new Date());
    const transport =
      createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceHttpTransport(
        {
          namespaceId: binding.namespaceId,
          ...(input.environment === undefined
            ? {}
            : { environment: input.environment }),
          ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
          ...(input.forbiddenCanaries === undefined
            ? {}
            : { forbiddenCanaries: input.forbiddenCanaries }),
          ...(input.timeoutMs === undefined
            ? {}
            : { timeoutMs: input.timeoutMs }),
        }
      );

    return Object.freeze({
      async readOwnerHealth() {
        const value = await transport.get({
          route: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_ROUTES.ownerHealth,
          purpose:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readOwnerHealth,
          maximumResponseBytes:
            AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_OWNER_HEALTH_RECEIPT_MAXIMUM_BYTES,
        });
        const now = clock();
        if (!Number.isFinite(now.getTime())) return undefined;
        const observedAt = now.toISOString() as Instant;
        return matchAgentHostedRetrievalRuntimeResourceOwnerHealthReceipt(
          value as AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt,
          binding,
          observedAt
        )
          ? (value as AgentHostedRetrievalRuntimeResourceOwnerHealthReceipt)
          : undefined;
      },
    });
  };
