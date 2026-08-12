import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  isAgentCapabilityProbeProgram,
  type AgentCapabilityProbeProgram,
} from './agentCapabilityProbeProgram';

export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_FORMAT =
  'prodivix.agent-capability-probe-provider-resource-authority' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION =
  1 as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_DELETION_REQUEST_PROJECTION_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-deletion-request-projection' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_DELETION_AUTHORITY_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-deletion-authority-receipt' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESOURCE_RESULT_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-resource-result' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-receipt' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_STAGE_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-stage' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_DISPATCH_ACK_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-dispatch-ack' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_AUTHORITY_REQUEST_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-authority-request' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_AUTHORITY_STAGE_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-authority-stage' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_OWNER_ADMISSION_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-owner-admission' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_AUTHORITY_DISPATCH_ACK_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-authority-dispatch-ack' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-result-ingress' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-result-ingress-receipt' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-response' as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_MAXIMUM_AUXILIARY_IDS =
  32 as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_COMPONENT_MAXIMUM_BYTES =
  16_384 as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES =
  65_536 as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESPONSE_MAXIMUM_BYTES =
  131_072 as const;
export const AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_MAXIMUM_LIFETIME_MS =
  8 * 24 * 60 * 60 * 1_000;

export type AgentCapabilityProbeProviderResourceKind =
  | 'anthropic-file-container-id'
  | 'gemini-file-search-store-name'
  | 'openai-vector-store-id';

export type AgentCapabilityProbeProviderResourceProtocolFamily =
  'anthropic-messages' | 'gemini-interactions' | 'openai-responses';

export type AgentCapabilityProbeProviderResourceDeletionRequestProjection =
  Readonly<{
    format: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_DELETION_REQUEST_PROJECTION_FORMAT;
    version: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION;
    requestDigest: CanonicalDigest;
    protocolFamily: AgentCapabilityProbeProviderResourceProtocolFamily;
    providerResourceKind: AgentCapabilityProbeProviderResourceKind;
    providerResourceId: string;
    auxiliaryResourceIds: readonly string[];
  }>;

export type AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt =
  Readonly<{
    format: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_DELETION_AUTHORITY_RECEIPT_FORMAT;
    version: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION;
    requestDigest: CanonicalDigest;
    resourceManifestDigest: CanonicalDigest;
    providerResourceKind: AgentCapabilityProbeProviderResourceKind;
    providerResourceId: string;
    deletionRouteBinding: 'provider-resource.delete';
    deletionRequestProjection: AgentCapabilityProbeProviderResourceDeletionRequestProjection;
    deletionRequestProjectionDigest: CanonicalDigest;
    registeredAt: Instant;
    expiresAt: Instant;
    deletionAuthorityReceiptDigest: CanonicalDigest;
  }>;

export type AgentCapabilityProbeProviderResourceCleanupResourceResult =
  Readonly<{
    format: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESOURCE_RESULT_FORMAT;
    version: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION;
    resourceId: string;
    resourceRole: 'auxiliary' | 'primary';
    outcome: 'already-absent' | 'deleted';
    dispatchIntentDigest: CanonicalDigest;
    transportReceiptDigest: CanonicalDigest;
    completedAt: Instant;
    resultDigest: CanonicalDigest;
  }>;

export type AgentCapabilityProbeProviderResourceCleanupAuthorityRequest =
  Readonly<{
    format: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_AUTHORITY_REQUEST_FORMAT;
    version: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION;
    repositoryCommit: string;
    resourceRegistrationRequestDigest: CanonicalDigest;
    deletionAuthorityReceiptDigest: CanonicalDigest;
    cleanupRequestDigest: CanonicalDigest;
  }>;

export type AgentCapabilityProbeProviderResourceCleanupReceipt = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RECEIPT_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION;
  requestDigest: CanonicalDigest;
  deletionAuthorityReceiptDigest: CanonicalDigest;
  deletionRequestProjectionDigest: CanonicalDigest;
  protocolFamily: AgentCapabilityProbeProviderResourceProtocolFamily;
  providerResourceKind: AgentCapabilityProbeProviderResourceKind;
  providerResourceId: string;
  auxiliaryResourceIds: readonly string[];
  cleanupStageDigest: CanonicalDigest;
  cleanupDispatchAckDigest: CanonicalDigest;
  resourceResults: readonly AgentCapabilityProbeProviderResourceCleanupResourceResult[];
  resourceResultSetDigest: CanonicalDigest;
  completedAt: Instant;
  cleanupReceiptDigest: CanonicalDigest;
}>;

/** Durable 8790 cleanup response whose digest chain can be rebuilt offline. */
export type AgentCapabilityProbeProviderResourceCleanupResponse = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESPONSE_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION;
  repositoryCommit: string;
  resourceRegistrationRequestDigest: CanonicalDigest;
  cleanupRequestDigest: CanonicalDigest;
  deletionAuthorityReceiptDigest: CanonicalDigest;
  ownerImplementationDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  ownerAdmissionDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  resultIngressDigest: CanonicalDigest;
  resultIngressReceiptDigest: CanonicalDigest;
  cleanupReceipt: AgentCapabilityProbeProviderResourceCleanupReceipt;
  responseDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbeProviderResourceAuthority = Readonly<{
  format: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_FORMAT;
  version: typeof AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION;
  capabilityProfileId:
    | 'g4-provider-hosted-retrieval-core'
    | 'g4-provider-hosted-retrieval-document';
  probeProgramDigest: CanonicalDigest;
  publicResourceDescriptorDigest: CanonicalDigest;
  protocolFamily: AgentCapabilityProbeProviderResourceProtocolFamily;
  providerConfigurationId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  providerResourceKind: AgentCapabilityProbeProviderResourceKind;
  providerResourceId: string;
  resourceManifestDigest: CanonicalDigest;
  contentUploadReceiptDigest: CanonicalDigest;
  deletionAuthorityReceiptDigest: CanonicalDigest;
  registeredAt: Instant;
  expiresAt: Instant;
  authorityDigest: CanonicalDigest;
}>;

export type CreateAgentCapabilityProbeProviderResourceAuthorityInput = Omit<
  AgentCapabilityProbeProviderResourceAuthority,
  | 'format'
  | 'version'
  | 'capabilityProfileId'
  | 'probeProgramDigest'
  | 'publicResourceDescriptorDigest'
  | 'providerResourceKind'
  | 'authorityDigest'
>;

const exactKeys = Object.freeze([
  'format',
  'version',
  'capabilityProfileId',
  'probeProgramDigest',
  'publicResourceDescriptorDigest',
  'protocolFamily',
  'providerConfigurationId',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'providerResourceKind',
  'providerResourceId',
  'resourceManifestDigest',
  'contentUploadReceiptDigest',
  'deletionAuthorityReceiptDigest',
  'registeredAt',
  'expiresAt',
  'authorityDigest',
] as const);

const deletionRequestProjectionKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'protocolFamily',
  'providerResourceKind',
  'providerResourceId',
  'auxiliaryResourceIds',
] as const);

const deletionAuthorityReceiptKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'resourceManifestDigest',
  'providerResourceKind',
  'providerResourceId',
  'deletionRouteBinding',
  'deletionRequestProjection',
  'deletionRequestProjectionDigest',
  'registeredAt',
  'expiresAt',
  'deletionAuthorityReceiptDigest',
] as const);

const cleanupResourceResultKeys = Object.freeze([
  'format',
  'version',
  'resourceId',
  'resourceRole',
  'outcome',
  'dispatchIntentDigest',
  'transportReceiptDigest',
  'completedAt',
  'resultDigest',
] as const);

const cleanupReceiptKeys = Object.freeze([
  'format',
  'version',
  'requestDigest',
  'deletionAuthorityReceiptDigest',
  'deletionRequestProjectionDigest',
  'protocolFamily',
  'providerResourceKind',
  'providerResourceId',
  'auxiliaryResourceIds',
  'cleanupStageDigest',
  'cleanupDispatchAckDigest',
  'resourceResults',
  'resourceResultSetDigest',
  'completedAt',
  'cleanupReceiptDigest',
] as const);

const cleanupResponseKeys = Object.freeze([
  'format',
  'version',
  'repositoryCommit',
  'resourceRegistrationRequestDigest',
  'cleanupRequestDigest',
  'deletionAuthorityReceiptDigest',
  'ownerImplementationDigest',
  'stageDigest',
  'ownerAdmissionDigest',
  'dispatchAckDigest',
  'resultIngressDigest',
  'resultIngressReceiptDigest',
  'cleanupReceipt',
  'responseDigest',
] as const);

const cleanupAuthorityRequestKeys = Object.freeze([
  'format',
  'version',
  'repositoryCommit',
  'resourceRegistrationRequestDigest',
  'deletionAuthorityReceiptDigest',
  'cleanupRequestDigest',
] as const);

const repositoryCommitPattern = /^[0-9a-f]{40}$/u;

const resourceKindByProtocol = Object.freeze({
  'anthropic-messages': 'anthropic-file-container-id',
  'gemini-interactions': 'gemini-file-search-store-name',
  'openai-responses': 'openai-vector-store-id',
} as const);

export const resolveAgentCapabilityProbeProviderResourceKind = (
  protocolFamily: AgentCapabilityProbeProviderResourceProtocolFamily
): AgentCapabilityProbeProviderResourceKind => {
  const kind = resourceKindByProtocol[protocolFamily];
  if (kind === undefined) {
    throw new TypeError(
      'Capability probe Provider resource protocol is invalid.'
    );
  }
  return kind;
};

const safeBoundedComponent = (value: unknown): boolean => {
  try {
    return (
      inspectAgentControlJson(
        value,
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_COMPONENT_MAXIMUM_BYTES
      ).length === 0 &&
      !containsAgentControlCredentialLikeText(canonicalJsonText(value))
    );
  } catch {
    return false;
  }
};

export const createAgentCapabilityProbeProviderResourceDeletionRequestProjection =
  (input: {
    requestDigest: CanonicalDigest;
    protocolFamily: AgentCapabilityProbeProviderResourceProtocolFamily;
    providerResourceId: string;
    auxiliaryResourceIds: readonly string[];
  }): AgentCapabilityProbeProviderResourceDeletionRequestProjection => {
    if (
      !hasExactAgentControlKeys(input, [
        'requestDigest',
        'protocolFamily',
        'providerResourceId',
        'auxiliaryResourceIds',
      ]) ||
      !isAgentCanonicalDigest(input.requestDigest) ||
      !Object.hasOwn(resourceKindByProtocol, input.protocolFamily) ||
      !isAgentControlIdentity(input.providerResourceId) ||
      !Array.isArray(input.auxiliaryResourceIds) ||
      input.auxiliaryResourceIds.length >
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_MAXIMUM_AUXILIARY_IDS ||
      input.auxiliaryResourceIds.some(
        (value) =>
          !isAgentControlIdentity(value) || value === input.providerResourceId
      ) ||
      new Set(input.auxiliaryResourceIds).size !==
        input.auxiliaryResourceIds.length
    ) {
      throw new TypeError(
        'Capability probe Provider resource deletion request is invalid.'
      );
    }
    const projection = Object.freeze({
      format:
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_DELETION_REQUEST_PROJECTION_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      requestDigest: input.requestDigest,
      protocolFamily: input.protocolFamily,
      providerResourceKind: resolveAgentCapabilityProbeProviderResourceKind(
        input.protocolFamily
      ),
      providerResourceId: input.providerResourceId,
      auxiliaryResourceIds: Object.freeze(
        [...input.auxiliaryResourceIds].sort(compareUnicodeCodePoints)
      ),
    });
    if (!safeBoundedComponent(projection)) {
      throw new TypeError(
        'Capability probe Provider resource deletion request is unsafe or unbounded.'
      );
    }
    return projection;
  };

export const isAgentCapabilityProbeProviderResourceDeletionRequestProjection = (
  value: unknown
): value is AgentCapabilityProbeProviderResourceDeletionRequestProjection => {
  if (!hasExactAgentControlKeys(value, deletionRequestProjectionKeys)) {
    return false;
  }
  try {
    return sameCanonicalJson(
      value,
      createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
        requestDigest: value.requestDigest as CanonicalDigest,
        protocolFamily:
          value.protocolFamily as AgentCapabilityProbeProviderResourceProtocolFamily,
        providerResourceId: value.providerResourceId as string,
        auxiliaryResourceIds: value.auxiliaryResourceIds as readonly string[],
      })
    );
  } catch {
    return false;
  }
};

export const digestAgentCapabilityProbeProviderResourceDeletionRequestProjection =
  (
    projection: AgentCapabilityProbeProviderResourceDeletionRequestProjection
  ): CanonicalDigest => {
    if (
      !isAgentCapabilityProbeProviderResourceDeletionRequestProjection(
        projection
      )
    ) {
      throw new TypeError(
        'Capability probe Provider resource deletion request is invalid.'
      );
    }
    return digestAgentCanonicalValue(projection);
  };

const deletionAuthorityReceiptBase = (
  value: Omit<
    AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
    'deletionAuthorityReceiptDigest'
  >
) => Object.freeze({ ...value });

export const createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt =
  (input: {
    resourceManifestDigest: CanonicalDigest;
    deletionRequestProjection: AgentCapabilityProbeProviderResourceDeletionRequestProjection;
    registeredAt: Instant;
    expiresAt: Instant;
  }): AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt => {
    if (
      !hasExactAgentControlKeys(input, [
        'resourceManifestDigest',
        'deletionRequestProjection',
        'registeredAt',
        'expiresAt',
      ]) ||
      !isAgentCanonicalDigest(input.resourceManifestDigest) ||
      !isAgentCapabilityProbeProviderResourceDeletionRequestProjection(
        input.deletionRequestProjection
      ) ||
      !isAgentControlInstant(input.registeredAt) ||
      !isAgentControlInstant(input.expiresAt) ||
      Date.parse(input.expiresAt) <= Date.parse(input.registeredAt) ||
      Date.parse(input.expiresAt) - Date.parse(input.registeredAt) >
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_MAXIMUM_LIFETIME_MS
    ) {
      throw new TypeError(
        'Capability probe Provider resource deletion authority is invalid.'
      );
    }
    const projection = input.deletionRequestProjection;
    const base = deletionAuthorityReceiptBase({
      format:
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_DELETION_AUTHORITY_RECEIPT_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      requestDigest: projection.requestDigest,
      resourceManifestDigest: input.resourceManifestDigest,
      providerResourceKind: projection.providerResourceKind,
      providerResourceId: projection.providerResourceId,
      deletionRouteBinding: 'provider-resource.delete',
      deletionRequestProjection: projection,
      deletionRequestProjectionDigest:
        digestAgentCapabilityProbeProviderResourceDeletionRequestProjection(
          projection
        ),
      registeredAt: input.registeredAt,
      expiresAt: input.expiresAt,
    });
    const receipt = Object.freeze({
      ...base,
      deletionAuthorityReceiptDigest: digestAgentCanonicalValue(base),
    });
    if (!safeBoundedComponent(receipt)) {
      throw new TypeError(
        'Capability probe Provider resource deletion authority is unsafe or unbounded.'
      );
    }
    return receipt;
  };

export const isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt = (
  value: unknown
): value is AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt => {
  if (!hasExactAgentControlKeys(value, deletionAuthorityReceiptKeys)) {
    return false;
  }
  try {
    return sameCanonicalJson(
      value,
      createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt({
        resourceManifestDigest: value.resourceManifestDigest as CanonicalDigest,
        deletionRequestProjection:
          value.deletionRequestProjection as AgentCapabilityProbeProviderResourceDeletionRequestProjection,
        registeredAt: value.registeredAt as Instant,
        expiresAt: value.expiresAt as Instant,
      })
    );
  } catch {
    return false;
  }
};

const cleanupResourceResultBase = (
  value: Omit<
    AgentCapabilityProbeProviderResourceCleanupResourceResult,
    'resultDigest'
  >
) => Object.freeze({ ...value });

export const createAgentCapabilityProbeProviderResourceCleanupResourceResult =
  (input: {
    resourceId: string;
    resourceRole: 'auxiliary' | 'primary';
    outcome: 'already-absent' | 'deleted';
    dispatchIntentDigest: CanonicalDigest;
    transportReceiptDigest: CanonicalDigest;
    completedAt: Instant;
  }): AgentCapabilityProbeProviderResourceCleanupResourceResult => {
    if (
      !hasExactAgentControlKeys(input, [
        'resourceId',
        'resourceRole',
        'outcome',
        'dispatchIntentDigest',
        'transportReceiptDigest',
        'completedAt',
      ]) ||
      !isAgentControlIdentity(input.resourceId) ||
      !['auxiliary', 'primary'].includes(input.resourceRole) ||
      !['already-absent', 'deleted'].includes(input.outcome) ||
      !isAgentCanonicalDigest(input.dispatchIntentDigest) ||
      !isAgentCanonicalDigest(input.transportReceiptDigest) ||
      !isAgentControlInstant(input.completedAt)
    ) {
      throw new TypeError(
        'Capability probe Provider resource cleanup result is invalid.'
      );
    }
    const base = cleanupResourceResultBase({
      format:
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESOURCE_RESULT_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      ...input,
    });
    return Object.freeze({
      ...base,
      resultDigest: digestAgentCanonicalValue(base),
    });
  };

export const isAgentCapabilityProbeProviderResourceCleanupResourceResult = (
  value: unknown
): value is AgentCapabilityProbeProviderResourceCleanupResourceResult => {
  if (!hasExactAgentControlKeys(value, cleanupResourceResultKeys)) return false;
  try {
    return sameCanonicalJson(
      value,
      createAgentCapabilityProbeProviderResourceCleanupResourceResult({
        resourceId: value.resourceId as string,
        resourceRole: value.resourceRole as 'auxiliary' | 'primary',
        outcome: value.outcome as 'already-absent' | 'deleted',
        dispatchIntentDigest: value.dispatchIntentDigest as CanonicalDigest,
        transportReceiptDigest: value.transportReceiptDigest as CanonicalDigest,
        completedAt: value.completedAt as Instant,
      })
    );
  } catch {
    return false;
  }
};

const orderedCleanupResourceResults = (
  values: readonly AgentCapabilityProbeProviderResourceCleanupResourceResult[]
): readonly AgentCapabilityProbeProviderResourceCleanupResourceResult[] =>
  Object.freeze(
    [...values].sort((left, right) => {
      if (left.resourceRole !== right.resourceRole) {
        return left.resourceRole === 'primary' ? -1 : 1;
      }
      return compareUnicodeCodePoints(left.resourceId, right.resourceId);
    })
  );

export const digestAgentCapabilityProbeProviderResourceCleanupStage = (
  receipt: AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt
): CanonicalDigest => {
  if (
    !isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(receipt)
  ) {
    throw new TypeError(
      'Capability probe Provider resource deletion authority is invalid.'
    );
  }
  return digestAgentCanonicalValue({
    format: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_STAGE_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
    requestDigest: receipt.requestDigest,
    deletionAuthorityReceiptDigest: receipt.deletionAuthorityReceiptDigest,
    deletionRequestProjectionDigest: receipt.deletionRequestProjectionDigest,
  });
};

export const digestAgentCapabilityProbeProviderResourceCleanupDispatchAck = (
  receipt: AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  resourceResultSetDigest: CanonicalDigest
): CanonicalDigest => {
  if (
    !isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(receipt) ||
    !isAgentCanonicalDigest(resourceResultSetDigest)
  ) {
    throw new TypeError(
      'Capability probe Provider resource cleanup dispatch acknowledgement is invalid.'
    );
  }
  return digestAgentCanonicalValue({
    format:
      AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_DISPATCH_ACK_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
    requestDigest: receipt.requestDigest,
    deletionAuthorityReceiptDigest: receipt.deletionAuthorityReceiptDigest,
    cleanupStageDigest:
      digestAgentCapabilityProbeProviderResourceCleanupStage(receipt),
    resourceResultSetDigest,
  });
};

const cleanupReceiptBase = (
  value: Omit<
    AgentCapabilityProbeProviderResourceCleanupReceipt,
    'cleanupReceiptDigest'
  >
) => Object.freeze({ ...value });

export const createAgentCapabilityProbeProviderResourceCleanupReceipt = (
  input: Readonly<{
    deletionAuthorityReceipt: AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt;
    resourceResults: readonly AgentCapabilityProbeProviderResourceCleanupResourceResult[];
  }>
): AgentCapabilityProbeProviderResourceCleanupReceipt => {
  if (
    !hasExactAgentControlKeys(input, [
      'deletionAuthorityReceipt',
      'resourceResults',
    ]) ||
    !isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(
      input.deletionAuthorityReceipt
    ) ||
    !Array.isArray(input.resourceResults) ||
    input.resourceResults.length < 1 ||
    input.resourceResults.length >
      AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_MAXIMUM_AUXILIARY_IDS + 1 ||
    input.resourceResults.some(
      (result) =>
        !isAgentCapabilityProbeProviderResourceCleanupResourceResult(result)
    )
  ) {
    throw new TypeError(
      'Capability probe Provider resource cleanup receipt is invalid.'
    );
  }
  const deletion = input.deletionAuthorityReceipt;
  const resourceResults = orderedCleanupResourceResults(input.resourceResults);
  const expectedResourceIds = Object.freeze([
    deletion.providerResourceId,
    ...deletion.deletionRequestProjection.auxiliaryResourceIds,
  ]);
  const actualResourceIds = resourceResults.map(({ resourceId }) => resourceId);
  const primary = resourceResults.filter(
    ({ resourceRole }) => resourceRole === 'primary'
  );
  if (
    primary.length !== 1 ||
    primary[0]?.resourceId !== deletion.providerResourceId ||
    new Set(actualResourceIds).size !== actualResourceIds.length ||
    !sameCanonicalJson(
      [...actualResourceIds].sort(compareUnicodeCodePoints),
      [...expectedResourceIds].sort(compareUnicodeCodePoints)
    ) ||
    resourceResults.some(
      ({ resourceId, resourceRole, completedAt }) =>
        (resourceId === deletion.providerResourceId) !==
          (resourceRole === 'primary') ||
        Date.parse(completedAt) < Date.parse(deletion.registeredAt)
    )
  ) {
    throw new TypeError(
      'Capability probe Provider resource cleanup result set drifted.'
    );
  }
  const resourceResultSetDigest = digestAgentCanonicalValue({
    resourceResults: resourceResults.map(({ resourceId, resultDigest }) =>
      Object.freeze({ resourceId, resultDigest })
    ),
  });
  const completedAt = resourceResults.reduce(
    (latest, result) =>
      Date.parse(result.completedAt) > Date.parse(latest)
        ? result.completedAt
        : latest,
    resourceResults[0]!.completedAt
  );
  const base = cleanupReceiptBase({
    format: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RECEIPT_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
    requestDigest: deletion.requestDigest,
    deletionAuthorityReceiptDigest: deletion.deletionAuthorityReceiptDigest,
    deletionRequestProjectionDigest: deletion.deletionRequestProjectionDigest,
    protocolFamily: deletion.deletionRequestProjection.protocolFamily,
    providerResourceKind: deletion.providerResourceKind,
    providerResourceId: deletion.providerResourceId,
    auxiliaryResourceIds:
      deletion.deletionRequestProjection.auxiliaryResourceIds,
    cleanupStageDigest:
      digestAgentCapabilityProbeProviderResourceCleanupStage(deletion),
    cleanupDispatchAckDigest:
      digestAgentCapabilityProbeProviderResourceCleanupDispatchAck(
        deletion,
        resourceResultSetDigest
      ),
    resourceResults,
    resourceResultSetDigest,
    completedAt,
  });
  const receipt = Object.freeze({
    ...base,
    cleanupReceiptDigest: digestAgentCanonicalValue(base),
  });
  if (
    inspectAgentControlJson(
      receipt,
      AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES
    ).length > 0 ||
    containsAgentControlCredentialLikeText(canonicalJsonText(receipt))
  ) {
    throw new TypeError(
      'Capability probe Provider resource cleanup receipt is unsafe or unbounded.'
    );
  }
  return receipt;
};

export const isAgentCapabilityProbeProviderResourceCleanupReceipt = (
  value: unknown
): value is AgentCapabilityProbeProviderResourceCleanupReceipt => {
  if (!hasExactAgentControlKeys(value, cleanupReceiptKeys)) return false;
  try {
    const receipt = value as AgentCapabilityProbeProviderResourceCleanupReceipt;
    const deletionProjection =
      createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
        requestDigest: receipt.requestDigest,
        protocolFamily: receipt.protocolFamily,
        providerResourceId: receipt.providerResourceId,
        auxiliaryResourceIds: receipt.auxiliaryResourceIds,
      });
    if (
      !isAgentCanonicalDigest(receipt.deletionAuthorityReceiptDigest) ||
      !Array.isArray(receipt.resourceResults) ||
      receipt.resourceResults.length < 1 ||
      receipt.resourceResults.length >
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_MAXIMUM_AUXILIARY_IDS + 1 ||
      receipt.resourceResults.some(
        (result) =>
          !isAgentCapabilityProbeProviderResourceCleanupResourceResult(result)
      ) ||
      receipt.providerResourceKind !==
        resolveAgentCapabilityProbeProviderResourceKind(
          receipt.protocolFamily
        ) ||
      receipt.deletionRequestProjectionDigest !==
        digestAgentCapabilityProbeProviderResourceDeletionRequestProjection(
          deletionProjection
        )
    ) {
      return false;
    }
    const resourceResults = orderedCleanupResourceResults(
      receipt.resourceResults
    );
    const expectedResourceIds = [
      receipt.providerResourceId,
      ...receipt.auxiliaryResourceIds,
    ].sort(compareUnicodeCodePoints);
    const actualResourceIds = resourceResults
      .map(({ resourceId }) => resourceId)
      .sort(compareUnicodeCodePoints);
    const primary = resourceResults.filter(
      ({ resourceRole }) => resourceRole === 'primary'
    );
    const resourceResultSetDigest = digestAgentCanonicalValue({
      resourceResults: resourceResults.map(({ resourceId, resultDigest }) =>
        Object.freeze({ resourceId, resultDigest })
      ),
    });
    const completedAt = resourceResults.reduce(
      (latest, result) =>
        Date.parse(result.completedAt) > Date.parse(latest)
          ? result.completedAt
          : latest,
      resourceResults[0]!.completedAt
    );
    const cleanupStageDigest = digestAgentCanonicalValue({
      format: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_STAGE_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      requestDigest: receipt.requestDigest,
      deletionAuthorityReceiptDigest: receipt.deletionAuthorityReceiptDigest,
      deletionRequestProjectionDigest: receipt.deletionRequestProjectionDigest,
    });
    const cleanupDispatchAckDigest = digestAgentCanonicalValue({
      format:
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_DISPATCH_ACK_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      requestDigest: receipt.requestDigest,
      deletionAuthorityReceiptDigest: receipt.deletionAuthorityReceiptDigest,
      cleanupStageDigest,
      resourceResultSetDigest,
    });
    const base = cleanupReceiptBase({
      format: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RECEIPT_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      requestDigest: receipt.requestDigest,
      deletionAuthorityReceiptDigest: receipt.deletionAuthorityReceiptDigest,
      deletionRequestProjectionDigest: receipt.deletionRequestProjectionDigest,
      protocolFamily: receipt.protocolFamily,
      providerResourceKind: receipt.providerResourceKind,
      providerResourceId: receipt.providerResourceId,
      auxiliaryResourceIds: receipt.auxiliaryResourceIds,
      cleanupStageDigest,
      cleanupDispatchAckDigest,
      resourceResults,
      resourceResultSetDigest,
      completedAt,
    });
    return (
      primary.length === 1 &&
      primary[0]?.resourceId === receipt.providerResourceId &&
      new Set(actualResourceIds).size === actualResourceIds.length &&
      sameCanonicalJson(actualResourceIds, expectedResourceIds) &&
      resourceResults.every(
        ({ resourceId, resourceRole }) =>
          (resourceId === receipt.providerResourceId) ===
          (resourceRole === 'primary')
      ) &&
      sameCanonicalJson(
        value,
        Object.freeze({
          ...base,
          cleanupReceiptDigest: digestAgentCanonicalValue(base),
        })
      ) &&
      inspectAgentControlJson(
        value,
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RECEIPT_MAXIMUM_BYTES
      ).length === 0 &&
      !containsAgentControlCredentialLikeText(canonicalJsonText(value))
    );
  } catch {
    return false;
  }
};

export const digestAgentCapabilityProbeProviderResourceCleanupAuthorityRequest =
  (input: {
    repositoryCommit: string;
    resourceRegistrationRequestDigest: CanonicalDigest;
    deletionAuthorityReceiptDigest: CanonicalDigest;
  }): CanonicalDigest => {
    if (
      !hasExactAgentControlKeys(input, [
        'repositoryCommit',
        'resourceRegistrationRequestDigest',
        'deletionAuthorityReceiptDigest',
      ]) ||
      !repositoryCommitPattern.test(input.repositoryCommit) ||
      !isAgentCanonicalDigest(input.resourceRegistrationRequestDigest) ||
      !isAgentCanonicalDigest(input.deletionAuthorityReceiptDigest)
    ) {
      throw new TypeError(
        'Capability probe Provider resource cleanup authority request is invalid.'
      );
    }
    return digestAgentCanonicalValue({
      format:
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_AUTHORITY_REQUEST_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      ...input,
    });
  };

export const createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest =
  (input: {
    repositoryCommit: string;
    resourceRegistrationRequestDigest: CanonicalDigest;
    deletionAuthorityReceiptDigest: CanonicalDigest;
  }): AgentCapabilityProbeProviderResourceCleanupAuthorityRequest =>
    Object.freeze({
      format:
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_AUTHORITY_REQUEST_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      ...input,
      cleanupRequestDigest:
        digestAgentCapabilityProbeProviderResourceCleanupAuthorityRequest(
          input
        ),
    });

export const isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest = (
  value: unknown
): value is AgentCapabilityProbeProviderResourceCleanupAuthorityRequest => {
  if (!hasExactAgentControlKeys(value, cleanupAuthorityRequestKeys)) {
    return false;
  }
  try {
    return sameCanonicalJson(
      value,
      createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest({
        repositoryCommit: value.repositoryCommit as string,
        resourceRegistrationRequestDigest:
          value.resourceRegistrationRequestDigest as CanonicalDigest,
        deletionAuthorityReceiptDigest:
          value.deletionAuthorityReceiptDigest as CanonicalDigest,
      })
    );
  } catch {
    return false;
  }
};

export const digestAgentCapabilityProbeProviderResourceCleanupAuthorityStage =
  (input: {
    cleanupRequestDigest: CanonicalDigest;
    ownerImplementationDigest: CanonicalDigest;
  }): CanonicalDigest => {
    if (
      !hasExactAgentControlKeys(input, [
        'cleanupRequestDigest',
        'ownerImplementationDigest',
      ]) ||
      !isAgentCanonicalDigest(input.cleanupRequestDigest) ||
      !isAgentCanonicalDigest(input.ownerImplementationDigest)
    ) {
      throw new TypeError(
        'Capability probe Provider resource cleanup authority stage is invalid.'
      );
    }
    return digestAgentCanonicalValue({
      format:
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_AUTHORITY_STAGE_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      ...input,
    });
  };

export const digestAgentCapabilityProbeProviderResourceCleanupOwnerAdmission =
  (input: {
    cleanupRequestDigest: CanonicalDigest;
    stageDigest: CanonicalDigest;
    ownerImplementationDigest: CanonicalDigest;
  }): CanonicalDigest => {
    if (
      !hasExactAgentControlKeys(input, [
        'cleanupRequestDigest',
        'stageDigest',
        'ownerImplementationDigest',
      ]) ||
      !isAgentCanonicalDigest(input.cleanupRequestDigest) ||
      !isAgentCanonicalDigest(input.stageDigest) ||
      !isAgentCanonicalDigest(input.ownerImplementationDigest)
    ) {
      throw new TypeError(
        'Capability probe Provider resource cleanup owner admission is invalid.'
      );
    }
    return digestAgentCanonicalValue({
      format:
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_OWNER_ADMISSION_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      ...input,
    });
  };

export const digestAgentCapabilityProbeProviderResourceCleanupAuthorityDispatchAck =
  (input: {
    cleanupRequestDigest: CanonicalDigest;
    stageDigest: CanonicalDigest;
    ownerAdmissionDigest: CanonicalDigest;
    cleanupReceiptDigest: CanonicalDigest;
  }): CanonicalDigest => {
    if (
      !hasExactAgentControlKeys(input, [
        'cleanupRequestDigest',
        'stageDigest',
        'ownerAdmissionDigest',
        'cleanupReceiptDigest',
      ]) ||
      !isAgentCanonicalDigest(input.cleanupRequestDigest) ||
      !isAgentCanonicalDigest(input.stageDigest) ||
      !isAgentCanonicalDigest(input.ownerAdmissionDigest) ||
      !isAgentCanonicalDigest(input.cleanupReceiptDigest)
    ) {
      throw new TypeError(
        'Capability probe Provider resource cleanup authority dispatch acknowledgement is invalid.'
      );
    }
    return digestAgentCanonicalValue({
      format:
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_AUTHORITY_DISPATCH_ACK_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      ...input,
    });
  };

export const digestAgentCapabilityProbeProviderResourceCleanupResultIngress =
  (input: {
    cleanupRequestDigest: CanonicalDigest;
    dispatchAckDigest: CanonicalDigest;
    cleanupReceiptDigest: CanonicalDigest;
  }): CanonicalDigest => {
    if (
      !hasExactAgentControlKeys(input, [
        'cleanupRequestDigest',
        'dispatchAckDigest',
        'cleanupReceiptDigest',
      ]) ||
      !isAgentCanonicalDigest(input.cleanupRequestDigest) ||
      !isAgentCanonicalDigest(input.dispatchAckDigest) ||
      !isAgentCanonicalDigest(input.cleanupReceiptDigest)
    ) {
      throw new TypeError(
        'Capability probe Provider resource cleanup result ingress is invalid.'
      );
    }
    return digestAgentCanonicalValue({
      format:
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      ...input,
    });
  };

export const digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt =
  (input: {
    resultIngressDigest: CanonicalDigest;
    cleanupReceiptDigest: CanonicalDigest;
  }): CanonicalDigest => {
    if (
      !hasExactAgentControlKeys(input, [
        'resultIngressDigest',
        'cleanupReceiptDigest',
      ]) ||
      !isAgentCanonicalDigest(input.resultIngressDigest) ||
      !isAgentCanonicalDigest(input.cleanupReceiptDigest)
    ) {
      throw new TypeError(
        'Capability probe Provider resource cleanup result ingress receipt is invalid.'
      );
    }
    return digestAgentCanonicalValue({
      format:
        AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_RECEIPT_FORMAT,
      version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
      ...input,
    });
  };

const cleanupResponseBase = (
  value: Omit<
    AgentCapabilityProbeProviderResourceCleanupResponse,
    'responseDigest'
  >
) => Object.freeze({ ...value });

export const createAgentCapabilityProbeProviderResourceCleanupResponse = (
  input: Readonly<{
    repositoryCommit: string;
    resourceRegistrationRequestDigest: CanonicalDigest;
    ownerImplementationDigest: CanonicalDigest;
    cleanupReceipt: AgentCapabilityProbeProviderResourceCleanupReceipt;
  }>
): AgentCapabilityProbeProviderResourceCleanupResponse => {
  if (
    !hasExactAgentControlKeys(input, [
      'repositoryCommit',
      'resourceRegistrationRequestDigest',
      'ownerImplementationDigest',
      'cleanupReceipt',
    ]) ||
    !repositoryCommitPattern.test(input.repositoryCommit) ||
    !isAgentCanonicalDigest(input.resourceRegistrationRequestDigest) ||
    !isAgentCanonicalDigest(input.ownerImplementationDigest) ||
    !isAgentCapabilityProbeProviderResourceCleanupReceipt(
      input.cleanupReceipt
    ) ||
    input.resourceRegistrationRequestDigest !==
      input.cleanupReceipt.requestDigest
  ) {
    throw new TypeError(
      'Capability probe Provider resource cleanup response is invalid.'
    );
  }
  const cleanupRequestDigest =
    digestAgentCapabilityProbeProviderResourceCleanupAuthorityRequest({
      repositoryCommit: input.repositoryCommit,
      resourceRegistrationRequestDigest:
        input.resourceRegistrationRequestDigest,
      deletionAuthorityReceiptDigest:
        input.cleanupReceipt.deletionAuthorityReceiptDigest,
    });
  const stageDigest =
    digestAgentCapabilityProbeProviderResourceCleanupAuthorityStage({
      cleanupRequestDigest,
      ownerImplementationDigest: input.ownerImplementationDigest,
    });
  const ownerAdmissionDigest =
    digestAgentCapabilityProbeProviderResourceCleanupOwnerAdmission({
      cleanupRequestDigest,
      stageDigest,
      ownerImplementationDigest: input.ownerImplementationDigest,
    });
  const dispatchAckDigest =
    digestAgentCapabilityProbeProviderResourceCleanupAuthorityDispatchAck({
      cleanupRequestDigest,
      stageDigest,
      ownerAdmissionDigest,
      cleanupReceiptDigest: input.cleanupReceipt.cleanupReceiptDigest,
    });
  const resultIngressDigest =
    digestAgentCapabilityProbeProviderResourceCleanupResultIngress({
      cleanupRequestDigest,
      dispatchAckDigest,
      cleanupReceiptDigest: input.cleanupReceipt.cleanupReceiptDigest,
    });
  const resultIngressReceiptDigest =
    digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt({
      resultIngressDigest,
      cleanupReceiptDigest: input.cleanupReceipt.cleanupReceiptDigest,
    });
  const base = cleanupResponseBase({
    format: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESPONSE_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
    repositoryCommit: input.repositoryCommit,
    resourceRegistrationRequestDigest: input.resourceRegistrationRequestDigest,
    cleanupRequestDigest,
    deletionAuthorityReceiptDigest:
      input.cleanupReceipt.deletionAuthorityReceiptDigest,
    ownerImplementationDigest: input.ownerImplementationDigest,
    stageDigest,
    ownerAdmissionDigest,
    dispatchAckDigest,
    resultIngressDigest,
    resultIngressReceiptDigest,
    cleanupReceipt: input.cleanupReceipt,
  });
  const response = Object.freeze({
    ...base,
    responseDigest: digestAgentCanonicalValue(base),
  });
  if (
    inspectAgentControlJson(
      response,
      AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESPONSE_MAXIMUM_BYTES
    ).length > 0 ||
    containsAgentControlCredentialLikeText(canonicalJsonText(response))
  ) {
    throw new TypeError(
      'Capability probe Provider resource cleanup response is unsafe or unbounded.'
    );
  }
  return response;
};

export const isAgentCapabilityProbeProviderResourceCleanupResponse = (
  value: unknown
): value is AgentCapabilityProbeProviderResourceCleanupResponse => {
  if (!hasExactAgentControlKeys(value, cleanupResponseKeys)) return false;
  try {
    return sameCanonicalJson(
      value,
      createAgentCapabilityProbeProviderResourceCleanupResponse({
        repositoryCommit: value.repositoryCommit as string,
        resourceRegistrationRequestDigest:
          value.resourceRegistrationRequestDigest as CanonicalDigest,
        ownerImplementationDigest:
          value.ownerImplementationDigest as CanonicalDigest,
        cleanupReceipt:
          value.cleanupReceipt as AgentCapabilityProbeProviderResourceCleanupReceipt,
      })
    );
  } catch {
    return false;
  }
};

export const matchAgentCapabilityProbeProviderResourceCleanupResponse = (
  response: AgentCapabilityProbeProviderResourceCleanupResponse,
  request: AgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  deletionReceipt: AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  cleanupReceipt: AgentCapabilityProbeProviderResourceCleanupReceipt
): boolean =>
  isAgentCapabilityProbeProviderResourceCleanupResponse(response) &&
  isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest(request) &&
  isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(
    deletionReceipt
  ) &&
  isAgentCapabilityProbeProviderResourceCleanupReceipt(cleanupReceipt) &&
  request.repositoryCommit === response.repositoryCommit &&
  request.resourceRegistrationRequestDigest ===
    response.resourceRegistrationRequestDigest &&
  request.cleanupRequestDigest === response.cleanupRequestDigest &&
  request.deletionAuthorityReceiptDigest ===
    response.deletionAuthorityReceiptDigest &&
  request.resourceRegistrationRequestDigest === deletionReceipt.requestDigest &&
  request.deletionAuthorityReceiptDigest ===
    deletionReceipt.deletionAuthorityReceiptDigest &&
  request.resourceRegistrationRequestDigest === cleanupReceipt.requestDigest &&
  request.deletionAuthorityReceiptDigest ===
    cleanupReceipt.deletionAuthorityReceiptDigest &&
  sameCanonicalJson(response.cleanupReceipt, cleanupReceipt);

const createAuthority = (
  program: AgentCapabilityProbeProgram,
  input: CreateAgentCapabilityProbeProviderResourceAuthorityInput
): AgentCapabilityProbeProviderResourceAuthority => {
  const descriptor = program.providerRequestIntent.publicProbeResource;
  if (
    !isAgentCapabilityProbeProgram(program) ||
    program.profileProjection.capabilityId !== 'provider.hosted-retrieval' ||
    descriptor === null ||
    !hasExactAgentControlKeys(input, [
      'protocolFamily',
      'providerConfigurationId',
      'modelId',
      'modelLineageDigest',
      'adapterDigest',
      'providerResourceId',
      'resourceManifestDigest',
      'contentUploadReceiptDigest',
      'deletionAuthorityReceiptDigest',
      'registeredAt',
      'expiresAt',
    ]) ||
    !Object.hasOwn(resourceKindByProtocol, input.protocolFamily) ||
    ![
      input.providerConfigurationId,
      input.modelId,
      input.providerResourceId,
    ].every(isAgentControlIdentity) ||
    ![
      input.modelLineageDigest,
      input.adapterDigest,
      input.resourceManifestDigest,
      input.contentUploadReceiptDigest,
      input.deletionAuthorityReceiptDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentControlInstant(input.registeredAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.registeredAt) ||
    Date.parse(input.expiresAt) - Date.parse(input.registeredAt) >
      AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_MAXIMUM_LIFETIME_MS
  ) {
    throw new TypeError('Capability probe provider resource is invalid.');
  }
  const base = Object.freeze({
    format: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_FORMAT,
    version: AGENT_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_VERSION,
    capabilityProfileId: program.profileProjection.capabilityProfileId as
      | 'g4-provider-hosted-retrieval-core'
      | 'g4-provider-hosted-retrieval-document',
    probeProgramDigest: program.programDigest,
    publicResourceDescriptorDigest: descriptor.descriptorDigest,
    ...input,
    providerResourceKind: resourceKindByProtocol[input.protocolFamily],
  });
  const authority = Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
  if (
    inspectAgentControlJson(authority, 16_384).length > 0 ||
    containsAgentControlCredentialLikeText(JSON.stringify(authority))
  ) {
    throw new TypeError(
      'Capability probe provider resource is unsafe or unbounded.'
    );
  }
  return authority;
};

export const createAgentCapabilityProbeProviderResourceAuthority =
  createAuthority;

export const isAgentCapabilityProbeProviderResourceAuthority = (
  value: unknown,
  program: AgentCapabilityProbeProgram
): value is AgentCapabilityProbeProviderResourceAuthority => {
  if (!hasExactAgentControlKeys(value, exactKeys)) return false;
  try {
    const {
      format: _format,
      version: _version,
      capabilityProfileId: _capabilityProfileId,
      probeProgramDigest: _probeProgramDigest,
      publicResourceDescriptorDigest: _publicResourceDescriptorDigest,
      providerResourceKind: _providerResourceKind,
      authorityDigest: _authorityDigest,
      ...input
    } = value as AgentCapabilityProbeProviderResourceAuthority;
    return sameCanonicalJson(value, createAuthority(program, input));
  } catch {
    return false;
  }
};

export const matchAgentCapabilityProbeProviderResourceAuthority = (
  authority: AgentCapabilityProbeProviderResourceAuthority,
  program: AgentCapabilityProbeProgram,
  binding: Readonly<{
    protocolFamily:
      'anthropic-messages' | 'gemini-interactions' | 'openai-responses';
    providerConfigurationId: string;
    modelId: string;
    modelLineageDigest: CanonicalDigest;
    adapterDigest: CanonicalDigest;
    authorityDigest: CanonicalDigest;
    observedAt: Instant;
  }>
): boolean =>
  isAgentCapabilityProbeProviderResourceAuthority(authority, program) &&
  authority.protocolFamily === binding.protocolFamily &&
  authority.providerConfigurationId === binding.providerConfigurationId &&
  authority.modelId === binding.modelId &&
  authority.modelLineageDigest === binding.modelLineageDigest &&
  authority.adapterDigest === binding.adapterDigest &&
  authority.authorityDigest === binding.authorityDigest &&
  isAgentControlInstant(binding.observedAt) &&
  Date.parse(authority.registeredAt) <= Date.parse(binding.observedAt) &&
  Date.parse(authority.expiresAt) >= Date.parse(binding.observedAt);

export const matchAgentCapabilityProbeProviderResourceDeletionAuthority = (
  receipt: AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  authority: AgentCapabilityProbeProviderResourceAuthority,
  program: AgentCapabilityProbeProgram,
  binding: Readonly<{ requestDigest: CanonicalDigest }>
): boolean =>
  isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(receipt) &&
  isAgentCapabilityProbeProviderResourceAuthority(authority, program) &&
  isAgentCanonicalDigest(binding.requestDigest) &&
  receipt.requestDigest === binding.requestDigest &&
  receipt.deletionRequestProjection.requestDigest === binding.requestDigest &&
  receipt.deletionRequestProjection.protocolFamily ===
    authority.protocolFamily &&
  receipt.providerResourceKind === authority.providerResourceKind &&
  receipt.deletionRequestProjection.providerResourceKind ===
    authority.providerResourceKind &&
  receipt.providerResourceId === authority.providerResourceId &&
  receipt.deletionRequestProjection.providerResourceId ===
    authority.providerResourceId &&
  receipt.resourceManifestDigest === authority.resourceManifestDigest &&
  receipt.registeredAt === authority.registeredAt &&
  receipt.expiresAt === authority.expiresAt &&
  receipt.deletionAuthorityReceiptDigest ===
    authority.deletionAuthorityReceiptDigest;

export const matchAgentCapabilityProbeProviderResourceCleanupReceipt = (
  cleanupReceipt: AgentCapabilityProbeProviderResourceCleanupReceipt,
  deletionReceipt: AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  authority: AgentCapabilityProbeProviderResourceAuthority,
  program: AgentCapabilityProbeProgram,
  binding: Readonly<{
    probeObservedAt: Instant;
    plannedAt: Instant;
  }>
): boolean =>
  isAgentCapabilityProbeProviderResourceCleanupReceipt(cleanupReceipt) &&
  matchAgentCapabilityProbeProviderResourceDeletionAuthority(
    deletionReceipt,
    authority,
    program,
    { requestDigest: deletionReceipt.requestDigest }
  ) &&
  isAgentControlInstant(binding.probeObservedAt) &&
  isAgentControlInstant(binding.plannedAt) &&
  cleanupReceipt.requestDigest === deletionReceipt.requestDigest &&
  cleanupReceipt.deletionAuthorityReceiptDigest ===
    deletionReceipt.deletionAuthorityReceiptDigest &&
  cleanupReceipt.deletionRequestProjectionDigest ===
    deletionReceipt.deletionRequestProjectionDigest &&
  cleanupReceipt.protocolFamily === authority.protocolFamily &&
  cleanupReceipt.providerResourceKind === authority.providerResourceKind &&
  cleanupReceipt.providerResourceId === authority.providerResourceId &&
  sameCanonicalJson(
    cleanupReceipt.auxiliaryResourceIds,
    deletionReceipt.deletionRequestProjection.auxiliaryResourceIds
  ) &&
  Date.parse(cleanupReceipt.completedAt) >=
    Date.parse(binding.probeObservedAt) &&
  Date.parse(cleanupReceipt.completedAt) <= Date.parse(binding.plannedAt);
