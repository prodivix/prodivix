import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  hasExactAgentControlKeys,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
  safe,
} from './agentHostedRetrievalRuntimeResourceRegistration';

export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-receipt' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_RECEIPT_SET_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-receipt-set' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_PROJECTION_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-projection' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_STORE_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-store-request' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_PURPOSE =
  'hosted-retrieval-runtime-resource.lifecycle-journal.transport.reconcile.read' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_STORE_PURPOSE =
  'hosted-retrieval-runtime-resource.lifecycle-journal.transport.reconcile.store' as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_BYTES =
  65_536 as const;
export const AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_RECEIPTS =
  4 as const;

export type AgentHostedRetrievalRuntimeResourceLifecycleMutationKind =
  | 'create-primary'
  | 'delete-resource'
  | 'upload-content'
  | 'upload-content-finalize'
  | 'upload-content-start';

export type AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    purpose: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_PURPOSE;
    dispatchIntentDigest: CanonicalDigest;
    dispatchStageClaimReceiptDigest: CanonicalDigest;
    transportReceiptDigest: CanonicalDigest;
    mutationKind: AgentHostedRetrievalRuntimeResourceLifecycleMutationKind;
    mutationSequence: number;
    providerConfigurationId: string;
    endpointId: string;
    method: 'GET';
    requestedAt: Instant;
    requestDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_RECEIPT_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    request: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest;
    requestDigest: CanonicalDigest;
    observationAuthorityIssuerId: string;
    observationAuthorityImplementationDigest: CanonicalDigest;
    dispatchIntentDigest: CanonicalDigest;
    dispatchStageClaimReceiptDigest: CanonicalDigest;
    transportReceiptDigest: CanonicalDigest;
    mutationKind: AgentHostedRetrievalRuntimeResourceLifecycleMutationKind;
    mutationSequence: number;
    observationOutcome:
      'accepted' | 'already-absent' | 'created' | 'deleted' | 'uploaded';
    resourceId: string | null;
    resourceRole: 'auxiliary' | 'primary' | null;
    resourceManifestDigest: CanonicalDigest | null;
    httpStatus: number;
    providerRequestId: string | null;
    observedAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_RECEIPT_SET_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    operation: 'create' | 'delete';
    registrationRequestDigest: CanonicalDigest;
    receipts: readonly AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt[];
    receiptDigests: readonly CanonicalDigest[];
    setDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_PROJECTION_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    dispatchIntentDigest: CanonicalDigest;
    dispatchStageClaimReceiptDigest: CanonicalDigest;
    transportReceiptDigest: CanonicalDigest;
    mutationKind: AgentHostedRetrievalRuntimeResourceLifecycleMutationKind;
    mutationSequence: number;
    providerConfigurationId: string;
    endpointId: string;
    method: 'GET';
    observationOutcome:
      'accepted' | 'already-absent' | 'created' | 'deleted' | 'uploaded';
    resourceId: string | null;
    resourceRole: 'auxiliary' | 'primary' | null;
    resourceManifestDigest: CanonicalDigest | null;
    httpStatus: number;
    providerRequestId: string | null;
    requestProjectionDigest: CanonicalDigest;
    responseProjectionDigest: CanonicalDigest;
    responseBodyDigest: CanonicalDigest;
    responseBytes: number;
    observedAt: Instant;
    projectionDigest: CanonicalDigest;
  }>;

export type AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest =
  Readonly<{
    format: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_STORE_REQUEST_FORMAT;
    version: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION;
    purpose: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_STORE_PURPOSE;
    authorizationRequest: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest;
    authorizationRequestDigest: CanonicalDigest;
    observationProjection: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection;
    observationProjectionDigest: CanonicalDigest;
    requestDigest: CanonicalDigest;
  }>;

const mutationKinds = Object.freeze([
  'create-primary',
  'delete-resource',
  'upload-content',
  'upload-content-finalize',
  'upload-content-start',
] as const);
const requestKeys = Object.freeze([
  'format',
  'version',
  'purpose',
  'dispatchIntentDigest',
  'dispatchStageClaimReceiptDigest',
  'transportReceiptDigest',
  'mutationKind',
  'mutationSequence',
  'providerConfigurationId',
  'endpointId',
  'method',
  'requestedAt',
  'requestDigest',
] as const);
const receiptKeys = Object.freeze([
  'format',
  'version',
  'request',
  'requestDigest',
  'observationAuthorityIssuerId',
  'observationAuthorityImplementationDigest',
  'dispatchIntentDigest',
  'transportReceiptDigest',
  'mutationKind',
  'dispatchStageClaimReceiptDigest',
  'mutationSequence',
  'observationOutcome',
  'resourceId',
  'resourceRole',
  'resourceManifestDigest',
  'httpStatus',
  'providerRequestId',
  'observedAt',
  'receiptDigest',
] as const);
const setKeys = Object.freeze([
  'format',
  'version',
  'operation',
  'registrationRequestDigest',
  'receipts',
  'receiptDigests',
  'setDigest',
] as const);
const projectionKeys = Object.freeze([
  'format',
  'version',
  'dispatchIntentDigest',
  'dispatchStageClaimReceiptDigest',
  'transportReceiptDigest',
  'mutationKind',
  'mutationSequence',
  'providerConfigurationId',
  'endpointId',
  'method',
  'observationOutcome',
  'resourceId',
  'resourceRole',
  'resourceManifestDigest',
  'httpStatus',
  'providerRequestId',
  'requestProjectionDigest',
  'responseProjectionDigest',
  'responseBodyDigest',
  'responseBytes',
  'observedAt',
  'projectionDigest',
] as const);
const storeRequestKeys = Object.freeze([
  'format',
  'version',
  'purpose',
  'authorizationRequest',
  'authorizationRequestDigest',
  'observationProjection',
  'observationProjectionDigest',
  'requestDigest',
] as const);

export const createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection,
      'format' | 'projectionDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection => {
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_PROJECTION_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
    });
    const value = Object.freeze({
      ...base,
      projectionDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection(
        value
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle reconciliation projection is invalid.'
      );
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection => {
    if (!hasExactAgentControlKeys(value, projectionKeys)) return false;
    const projection =
      value as AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection;
    const { projectionDigest, ...base } = projection;
    const deleteMutation = projection.mutationKind === 'delete-resource';
    return (
      projection.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_PROJECTION_FORMAT &&
      projection.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      [
        projection.dispatchIntentDigest,
        projection.dispatchStageClaimReceiptDigest,
        projection.transportReceiptDigest,
        projection.requestProjectionDigest,
        projection.responseProjectionDigest,
        projection.responseBodyDigest,
        projection.projectionDigest,
      ].every(isAgentCanonicalDigest) &&
      mutationKinds.includes(projection.mutationKind) &&
      Number.isSafeInteger(projection.mutationSequence) &&
      projection.mutationSequence >= 0 &&
      projection.mutationSequence <
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_RECEIPTS &&
      isAgentControlIdentity(projection.providerConfigurationId) &&
      isAgentControlIdentity(projection.endpointId) &&
      projection.method === 'GET' &&
      ['accepted', 'already-absent', 'created', 'deleted', 'uploaded'].includes(
        projection.observationOutcome
      ) &&
      (projection.resourceId === null ||
        isAgentControlIdentity(projection.resourceId)) &&
      [null, 'auxiliary', 'primary'].includes(projection.resourceRole) &&
      (projection.resourceManifestDigest === null ||
        isAgentCanonicalDigest(projection.resourceManifestDigest)) &&
      Number.isSafeInteger(projection.httpStatus) &&
      (deleteMutation
        ? projection.observationOutcome === 'already-absent'
          ? projection.httpStatus === 404
          : projection.observationOutcome === 'deleted' &&
            projection.httpStatus >= 200 &&
            projection.httpStatus <= 299
        : projection.httpStatus >= 200 && projection.httpStatus <= 299) &&
      (projection.providerRequestId === null ||
        isAgentControlIdentity(projection.providerRequestId)) &&
      Number.isSafeInteger(projection.responseBytes) &&
      projection.responseBytes >= 0 &&
      projection.responseBytes <= 16_777_216 &&
      isAgentControlInstant(projection.observedAt) &&
      projectionDigest === digestAgentCanonicalValue(base) &&
      safe(
        projection,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_BYTES
      )
    );
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest =
  (
    authorizationRequest: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest,
    observationProjection: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection
  ): AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest => {
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_STORE_REQUEST_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      purpose:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_STORE_PURPOSE,
      authorizationRequest,
      authorizationRequestDigest: authorizationRequest.requestDigest,
      observationProjection,
      observationProjectionDigest: observationProjection.projectionDigest,
    });
    const value = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest(
        value
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle reconciliation observation store request is invalid.'
      );
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest => {
    if (!hasExactAgentControlKeys(value, storeRequestKeys)) return false;
    const request =
      value as AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest;
    const { requestDigest, ...base } = request;
    const authorization = request.authorizationRequest;
    const projection = request.observationProjection;
    return (
      request.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_STORE_REQUEST_FORMAT &&
      request.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      request.purpose ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_STORE_PURPOSE &&
      isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest(
        authorization
      ) &&
      request.authorizationRequestDigest === authorization.requestDigest &&
      isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationProjection(
        projection
      ) &&
      request.observationProjectionDigest === projection.projectionDigest &&
      projection.dispatchIntentDigest === authorization.dispatchIntentDigest &&
      projection.dispatchStageClaimReceiptDigest ===
        authorization.dispatchStageClaimReceiptDigest &&
      projection.transportReceiptDigest ===
        authorization.transportReceiptDigest &&
      projection.mutationKind === authorization.mutationKind &&
      projection.mutationSequence === authorization.mutationSequence &&
      projection.providerConfigurationId ===
        authorization.providerConfigurationId &&
      projection.endpointId === authorization.endpointId &&
      projection.method === authorization.method &&
      Date.parse(projection.observedAt) >=
        Date.parse(authorization.requestedAt) &&
      requestDigest === digestAgentCanonicalValue(base) &&
      safe(
        request,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_BYTES *
          2
      )
    );
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest,
      'format' | 'requestDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest => {
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_REQUEST_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      ...input,
    });
    const value = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest(
        value
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle reconciliation request is invalid.'
      );
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest => {
    if (!hasExactAgentControlKeys(value, requestKeys)) return false;
    const { requestDigest, ...base } = value;
    return (
      value.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_REQUEST_FORMAT &&
      value.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      value.purpose ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_PURPOSE &&
      isAgentCanonicalDigest(value.dispatchIntentDigest) &&
      isAgentCanonicalDigest(value.dispatchStageClaimReceiptDigest) &&
      isAgentCanonicalDigest(value.transportReceiptDigest) &&
      mutationKinds.includes(
        value.mutationKind as AgentHostedRetrievalRuntimeResourceLifecycleMutationKind
      ) &&
      Number.isSafeInteger(value.mutationSequence) &&
      (value.mutationSequence as number) >= 0 &&
      (value.mutationSequence as number) <
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_RECEIPTS &&
      isAgentControlIdentity(value.providerConfigurationId) &&
      isAgentControlIdentity(value.endpointId) &&
      value.method === 'GET' &&
      isAgentControlInstant(value.requestedAt) &&
      isAgentCanonicalDigest(requestDigest) &&
      requestDigest === digestAgentCanonicalValue(base) &&
      safe(
        value,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_BYTES
      )
    );
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt =
  (
    request: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest,
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt,
      | 'dispatchIntentDigest'
      | 'dispatchStageClaimReceiptDigest'
      | 'format'
      | 'mutationKind'
      | 'mutationSequence'
      | 'receiptDigest'
      | 'request'
      | 'requestDigest'
      | 'transportReceiptDigest'
      | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest(
        request
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle reconciliation request is invalid.'
      );
    }
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_RECEIPT_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      request,
      requestDigest: request.requestDigest,
      ...input,
      dispatchIntentDigest: request.dispatchIntentDigest,
      dispatchStageClaimReceiptDigest: request.dispatchStageClaimReceiptDigest,
      transportReceiptDigest: request.transportReceiptDigest,
      mutationKind: request.mutationKind,
      mutationSequence: request.mutationSequence,
    });
    const value = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt(
        value
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle reconciliation receipt is invalid.'
      );
    }
    return value;
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptFromStoreRequest =
  (
    storeRequest: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest,
    input: Readonly<{
      observationAuthorityIssuerId: string;
      observationAuthorityImplementationDigest: CanonicalDigest;
    }>
  ): AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationStoreRequest(
        storeRequest
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle reconciliation observation store request is invalid.'
      );
    }
    const projection = storeRequest.observationProjection;
    return createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt(
      storeRequest.authorizationRequest,
      {
        ...input,
        observationOutcome: projection.observationOutcome,
        resourceId: projection.resourceId,
        resourceRole: projection.resourceRole,
        resourceManifestDigest: projection.resourceManifestDigest,
        httpStatus: projection.httpStatus,
        providerRequestId: projection.providerRequestId,
        observedAt: projection.observedAt,
      }
    );
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt => {
    if (!hasExactAgentControlKeys(value, receiptKeys)) return false;
    const receipt =
      value as AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt;
    const { receiptDigest, ...base } = receipt;
    const deleteMutation = receipt.mutationKind === 'delete-resource';
    return (
      receipt.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_RECEIPT_FORMAT &&
      receipt.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest(
        receipt.request
      ) &&
      receipt.requestDigest === receipt.request.requestDigest &&
      receipt.dispatchIntentDigest === receipt.request.dispatchIntentDigest &&
      receipt.dispatchStageClaimReceiptDigest ===
        receipt.request.dispatchStageClaimReceiptDigest &&
      receipt.transportReceiptDigest ===
        receipt.request.transportReceiptDigest &&
      receipt.mutationKind === receipt.request.mutationKind &&
      receipt.mutationSequence === receipt.request.mutationSequence &&
      isAgentControlIdentity(receipt.observationAuthorityIssuerId) &&
      isAgentCanonicalDigest(
        receipt.observationAuthorityImplementationDigest
      ) &&
      ['accepted', 'already-absent', 'created', 'deleted', 'uploaded'].includes(
        receipt.observationOutcome
      ) &&
      (receipt.resourceId === null ||
        isAgentControlIdentity(receipt.resourceId)) &&
      [null, 'auxiliary', 'primary'].includes(receipt.resourceRole) &&
      (receipt.resourceManifestDigest === null ||
        isAgentCanonicalDigest(receipt.resourceManifestDigest)) &&
      Number.isSafeInteger(receipt.httpStatus) &&
      (deleteMutation
        ? receipt.observationOutcome === 'already-absent'
          ? receipt.httpStatus === 404
          : receipt.observationOutcome === 'deleted' &&
            receipt.httpStatus >= 200 &&
            receipt.httpStatus <= 299
        : receipt.httpStatus >= 200 && receipt.httpStatus <= 299) &&
      (receipt.providerRequestId === null ||
        isAgentControlIdentity(receipt.providerRequestId)) &&
      isAgentControlInstant(receipt.observedAt) &&
      Date.parse(receipt.observedAt) >=
        Date.parse(receipt.request.requestedAt) &&
      receiptDigest === digestAgentCanonicalValue(base) &&
      safe(
        receipt,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_BYTES
      )
    );
  };

export const createAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet =
  (
    input: Omit<
      AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet,
      'format' | 'receiptDigests' | 'setDigest' | 'version'
    >
  ): AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet => {
    const receipts = Object.freeze(
      [...input.receipts].sort(
        (left, right) => left.mutationSequence - right.mutationSequence
      )
    );
    const base = Object.freeze({
      format:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_RECEIPT_SET_FORMAT,
      version: AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION,
      operation: input.operation,
      registrationRequestDigest: input.registrationRequestDigest,
      receipts,
      receiptDigests: Object.freeze(
        receipts.map(({ receiptDigest }) => receiptDigest)
      ),
    });
    const value = Object.freeze({
      ...base,
      setDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet(
        value
      )
    ) {
      throw new TypeError(
        'Hosted lifecycle reconciliation receipt set is invalid.'
      );
    }
    return value;
  };

export const isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet =
  (
    value: unknown
  ): value is AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet => {
    if (!hasExactAgentControlKeys(value, setKeys)) return false;
    const set =
      value as AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceiptSet;
    const { setDigest, ...base } = set;
    return (
      set.format ===
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_OBSERVATION_RECEIPT_SET_FORMAT &&
      set.version === AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_VERSION &&
      ['create', 'delete'].includes(set.operation) &&
      isAgentCanonicalDigest(set.registrationRequestDigest) &&
      set.receipts.length >= 1 &&
      set.receipts.length <=
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_RECEIPTS &&
      set.receipts.every(
        isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationReceipt
      ) &&
      set.receipts.every(
        ({ mutationSequence }, index) =>
          index === 0 ||
          mutationSequence > set.receipts[index - 1]!.mutationSequence
      ) &&
      new Set(set.receiptDigests).size === set.receiptDigests.length &&
      sameCanonicalJson(
        set.receiptDigests,
        set.receipts.map(({ receiptDigest }) => receiptDigest)
      ) &&
      setDigest === digestAgentCanonicalValue(base) &&
      safe(
        set,
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_RECONCILIATION_MAXIMUM_BYTES
      )
    );
  };
