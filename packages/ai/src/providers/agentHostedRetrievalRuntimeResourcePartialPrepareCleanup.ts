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
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  exact,
  isAgentHostedRetrievalRuntimeResourceRegistrationResult,
  repositoryCommitPattern,
  safe,
  type AgentHostedRetrievalRuntimeResourceRegistrationResult,
} from './agentHostedRetrievalRuntimeResourceRegistration';
import {
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  type AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
} from './agentHostedRetrievalRuntimeResourceLifecycleTransportJournal';
import { isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord } from './agentHostedRetrievalRuntimeResourceLifecycleArchive';

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_PURPOSE =
  'hosted-retrieval-runtime-resource.cleanup.partial-create.claim' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_ABORT_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-partial-prepare-abort-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-partial-prepare-cleanup-claim-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-partial-prepare-cleanup-claim-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_MAXIMUM_SOURCES =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_MAXIMUM_KNOWN_RESOURCES =
  88 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_ABORT_RECEIPT_MAXIMUM_BYTES =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 32;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLAIM_REQUEST_MAXIMUM_BYTES =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 33;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLAIM_RECEIPT_MAXIMUM_BYTES =
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_COMPONENT_MAXIMUM_BYTES * 4;

export type AgentHostedRetrievalRuntimeResourcePartialPrepareKnownResource =
  Readonly<{
    registrationRequestDigest: CanonicalDigest;
    sourceDigest: CanonicalDigest;
    resourceId: string;
    resourceRole: 'auxiliary' | 'primary';
  }>;

export type AgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_ABORT_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    namespaceId: string;
    repositoryCommit: string;
    planDigest: CanonicalDigest;
    frozenRunDigest: CanonicalDigest;
    runConfigArtifactBindingDigest: CanonicalDigest;
    runtimeResourceSetId: string;
    abortReason: 'prepare-failed' | 'registration-claim-expired';
    expectedRegistrationSetRevision: number;
    registrationResults: readonly AgentHostedRetrievalRuntimeResourceRegistrationResult[];
    registrationResultDigests: readonly CanonicalDigest[];
    partialCreateJournalArchiveRecords: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[];
    partialCreateJournalArchiveRecordDigests: readonly CanonicalDigest[];
    registrationRequestDigests: readonly CanonicalDigest[];
    knownResources: readonly AgentHostedRetrievalRuntimeResourcePartialPrepareKnownResource[];
    knownResourceSetDigest: CanonicalDigest;
    abortAuthorityIssuerId: string;
    abortAuthorityImplementationDigest: CanonicalDigest;
    abortedAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    namespaceId: string;
    purpose: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_PURPOSE;
    partialPrepareAbortReceipt: AgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt;
    partialPrepareAbortReceiptDigest: CanonicalDigest;
    cleanupOwnerInstanceId: string;
    claimedAt: Instant;
    minimumClaimExpiresAt: Instant;
    requestDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    requestDigest: CanonicalDigest;
    partialPrepareAbortReceiptDigest: CanonicalDigest;
    cleanupAuthorityIssuerId: string;
    cleanupAuthorityImplementationDigest: CanonicalDigest;
    claimLedgerRevision: number;
    cleanupOwnerInstanceId: string;
    knownResources: readonly AgentHostedRetrievalRuntimeResourcePartialPrepareKnownResource[];
    knownResourceSetDigest: CanonicalDigest;
    claimedAt: Instant;
    claimExpiresAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

const knownResourceKeys = Object.freeze([
  'registrationRequestDigest',
  'sourceDigest',
  'resourceId',
  'resourceRole',
] as const);
const abortReceiptKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'repositoryCommit',
  'planDigest',
  'frozenRunDigest',
  'runConfigArtifactBindingDigest',
  'runtimeResourceSetId',
  'abortReason',
  'expectedRegistrationSetRevision',
  'registrationResults',
  'registrationResultDigests',
  'partialCreateJournalArchiveRecords',
  'partialCreateJournalArchiveRecordDigests',
  'registrationRequestDigests',
  'knownResources',
  'knownResourceSetDigest',
  'abortAuthorityIssuerId',
  'abortAuthorityImplementationDigest',
  'abortedAt',
  'receiptDigest',
] as const);
const claimRequestKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'purpose',
  'partialPrepareAbortReceipt',
  'partialPrepareAbortReceiptDigest',
  'cleanupOwnerInstanceId',
  'claimedAt',
  'minimumClaimExpiresAt',
  'requestDigest',
] as const);
const claimReceiptKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'partialPrepareAbortReceiptDigest',
  'cleanupAuthorityIssuerId',
  'cleanupAuthorityImplementationDigest',
  'claimLedgerRevision',
  'cleanupOwnerInstanceId',
  'knownResources',
  'knownResourceSetDigest',
  'claimedAt',
  'claimExpiresAt',
  'receiptDigest',
] as const);

const knownResourceOrderKey = (
  value: AgentHostedRetrievalRuntimeResourcePartialPrepareKnownResource
): string =>
  `${value.registrationRequestDigest}\u0000${value.resourceRole}\u0000${value.resourceId}`;

const isKnownResource = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourcePartialPrepareKnownResource => {
  if (!exact(value, knownResourceKeys)) return false;
  const candidate =
    value as AgentHostedRetrievalRuntimeResourcePartialPrepareKnownResource;
  return (
    isAgentCanonicalDigest(candidate.registrationRequestDigest) &&
    isAgentCanonicalDigest(candidate.sourceDigest) &&
    isAgentControlIdentity(candidate.resourceId) &&
    ['auxiliary', 'primary'].includes(candidate.resourceRole)
  );
};

type SourceScope = Readonly<{
  namespaceId: string;
  repositoryCommit: string;
  planDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  runConfigArtifactBindingDigest: CanonicalDigest;
  runtimeResourceSetId: string;
  registrationRequestDigest: CanonicalDigest;
}>;

const registrationResultScope = (
  result: AgentHostedRetrievalRuntimeResourceRegistrationResult
): SourceScope => ({
  namespaceId: result.registrationRequest.namespaceId,
  repositoryCommit: result.registrationRequest.repositoryCommit,
  planDigest: result.registrationRequest.planDigest,
  frozenRunDigest: result.registrationRequest.frozenRunDigest,
  runConfigArtifactBindingDigest:
    result.registrationRequest.runConfigArtifactBindingDigest,
  runtimeResourceSetId: result.registrationRequest.runtimeResourceSetId,
  registrationRequestDigest: result.registrationRequestDigest,
});

const partialRecordScope = (
  record: AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord
): SourceScope => {
  const intent = record.journalRecord.dispatchIntentSet.intents[0]!;
  return {
    namespaceId: intent.namespaceId,
    repositoryCommit: intent.repositoryCommit,
    planDigest: intent.planDigest,
    frozenRunDigest: intent.frozenRunDigest,
    runConfigArtifactBindingDigest: intent.runConfigArtifactBindingDigest,
    runtimeResourceSetId: intent.runtimeResourceSetId,
    registrationRequestDigest: record.journalRecord.registrationRequestDigest,
  };
};

const sameScope = (left: SourceScope, right: SourceScope): boolean =>
  left.namespaceId === right.namespaceId &&
  left.repositoryCommit === right.repositoryCommit &&
  left.planDigest === right.planDigest &&
  left.frozenRunDigest === right.frozenRunDigest &&
  left.runConfigArtifactBindingDigest ===
    right.runConfigArtifactBindingDigest &&
  left.runtimeResourceSetId === right.runtimeResourceSetId;

const deriveKnownResources = (
  registrationResults: readonly AgentHostedRetrievalRuntimeResourceRegistrationResult[],
  partialRecords: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[]
): readonly AgentHostedRetrievalRuntimeResourcePartialPrepareKnownResource[] => {
  const values = [
    ...registrationResults.flatMap((result) => [
      {
        registrationRequestDigest: result.registrationRequestDigest,
        sourceDigest: result.resultDigest,
        resourceId: result.authority.providerResourceId,
        resourceRole: 'primary' as const,
      },
      ...result.authority.auxiliaryResourceIds.map((resourceId) => ({
        registrationRequestDigest: result.registrationRequestDigest,
        sourceDigest: result.resultDigest,
        resourceId,
        resourceRole: 'auxiliary' as const,
      })),
    ]),
    ...partialRecords.flatMap((record) => {
      const result = record.journalRecord.businessResult;
      return [
        ...(result.providerResourceId === null
          ? []
          : [
              {
                registrationRequestDigest:
                  record.journalRecord.registrationRequestDigest,
                sourceDigest: record.archiveRecordDigest,
                resourceId: result.providerResourceId,
                resourceRole: 'primary' as const,
              },
            ]),
        ...result.auxiliaryResourceIds.map((resourceId) => ({
          registrationRequestDigest:
            record.journalRecord.registrationRequestDigest,
          sourceDigest: record.archiveRecordDigest,
          resourceId,
          resourceRole: 'auxiliary' as const,
        })),
      ];
    }),
  ].sort((left, right) =>
    compareUnicodeCodePoints(
      knownResourceOrderKey(left),
      knownResourceOrderKey(right)
    )
  );
  return Object.freeze(values);
};

export const createAgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt =
  (
    input: Readonly<{
      abortReason: 'prepare-failed' | 'registration-claim-expired';
      expectedRegistrationSetRevision: number;
      registrationResults: readonly AgentHostedRetrievalRuntimeResourceRegistrationResult[];
      partialCreateJournalArchiveRecords: readonly AgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord[];
      abortAuthorityIssuerId: string;
      abortAuthorityImplementationDigest: CanonicalDigest;
      abortedAt: Instant;
    }>
  ): AgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt => {
    const registrationResults = Object.freeze([...input.registrationResults]);
    const partialRecords = Object.freeze([
      ...input.partialCreateJournalArchiveRecords,
    ]);
    const sourceCount = registrationResults.length + partialRecords.length;
    if (
      !exact(input, [
        'abortReason',
        'expectedRegistrationSetRevision',
        'registrationResults',
        'partialCreateJournalArchiveRecords',
        'abortAuthorityIssuerId',
        'abortAuthorityImplementationDigest',
        'abortedAt',
      ]) ||
      !['prepare-failed', 'registration-claim-expired'].includes(
        input.abortReason
      ) ||
      !Number.isSafeInteger(input.expectedRegistrationSetRevision) ||
      input.expectedRegistrationSetRevision < 0 ||
      registrationResults.length >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT - 1 ||
      sourceCount < 1 ||
      sourceCount >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_MAXIMUM_SOURCES ||
      registrationResults.some(
        (value) =>
          !isAgentHostedRetrievalRuntimeResourceRegistrationResult(value)
      ) ||
      partialRecords.some(
        (value) =>
          !isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord(
            value
          ) ||
          value.journalRecord.operation !== 'create' ||
          value.journalRecord.businessResult.outcome !==
            'partial-create-requires-cleanup'
      ) ||
      !isAgentControlIdentity(input.abortAuthorityIssuerId) ||
      !isAgentCanonicalDigest(input.abortAuthorityImplementationDigest) ||
      !isAgentControlInstant(input.abortedAt)
    ) {
      throw new TypeError('Hosted partial-prepare abort authority is invalid.');
    }
    const scopes = [
      ...registrationResults.map(registrationResultScope),
      ...partialRecords.map(partialRecordScope),
    ];
    const firstScope = scopes[0]!;
    const registrationRequestDigests = Object.freeze(
      scopes
        .map(({ registrationRequestDigest }) => registrationRequestDigest)
        .sort(compareUnicodeCodePoints)
    );
    const knownResources = deriveKnownResources(
      registrationResults,
      partialRecords
    );
    if (
      scopes.some((scope) => !sameScope(scope, firstScope)) ||
      !isAgentControlIdentity(firstScope.namespaceId) ||
      !repositoryCommitPattern.test(firstScope.repositoryCommit) ||
      ![
        firstScope.planDigest,
        firstScope.frozenRunDigest,
        firstScope.runConfigArtifactBindingDigest,
      ].every(isAgentCanonicalDigest) ||
      !isAgentControlIdentity(firstScope.runtimeResourceSetId) ||
      new Set(registrationRequestDigests).size !==
        registrationRequestDigests.length ||
      knownResources.length < 1 ||
      knownResources.length >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_MAXIMUM_KNOWN_RESOURCES ||
      new Set(knownResources.map(knownResourceOrderKey)).size !==
        knownResources.length ||
      (input.abortReason === 'registration-claim-expired' &&
        Date.parse(input.abortedAt) <
          Math.max(
            ...scopes.map((scope) => {
              const registration = registrationResults.find(
                (result) =>
                  result.registrationRequestDigest ===
                  scope.registrationRequestDigest
              );
              return registration
                ? Date.parse(registration.registrationRequest.minimumExpiresAt)
                : Number.NEGATIVE_INFINITY;
            })
          ))
    ) {
      throw new TypeError('Hosted partial-prepare abort set drifted.');
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_ABORT_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      namespaceId: firstScope.namespaceId,
      repositoryCommit: firstScope.repositoryCommit,
      planDigest: firstScope.planDigest,
      frozenRunDigest: firstScope.frozenRunDigest,
      runConfigArtifactBindingDigest: firstScope.runConfigArtifactBindingDigest,
      runtimeResourceSetId: firstScope.runtimeResourceSetId,
      abortReason: input.abortReason,
      expectedRegistrationSetRevision: input.expectedRegistrationSetRevision,
      registrationResults,
      registrationResultDigests: Object.freeze(
        registrationResults.map(({ resultDigest }) => resultDigest)
      ),
      partialCreateJournalArchiveRecords: partialRecords,
      partialCreateJournalArchiveRecordDigests: Object.freeze(
        partialRecords.map(({ archiveRecordDigest }) => archiveRecordDigest)
      ),
      registrationRequestDigests,
      knownResources,
      knownResourceSetDigest: digestAgentCanonicalValue(knownResources),
      abortAuthorityIssuerId: input.abortAuthorityIssuerId,
      abortAuthorityImplementationDigest:
        input.abortAuthorityImplementationDigest,
      abortedAt: input.abortedAt,
    });
    const receipt = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        receipt,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_ABORT_RECEIPT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted partial-prepare abort authority is unsafe.');
    }
    return receipt;
  };

export const isAgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt = (
  value: unknown
): value is AgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt => {
  if (!exact(value, abortReceiptKeys)) return false;
  try {
    const receipt =
      value as AgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt;
    return sameCanonicalJson(
      receipt,
      createAgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt({
        abortReason: receipt.abortReason,
        expectedRegistrationSetRevision:
          receipt.expectedRegistrationSetRevision,
        registrationResults: receipt.registrationResults,
        partialCreateJournalArchiveRecords:
          receipt.partialCreateJournalArchiveRecords,
        abortAuthorityIssuerId: receipt.abortAuthorityIssuerId,
        abortAuthorityImplementationDigest:
          receipt.abortAuthorityImplementationDigest,
        abortedAt: receipt.abortedAt,
      })
    );
  } catch {
    return false;
  }
};

export const createAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest,
      | 'format'
      | 'partialPrepareAbortReceiptDigest'
      | 'requestDigest'
      | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest => {
    if (
      !exact(input, [
        'namespaceId',
        'purpose',
        'partialPrepareAbortReceipt',
        'cleanupOwnerInstanceId',
        'claimedAt',
        'minimumClaimExpiresAt',
      ]) ||
      !isAgentHostedRetrievalRuntimeResourcePartialPrepareAbortReceipt(
        input.partialPrepareAbortReceipt
      ) ||
      input.namespaceId !== input.partialPrepareAbortReceipt.namespaceId ||
      input.purpose !==
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_PURPOSE ||
      !isAgentControlIdentity(input.cleanupOwnerInstanceId) ||
      !isAgentControlInstant(input.claimedAt) ||
      Date.parse(input.claimedAt) <
        Date.parse(input.partialPrepareAbortReceipt.abortedAt) ||
      !isAgentControlInstant(input.minimumClaimExpiresAt) ||
      Date.parse(input.minimumClaimExpiresAt) <= Date.parse(input.claimedAt) ||
      Date.parse(input.minimumClaimExpiresAt) - Date.parse(input.claimedAt) >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS
    ) {
      throw new TypeError('Hosted partial-prepare cleanup claim is invalid.');
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_REQUEST_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
      partialPrepareAbortReceiptDigest:
        input.partialPrepareAbortReceipt.receiptDigest,
    });
    const request = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        request,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLAIM_REQUEST_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError('Hosted partial-prepare cleanup claim is unsafe.');
    }
    return request;
  };

export const isAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest => {
    if (!exact(value, claimRequestKeys)) return false;
    try {
      const request =
        value as AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest;
      return sameCanonicalJson(
        request,
        createAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest(
          {
            namespaceId: request.namespaceId,
            purpose: request.purpose,
            partialPrepareAbortReceipt: request.partialPrepareAbortReceipt,
            cleanupOwnerInstanceId: request.cleanupOwnerInstanceId,
            claimedAt: request.claimedAt,
            minimumClaimExpiresAt: request.minimumClaimExpiresAt,
          }
        )
      );
    } catch {
      return false;
    }
  };

export const createAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt =
  (
    request: AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest,
    input: Readonly<{
      cleanupAuthorityIssuerId: string;
      cleanupAuthorityImplementationDigest: CanonicalDigest;
      claimLedgerRevision: number;
      claimExpiresAt: Instant;
    }>
  ): AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt => {
    if (
      !isAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest(
        request
      ) ||
      !exact(input, [
        'cleanupAuthorityIssuerId',
        'cleanupAuthorityImplementationDigest',
        'claimLedgerRevision',
        'claimExpiresAt',
      ]) ||
      !isAgentControlIdentity(input.cleanupAuthorityIssuerId) ||
      !isAgentCanonicalDigest(input.cleanupAuthorityImplementationDigest) ||
      !Number.isSafeInteger(input.claimLedgerRevision) ||
      input.claimLedgerRevision < 1 ||
      !isAgentControlInstant(input.claimExpiresAt) ||
      Date.parse(input.claimExpiresAt) <
        Date.parse(request.minimumClaimExpiresAt) ||
      Date.parse(input.claimExpiresAt) - Date.parse(request.claimedAt) >
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS
    ) {
      throw new TypeError(
        'Hosted partial-prepare cleanup claim receipt is invalid.'
      );
    }
    const abort = request.partialPrepareAbortReceipt;
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      requestDigest: request.requestDigest,
      partialPrepareAbortReceiptDigest: abort.receiptDigest,
      cleanupAuthorityIssuerId: input.cleanupAuthorityIssuerId,
      cleanupAuthorityImplementationDigest:
        input.cleanupAuthorityImplementationDigest,
      claimLedgerRevision: input.claimLedgerRevision,
      cleanupOwnerInstanceId: request.cleanupOwnerInstanceId,
      knownResources: abort.knownResources,
      knownResourceSetDigest: abort.knownResourceSetDigest,
      claimedAt: request.claimedAt,
      claimExpiresAt: input.claimExpiresAt,
    });
    const receipt = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !safe(
        receipt,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLAIM_RECEIPT_MAXIMUM_BYTES
      )
    ) {
      throw new TypeError(
        'Hosted partial-prepare cleanup claim receipt is unsafe.'
      );
    }
    return receipt;
  };

export const isAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt => {
    if (!exact(value, claimReceiptKeys)) return false;
    const receipt =
      value as AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt;
    const { receiptDigest, ...base } = receipt;
    return (
      receipt.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLEANUP_CLAIM_RECEIPT_FORMAT &&
      receipt.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      [
        receipt.requestDigest,
        receipt.partialPrepareAbortReceiptDigest,
        receipt.cleanupAuthorityImplementationDigest,
        receipt.knownResourceSetDigest,
        receipt.receiptDigest,
      ].every(isAgentCanonicalDigest) &&
      isAgentControlIdentity(receipt.cleanupAuthorityIssuerId) &&
      Number.isSafeInteger(receipt.claimLedgerRevision) &&
      receipt.claimLedgerRevision >= 1 &&
      isAgentControlIdentity(receipt.cleanupOwnerInstanceId) &&
      receipt.knownResources.length >= 1 &&
      receipt.knownResources.length <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_MAXIMUM_KNOWN_RESOURCES &&
      receipt.knownResources.every(isKnownResource) &&
      sameCanonicalJson(
        receipt.knownResources,
        [...receipt.knownResources].sort((left, right) =>
          compareUnicodeCodePoints(
            knownResourceOrderKey(left),
            knownResourceOrderKey(right)
          )
        )
      ) &&
      new Set(receipt.knownResources.map(knownResourceOrderKey)).size ===
        receipt.knownResources.length &&
      receipt.knownResourceSetDigest ===
        digestAgentCanonicalValue(receipt.knownResources) &&
      isAgentControlInstant(receipt.claimedAt) &&
      isAgentControlInstant(receipt.claimExpiresAt) &&
      Date.parse(receipt.claimExpiresAt) > Date.parse(receipt.claimedAt) &&
      Date.parse(receipt.claimExpiresAt) - Date.parse(receipt.claimedAt) <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_CLEANUP_CLAIM_MAXIMUM_LIFETIME_MS &&
      receiptDigest === digestAgentCanonicalValue(base) &&
      safe(
        receipt,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_PARTIAL_PREPARE_CLAIM_RECEIPT_MAXIMUM_BYTES
      )
    );
  };

export const matchAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaim =
  (
    request: AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest,
    receipt: AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt,
    observedAt: Instant
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest(
      request
    ) &&
    isAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt(
      receipt
    ) &&
    isAgentControlInstant(observedAt) &&
    receipt.requestDigest === request.requestDigest &&
    receipt.partialPrepareAbortReceiptDigest ===
      request.partialPrepareAbortReceipt.receiptDigest &&
    receipt.cleanupOwnerInstanceId === request.cleanupOwnerInstanceId &&
    sameCanonicalJson(
      receipt.knownResources,
      request.partialPrepareAbortReceipt.knownResources
    ) &&
    receipt.knownResourceSetDigest ===
      request.partialPrepareAbortReceipt.knownResourceSetDigest &&
    receipt.claimedAt === request.claimedAt &&
    Date.parse(observedAt) >= Date.parse(receipt.claimedAt) &&
    Date.parse(observedAt) < Date.parse(receipt.claimExpiresAt);

export const matchAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupDeleteIntent =
  (
    intent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
    request: AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimRequest,
    receipt: AgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaimReceipt,
    observedAt: Instant
  ): boolean =>
    isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(intent) &&
    matchAgentHostedRetrievalRuntimeResourcePartialPrepareCleanupClaim(
      request,
      receipt,
      observedAt
    ) &&
    intent.operation === 'delete' &&
    intent.authorityDigest === null &&
    intent.lifecycleClaimReceiptDigest === receipt.receiptDigest &&
    intent.namespaceId === request.partialPrepareAbortReceipt.namespaceId &&
    intent.repositoryCommit ===
      request.partialPrepareAbortReceipt.repositoryCommit &&
    intent.planDigest === request.partialPrepareAbortReceipt.planDigest &&
    intent.frozenRunDigest ===
      request.partialPrepareAbortReceipt.frozenRunDigest &&
    intent.runConfigArtifactBindingDigest ===
      request.partialPrepareAbortReceipt.runConfigArtifactBindingDigest &&
    intent.runtimeResourceSetId ===
      request.partialPrepareAbortReceipt.runtimeResourceSetId &&
    receipt.knownResources.some(
      (known) =>
        known.registrationRequestDigest === intent.registrationRequestDigest &&
        known.resourceId === intent.resourceId &&
        known.resourceRole === intent.resourceRole
    );
