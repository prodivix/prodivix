import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  createAgentHostedRetrievalRuntimeResourceAuthoritySet,
  createAgentHostedRetrievalRuntimeResourceSetCommitment,
  exact,
  expectedRuntimeAuthorityKeys,
  isAgentHostedRetrievalRuntimeResourceAuthoritySet,
  isAgentHostedRetrievalRuntimeResourceRegistrationResult,
  isAgentHostedRetrievalRuntimeResourceSetCommitment,
  matchAgentHostedRetrievalRuntimeResourceSetCommitment,
  repositoryCommitPattern,
  safe,
  type AgentHostedRetrievalRuntimeResourceAuthoritySet,
  type AgentHostedRetrievalRuntimeResourceProfileId,
  type AgentHostedRetrievalRuntimeResourceProtocolFamily,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
  type AgentHostedRetrievalRuntimeResourceSetCommitment,
} from './agentHostedRetrievalRuntimeResourceRegistration';
import { AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES } from './agentHostedRetrievalRuntimeResourceRecovery';

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-set-lookup-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-set-lookup-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_PURPOSE =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PURPOSES.readRegistrationSet;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_MAXIMUM_LIFETIME_MS =
  125_000 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_MAXIMUM_BYTES =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_RESULT_MAXIMUM_BYTES *
    AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT +
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 2 +
  16_384;

export type AgentHostedRetrievalRuntimeResourceRegistrationIntentBinding =
  Readonly<{
    protocolFamily: AgentHostedRetrievalRuntimeResourceProtocolFamily;
    capabilityProfileId: AgentHostedRetrievalRuntimeResourceProfileId;
    registrationIntentDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    registrationIntentBindings: readonly AgentHostedRetrievalRuntimeResourceRegistrationIntentBinding[];
    requestedAt: Instant;
    requestDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    requestDigest: CanonicalDigest;
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    lookupAuthorityIssuerId: string;
    lookupAuthorityImplementationDigest: CanonicalDigest;
    lookupLedgerRevision: number;
    registrationResults: readonly AgentHostedRetrievalRuntimeResourceRegistrationResult[];
    authoritySet: AgentHostedRetrievalRuntimeResourceAuthoritySet;
    resourceSetCommitment: AgentHostedRetrievalRuntimeResourceSetCommitment;
    checkedAt: Instant;
    expiresAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

const lookupRequestKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'registrationIntentBindings',
  'requestedAt',
  'requestDigest',
] as const);

const lookupReceiptKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'lookupAuthorityIssuerId',
  'lookupAuthorityImplementationDigest',
  'lookupLedgerRevision',
  'registrationResults',
  'authoritySet',
  'resourceSetCommitment',
  'checkedAt',
  'expiresAt',
  'receiptDigest',
] as const);

const intentBindingKeys = Object.freeze([
  'protocolFamily',
  'capabilityProfileId',
  'registrationIntentDigest',
] as const);

const intentBindingKey = (
  binding: Pick<
    AgentHostedRetrievalRuntimeResourceRegistrationIntentBinding,
    'capabilityProfileId' | 'protocolFamily'
  >
): string => `${binding.protocolFamily}\u0000${binding.capabilityProfileId}`;

const isRegistrationIntentBinding = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourceRegistrationIntentBinding => {
  if (!exact(value, intentBindingKeys)) return false;
  const binding = value as Record<string, unknown>;
  return (
    (binding.protocolFamily === 'gemini-interactions' ||
      binding.protocolFamily === 'openai-responses') &&
    (binding.capabilityProfileId === 'g4-provider-hosted-retrieval-core' ||
      binding.capabilityProfileId ===
        'g4-provider-hosted-retrieval-document') &&
    isAgentCanonicalDigest(binding.registrationIntentDigest)
  );
};

const canonicalIntentBindings = (
  bindings: readonly AgentHostedRetrievalRuntimeResourceRegistrationIntentBinding[]
): readonly AgentHostedRetrievalRuntimeResourceRegistrationIntentBinding[] => {
  if (
    !Array.isArray(bindings) ||
    bindings.length !== AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
    bindings.some((binding) => !isRegistrationIntentBinding(binding))
  ) {
    throw new TypeError(
      'Hosted retrieval registration set intent bindings are invalid.'
    );
  }
  const canonical = Object.freeze(
    bindings
      .map((binding) => Object.freeze({ ...binding }))
      .sort((left, right) =>
        compareUnicodeCodePoints(
          intentBindingKey(left),
          intentBindingKey(right)
        )
      )
  );
  if (
    !sameCanonicalJson(
      canonical.map(intentBindingKey),
      expectedRuntimeAuthorityKeys
    )
  ) {
    throw new TypeError(
      'Hosted retrieval registration set intent bindings are incomplete.'
    );
  }
  return canonical;
};

export const createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
      'format' | 'requestDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest => {
    if (
      !exact(input, lookupRequestKeys.slice(2, -1)) ||
      !isAgentControlIdentity(input.namespaceId) ||
      !repositoryCommitPattern.test(input.repositoryCommit) ||
      ![
        input.planDigest,
        input.frozenRunDigest,
        input.runConfigArtifactBindingDigest,
      ].every(isAgentCanonicalDigest) ||
      !isAgentControlInstant(input.requestedAt)
    ) {
      throw new TypeError(
        'Hosted retrieval registration set lookup request is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_REQUEST_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      namespaceId: input.namespaceId,
      repositoryCommit: input.repositoryCommit,
      planDigest: input.planDigest,
      frozenRunDigest: input.frozenRunDigest,
      runConfigArtifactBindingDigest: input.runConfigArtifactBindingDigest,
      registrationIntentBindings: canonicalIntentBindings(
        input.registrationIntentBindings
      ),
      requestedAt: input.requestedAt,
    });
    const request = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        request,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError(
        'Hosted retrieval registration set lookup request is oversized.'
      );
    }
    return request;
  };

export const isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest => {
    if (!exact(value, lookupRequestKeys)) return false;
    try {
      const {
        format: _format,
        version: _version,
        requestDigest: _requestDigest,
        ...input
      } = value as AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest;
      return sameCanonicalJson(
        value,
        createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest(
          input
        )
      );
    } catch {
      return false;
    }
  };

const registrationResultKey = (
  result: AgentHostedRetrievalRuntimeResourceRegistrationResult
): string => intentBindingKey(result.registrationRequest.registrationIntent);

const canonicalRegistrationResults = (
  request: AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
  resultsInput: readonly AgentHostedRetrievalRuntimeResourceRegistrationResult[]
): readonly AgentHostedRetrievalRuntimeResourceRegistrationResult[] => {
  if (
    !Array.isArray(resultsInput) ||
    resultsInput.length !==
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
    resultsInput.some(
      (result) =>
        !isAgentHostedRetrievalRuntimeResourceRegistrationResult(result)
    )
  ) {
    throw new TypeError(
      'Hosted retrieval registration set lookup results are invalid.'
    );
  }
  const results = Object.freeze(
    [...resultsInput].sort((left, right) =>
      compareUnicodeCodePoints(
        registrationResultKey(left),
        registrationResultKey(right)
      )
    )
  );
  const bindings = results.map(({ registrationRequest }) =>
    Object.freeze({
      protocolFamily: registrationRequest.protocolFamily,
      capabilityProfileId: registrationRequest.capabilityProfileId,
      registrationIntentDigest: registrationRequest.registrationIntentDigest,
    })
  );
  if (
    !sameCanonicalJson(bindings, request.registrationIntentBindings) ||
    results.some(({ registrationRequest }) =>
      [
        registrationRequest.namespaceId !== request.namespaceId,
        registrationRequest.repositoryCommit !== request.repositoryCommit,
        registrationRequest.planDigest !== request.planDigest,
        registrationRequest.frozenRunDigest !== request.frozenRunDigest,
        registrationRequest.runConfigArtifactBindingDigest !==
          request.runConfigArtifactBindingDigest,
      ].some(Boolean)
    )
  ) {
    throw new TypeError(
      'Hosted retrieval registration set lookup results drifted from request.'
    );
  }
  return results;
};

export const createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt =
  (
    request: AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
    registrationResultsInput: readonly AgentHostedRetrievalRuntimeResourceRegistrationResult[],
    seal: Readonly<{
      lookupAuthorityIssuerId: string;
      lookupAuthorityImplementationDigest: CanonicalDigest;
      lookupLedgerRevision: number;
      checkedAt: Instant;
      expiresAt: Instant;
    }>
  ): AgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt => {
    if (
      !isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest(
        request
      ) ||
      !exact(seal, [
        'lookupAuthorityIssuerId',
        'lookupAuthorityImplementationDigest',
        'lookupLedgerRevision',
        'checkedAt',
        'expiresAt',
      ]) ||
      !isAgentControlIdentity(seal.lookupAuthorityIssuerId) ||
      !isAgentCanonicalDigest(seal.lookupAuthorityImplementationDigest) ||
      !Number.isSafeInteger(seal.lookupLedgerRevision) ||
      seal.lookupLedgerRevision < 1 ||
      !isAgentControlInstant(seal.checkedAt) ||
      !isAgentControlInstant(seal.expiresAt) ||
      Date.parse(seal.checkedAt) < Date.parse(request.requestedAt) ||
      Date.parse(seal.expiresAt) <= Date.parse(seal.checkedAt) ||
      Date.parse(seal.expiresAt) - Date.parse(seal.checkedAt) >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_MAXIMUM_LIFETIME_MS
    ) {
      throw new TypeError(
        'Hosted retrieval registration set lookup receipt seal is invalid.'
      );
    }
    const registrationResults = canonicalRegistrationResults(
      request,
      registrationResultsInput
    );
    if (
      registrationResults.some(
        ({ authority }) =>
          Date.parse(authority.expiresAt) <= Date.parse(seal.expiresAt)
      )
    ) {
      throw new TypeError(
        'Hosted retrieval registration set lookup receipt outlives a resource.'
      );
    }
    const first = registrationResults[0]!.authority;
    const authoritySet = createAgentHostedRetrievalRuntimeResourceAuthoritySet({
      planDigest: request.planDigest,
      frozenRunDigest: request.frozenRunDigest,
      runConfigArtifactBindingDigest: request.runConfigArtifactBindingDigest,
      runtimeResourceSetId: first.runtimeResourceSetId,
      authorities: registrationResults.map(({ authority }) => authority),
    });
    const resourceSetCommitment =
      createAgentHostedRetrievalRuntimeResourceSetCommitment(authoritySet);
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      requestDigest: request.requestDigest,
      namespaceId: request.namespaceId,
      repositoryCommit: request.repositoryCommit,
      planDigest: request.planDigest,
      frozenRunDigest: request.frozenRunDigest,
      runConfigArtifactBindingDigest: request.runConfigArtifactBindingDigest,
      runtimeResourceSetId: authoritySet.runtimeResourceSetId,
      lookupAuthorityIssuerId: seal.lookupAuthorityIssuerId,
      lookupAuthorityImplementationDigest:
        seal.lookupAuthorityImplementationDigest,
      lookupLedgerRevision: seal.lookupLedgerRevision,
      registrationResults,
      authoritySet,
      resourceSetCommitment,
      checkedAt: seal.checkedAt,
      expiresAt: seal.expiresAt,
    });
    const receipt = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        receipt,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError(
        'Hosted retrieval registration set lookup receipt is oversized.'
      );
    }
    return receipt;
  };

export const isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt => {
    if (!exact(value, lookupReceiptKeys)) return false;
    const receipt =
      value as AgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt;
    if (
      receipt.format !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_FORMAT ||
      receipt.version !== AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION ||
      ![
        receipt.requestDigest,
        receipt.planDigest,
        receipt.frozenRunDigest,
        receipt.runConfigArtifactBindingDigest,
        receipt.lookupAuthorityImplementationDigest,
        receipt.receiptDigest,
      ].every(isAgentCanonicalDigest) ||
      !isAgentControlIdentity(receipt.namespaceId) ||
      !repositoryCommitPattern.test(receipt.repositoryCommit) ||
      !isAgentControlIdentity(receipt.runtimeResourceSetId) ||
      !isAgentControlIdentity(receipt.lookupAuthorityIssuerId) ||
      !Number.isSafeInteger(receipt.lookupLedgerRevision) ||
      receipt.lookupLedgerRevision < 1 ||
      !isAgentControlInstant(receipt.checkedAt) ||
      !isAgentControlInstant(receipt.expiresAt) ||
      Date.parse(receipt.expiresAt) <= Date.parse(receipt.checkedAt) ||
      Date.parse(receipt.expiresAt) - Date.parse(receipt.checkedAt) >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_MAXIMUM_LIFETIME_MS ||
      !Array.isArray(receipt.registrationResults) ||
      receipt.registrationResults.length !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
      receipt.registrationResults.some(
        (result) =>
          !isAgentHostedRetrievalRuntimeResourceRegistrationResult(result)
      ) ||
      !isAgentHostedRetrievalRuntimeResourceAuthoritySet(
        receipt.authoritySet
      ) ||
      !isAgentHostedRetrievalRuntimeResourceSetCommitment(
        receipt.resourceSetCommitment
      ) ||
      !matchAgentHostedRetrievalRuntimeResourceSetCommitment(
        receipt.resourceSetCommitment,
        receipt.authoritySet
      )
    ) {
      return false;
    }
    try {
      const syntheticRequest =
        createAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest({
          namespaceId: receipt.namespaceId,
          repositoryCommit: receipt.repositoryCommit,
          planDigest: receipt.planDigest,
          frozenRunDigest: receipt.frozenRunDigest,
          runConfigArtifactBindingDigest:
            receipt.runConfigArtifactBindingDigest,
          registrationIntentBindings: receipt.registrationResults.map(
            ({ registrationRequest }) =>
              Object.freeze({
                protocolFamily: registrationRequest.protocolFamily,
                capabilityProfileId: registrationRequest.capabilityProfileId,
                registrationIntentDigest:
                  registrationRequest.registrationIntentDigest,
              })
          ),
          requestedAt: receipt.checkedAt,
        });
      const registrationResults = canonicalRegistrationResults(
        syntheticRequest,
        receipt.registrationResults
      );
      const expectedAuthoritySet =
        createAgentHostedRetrievalRuntimeResourceAuthoritySet({
          planDigest: receipt.planDigest,
          frozenRunDigest: receipt.frozenRunDigest,
          runConfigArtifactBindingDigest:
            receipt.runConfigArtifactBindingDigest,
          runtimeResourceSetId: receipt.runtimeResourceSetId,
          authorities: registrationResults.map(({ authority }) => authority),
        });
      const { receiptDigest, ...base } = receipt;
      return (
        sameCanonicalJson(receipt.registrationResults, registrationResults) &&
        sameCanonicalJson(receipt.authoritySet, expectedAuthoritySet) &&
        receipt.registrationResults.every(
          ({ authority }) =>
            Date.parse(authority.expiresAt) > Date.parse(receipt.expiresAt)
        ) &&
        sameCanonicalJson(
          receipt.resourceSetCommitment,
          createAgentHostedRetrievalRuntimeResourceSetCommitment(
            expectedAuthoritySet
          )
        ) &&
        receiptDigest === digestAgentCanonicalValue(base) &&
        safe(
          receipt,
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_REGISTRATION_SET_LOOKUP_RECEIPT_MAXIMUM_BYTES
        )
      );
    } catch {
      return false;
    }
  };

export const matchAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt =
  (
    receipt: AgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt,
    request: AgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest,
    observedAt: Instant
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupReceipt(
      receipt
    ) &&
    isAgentHostedRetrievalRuntimeResourceRegistrationSetLookupRequest(
      request
    ) &&
    isAgentControlInstant(observedAt) &&
    receipt.requestDigest === request.requestDigest &&
    receipt.namespaceId === request.namespaceId &&
    receipt.repositoryCommit === request.repositoryCommit &&
    receipt.planDigest === request.planDigest &&
    receipt.frozenRunDigest === request.frozenRunDigest &&
    receipt.runConfigArtifactBindingDigest ===
      request.runConfigArtifactBindingDigest &&
    sameCanonicalJson(
      request.registrationIntentBindings,
      receipt.registrationResults.map(({ registrationRequest }) =>
        Object.freeze({
          protocolFamily: registrationRequest.protocolFamily,
          capabilityProfileId: registrationRequest.capabilityProfileId,
          registrationIntentDigest:
            registrationRequest.registrationIntentDigest,
        })
      )
    ) &&
    Date.parse(receipt.checkedAt) >= Date.parse(request.requestedAt) &&
    Date.parse(receipt.checkedAt) <= Date.parse(observedAt) &&
    Date.parse(receipt.expiresAt) > Date.parse(observedAt);
