import { timingSafeEqual } from 'node:crypto';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_RESPONSE_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
  createAgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope,
  type AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressResponse,
  type AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope,
} from './capabilityProbeProviderResourceCleanupClient';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESULT_INGRESS_RESPONSE_FORMAT,
  AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
  createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest,
  decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  digestAgentEvaluationCapabilityProbeProviderResourceDispatchAck,
  digestAgentEvaluationCapabilityProbeProviderResourceOwnerAdmission,
  digestAgentEvaluationCapabilityProbeProviderResourceResultIngressReceipt,
  digestAgentEvaluationCapabilityProbeProviderResourceStage,
  type AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  type AgentEvaluationCapabilityProbeProviderResourceResult,
  type AgentEvaluationCapabilityProbeProviderResourceResultIngressResponse,
} from './capabilityProbeProviderResourceClient';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import {
  digestAgentCapabilityProbeProviderResourceCleanupAuthorityDispatchAck,
  digestAgentCapabilityProbeProviderResourceCleanupAuthorityStage,
  digestAgentCapabilityProbeProviderResourceCleanupOwnerAdmission,
  digestAgentCapabilityProbeProviderResourceCleanupResultIngress,
  digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt,
  digestAgentCanonicalValue,
  isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  isAgentCapabilityProbeProviderResourceCleanupReceipt,
  isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type AgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  type AgentCapabilityProbeProviderResourceCleanupReceipt,
  type AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  assertProductionAgentEvaluationG3SandboxCanaryClean,
  type AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource,
} from './controlledWorkspaceG3CellAdapter';
import {
  decodeAgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult,
  decodeAgentEvaluationControlledWorkspaceG3AdmissionRequest,
  digestAgentEvaluationControlledWorkspaceG3AdmissionStage,
  type AgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult,
  type AgentEvaluationControlledWorkspaceG3AdmissionRequest,
} from './controlledWorkspaceG3AdmissionClient';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_OPERATION,
  AGENT_EVALUATION_CAPABILITY_PROBE_ROUTE_BINDING,
  decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult,
  decodeAgentEvaluationCapabilityProbeAdmissionRequest,
  decodeAgentEvaluationCapabilityProbeSealedObservation,
  digestAgentEvaluationCapabilityProbeAdmissionStage,
  digestAgentEvaluationCapabilityProbeDispatchAck,
  digestAgentEvaluationCapabilityProbeSealedObservation,
  type AgentEvaluationCapabilityProbeAdmissionAuthorityResult,
  type AgentEvaluationCapabilityProbeAdmissionRequest,
  type AgentEvaluationCapabilityProbeSealedObservation,
} from './capabilityProbeAdmissionClient';
import type {
  AgentEvaluationOwnerAuthorityReplayBinding,
  AgentEvaluationOwnerAuthorityReplayJournal,
  AgentEvaluationOwnerAuthorityServiceKind,
} from './productionOwnerAuthoritySidecarJournal';
import { isAgentEvaluationServiceToken } from './serviceToken';
import { containsAsciiControlCharacter } from './textSafety';
import {
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_OPERATION,
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ROUTE_BINDING,
  decodeAgentEvaluationRuntimeFactSourceOwnerHealth,
  decodeAgentEvaluationRuntimeFactSourceRegistrationAuthorityResult,
  decodeAgentEvaluationRuntimeFactSourceRegistrationRequest,
  digestAgentEvaluationRuntimeFactSourceOwnerAdmission,
  digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck,
  digestAgentEvaluationRuntimeFactSourceRegistrationStage,
  type AgentEvaluationRuntimeFactSourceOwnerHealth,
  type AgentEvaluationRuntimeFactSourceRegistrationAuthorityResult,
  type AgentEvaluationRuntimeFactSourceRegistrationOwnerPort,
  type AgentEvaluationRuntimeFactSourceRegistrationRequest,
} from './runtimeFactSourceRegistration';
import {
  createAgentEvaluationOwnerStateIdentity,
  decodeAgentEvaluationOwnerStatePrior,
  decodeAgentEvaluationOwnerStateSealedOperation,
  decodeAgentEvaluationOwnerStateTransition,
  digestAgentEvaluationOwnerStateStage,
  isAgentEvaluationOwnerStatefulOperation,
  matchAgentEvaluationVerificationEvidencePublicResponse,
  type AgentEvaluationOwnerStateBundle,
  type AgentEvaluationOwnerStateIdentityInput,
  type AgentEvaluationOwnerStateSealedOperation,
  type AgentEvaluationOwnerStateTransition,
} from './ownerState';

export const AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT =
  'prodivix.agent-evaluation-owner-authority-request' as const;
export const AGENT_EVALUATION_OWNER_AUTHORITY_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-owner-authority-response' as const;
export const AGENT_EVALUATION_OWNER_AUTHORITY_VERSION = 1 as const;
export const AGENT_EVALUATION_OWNER_AUTHORITY_HEALTH_FORMAT =
  'prodivix.agent-evaluation-owner-authority-health' as const;
export const AGENT_EVALUATION_OWNER_AUTHORITY_DURABILITY_FORMAT =
  'prodivix.agent-evaluation-owner-authority-durability' as const;
export const AGENT_EVALUATION_OWNER_AUTHORITY_SHUTDOWN_FORMAT =
  'prodivix.agent-evaluation-owner-authority-shutdown' as const;
export const AGENT_EVALUATION_OWNER_AUTHORITY_RESOURCE_RETIREMENT_FORMAT =
  'prodivix.agent-evaluation-owner-authority-resource-retirement' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_OPERATION =
  'capability-probe-resource.register' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_ROUTE_BINDING =
  'capability-probe-provider-resource-registration' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_OPERATION =
  'provider-resource.cleanup' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ROUTE_BINDING =
  'capability-probe-provider-resource-cleanup' as const;
export const AGENT_EVALUATION_CONTROLLED_WORKSPACE_DIRECT_STAGE_FORMAT =
  'prodivix.agent-evaluation-controlled-workspace-direct-stage' as const;
export const AGENT_EVALUATION_CONTROLLED_WORKSPACE_DIRECT_DISPATCH_ACK_FORMAT =
  'prodivix.agent-evaluation-controlled-workspace-direct-dispatch-ack' as const;

const maximumRequestBytes = 33_619_968;
const maximumResponseBytes = 33_554_432;
const maximumFacts = 128;
const exactCommitPattern = /^[a-f0-9]{40}$/u;
const g3CellAdmissionOperation = 'verification.cell.admit' as const;
const g3CellAdmissionRouteBinding = 'g3-cell-admission' as const;

export type AgentEvaluationOwnerAuthorityMode =
  'read' | 'stage' | 'execute' | 'reconcile';

export type AgentEvaluationOwnerAuthorityPurpose = 'preplan' | 'full-attempt';

export type AgentEvaluationOwnerAuthorityRequest = Readonly<{
  format: typeof AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT;
  version: typeof AGENT_EVALUATION_OWNER_AUTHORITY_VERSION;
  serviceKind: AgentEvaluationOwnerAuthorityServiceKind;
  mode: AgentEvaluationOwnerAuthorityMode;
  namespaceId: string;
  planDigest?: CanonicalDigest;
  repositoryCommit: string;
  operation: string;
  routeBinding: string;
  sessionId?: string;
  requestDigest: CanonicalDigest;
  attemptId?: string;
  descriptorDigest?: CanonicalDigest;
  generation?: number;
  controlledWorkspaceGrantDigest?: CanonicalDigest;
  authorityDigest?: CanonicalDigest;
  sandboxRegistrationReceiptDigest?: CanonicalDigest;
  shardLeaseOwnerId?: string;
  shardLeaseGeneration?: number;
  verificationGrantGeneration?: number;
  verificationAttemptGrantReceiptSetDigest?: CanonicalDigest;
  providerCapabilityObservationReceiptSetDigest?: CanonicalDigest;
  ownerImplementationDigest?: CanonicalDigest;
  stageDigest?: CanonicalDigest;
  dispatchAckDigest?: CanonicalDigest;
  registrationAuthorityIssuerId?: string;
  sealedOwnerHealth?: AgentEvaluationRuntimeFactSourceOwnerHealth;
  sealedProbeObservation?: AgentEvaluationCapabilityProbeSealedObservation;
  sealedProbeObservationDigest?: CanonicalDigest;
  resultIngressDigest?: CanonicalDigest;
  resultIngressReceiptDigest?: CanonicalDigest;
  sealedProviderResourceResult?: AgentEvaluationCapabilityProbeProviderResourceResult;
  sealedProviderResourceCleanupReceipt?: AgentCapabilityProbeProviderResourceCleanupReceipt;
  ownerStateRevision?: number;
  ownerStateBundle?: AgentEvaluationOwnerStateBundle | null;
  ownerStateRootDigest?: CanonicalDigest | null;
  sealedOwnerOperation?: AgentEvaluationOwnerStateSealedOperation;
  claimGeneration: number;
  payload: unknown;
}>;

type AgentEvaluationControlledWorkspaceStatelessFenceRequest = Pick<
  AgentEvaluationOwnerAuthorityRequest,
  | 'serviceKind'
  | 'operation'
  | 'routeBinding'
  | 'namespaceId'
  | 'planDigest'
  | 'repositoryCommit'
  | 'requestDigest'
>;

export const createAgentEvaluationControlledWorkspaceDirectStageDigest = (
  request: AgentEvaluationControlledWorkspaceStatelessFenceRequest,
  ownerImplementationDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_DIRECT_STAGE_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    operation: request.operation,
    routeBinding: request.routeBinding,
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
  });

export const createAgentEvaluationControlledWorkspaceDirectDispatchAckDigest = (
  request: AgentEvaluationControlledWorkspaceStatelessFenceRequest,
  facts: readonly unknown[],
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_DIRECT_DISPATCH_ACK_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    operation: request.operation,
    routeBinding: request.routeBinding,
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
    stageDigest,
    responseDigest: digestAgentCanonicalValue(facts),
  });

export type AgentEvaluationOwnerAuthorityDurability = Readonly<{
  format: typeof AGENT_EVALUATION_OWNER_AUTHORITY_DURABILITY_FORMAT;
  version: typeof AGENT_EVALUATION_OWNER_AUTHORITY_VERSION;
  requestDigestKeyedExecute: true;
  ownerStagingBeforeDispatch: true;
  reconcileDispatched: true;
  payloadPersistence: 'forbidden';
  secretResponsePersistence: 'forbidden';
}>;

type AgentEvaluationOwnerAuthorityBasePort = Readonly<{
  authorityId: string;
  implementationDigest: CanonicalDigest;
  durability: AgentEvaluationOwnerAuthorityDurability;
  stage(
    request: AgentEvaluationOwnerAuthorityRequest
  ): Promise<CanonicalDigest>;
}>;

export type AgentEvaluationControlledWorkspaceOwnerAuthorityPort =
  AgentEvaluationOwnerAuthorityBasePort &
    Readonly<{
      read(
        request: AgentEvaluationOwnerAuthorityRequest
      ): Promise<readonly unknown[]>;
      execute(
        request: AgentEvaluationOwnerAuthorityRequest
      ): Promise<readonly unknown[] | AgentEvaluationOwnerStateTransition>;
      reconcile(
        request: AgentEvaluationOwnerAuthorityRequest
      ): Promise<Readonly<{ facts: readonly unknown[]; reconciled: boolean }>>;
    }>;

export type AgentEvaluationVerificationEvidenceOwnerStateExecution = Readonly<{
  transition: AgentEvaluationOwnerStateTransition;
  response: unknown;
}>;

export type AgentEvaluationVerificationEvidenceOwnerAuthorityPort =
  AgentEvaluationOwnerAuthorityBasePort &
    Readonly<{
      read(request: AgentEvaluationOwnerAuthorityRequest): Promise<unknown>;
      execute(request: AgentEvaluationOwnerAuthorityRequest): Promise<unknown>;
      reconcile(
        request: AgentEvaluationOwnerAuthorityRequest
      ): Promise<Readonly<{ response: unknown; reconciled: boolean }>>;
    }>;

export type AgentEvaluationAttemptOwnerAuthorityPort =
  AgentEvaluationOwnerAuthorityBasePort &
    Readonly<{
      execute(request: AgentEvaluationOwnerAuthorityRequest): Promise<unknown>;
      reconcile(
        request: AgentEvaluationOwnerAuthorityRequest
      ): Promise<Readonly<{ response: unknown; reconciled: boolean }>>;
    }>;

export type AgentEvaluationCapabilityProbeOwnerPort = Readonly<{
  authorityId: string;
  implementationDigest: CanonicalDigest;
  execute(input: {
    request: AgentEvaluationCapabilityProbeAdmissionRequest;
    stageDigest: CanonicalDigest;
  }): Promise<AgentEvaluationCapabilityProbeAdmissionAuthorityResult>;
}>;

export type AgentEvaluationCapabilityProbeProviderResourceOwnerPort = Readonly<{
  authorityId: string;
  implementationDigest: CanonicalDigest;
  execute(input: {
    request: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest;
    stageDigest: CanonicalDigest;
  }): Promise<AgentEvaluationCapabilityProbeProviderResourceResult>;
}>;

export type AgentEvaluationCapabilityProbeProviderResourceResultIngressPort =
  Readonly<{
    seal(input: {
      request: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest;
      resourceResult: AgentEvaluationCapabilityProbeProviderResourceResult;
      ownerImplementationDigest: CanonicalDigest;
      stageDigest: CanonicalDigest;
    }): Promise<AgentEvaluationCapabilityProbeProviderResourceResultIngressResponse>;
  }>;

export type AgentEvaluationCapabilityProbeProviderResourceCleanupOwnerPort =
  Readonly<{
    authorityId: string;
    implementationDigest: CanonicalDigest;
    execute(input: {
      cleanupRequest: AgentCapabilityProbeProviderResourceCleanupAuthorityRequest;
      deletionAuthorityReceipt: AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt;
    }): Promise<AgentCapabilityProbeProviderResourceCleanupReceipt>;
  }>;

export type AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressPort =
  Readonly<{
    seal(
      request: AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope
    ): Promise<AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressResponse>;
  }>;

export type AgentEvaluationProductionPreplanOwnerAuthorityPorts = Readonly<{
  purpose: 'preplan';
  capabilityProbe: AgentEvaluationCapabilityProbeOwnerPort;
  capabilityProbeProviderResource: AgentEvaluationCapabilityProbeProviderResourceOwnerPort;
  capabilityProbeProviderResourceCleanup: AgentEvaluationCapabilityProbeProviderResourceCleanupOwnerPort;
  runtimeFactSourceRegistration: AgentEvaluationRuntimeFactSourceRegistrationOwnerPort;
  controlledWorkspace?: never;
  verificationEvidence?: never;
  providerCapability?: never;
  attemptGrading?: never;
  close(): Promise<AgentEvaluationOwnerAuthorityResourceRetirementReceipt>;
}>;

export type AgentEvaluationProductionFullAttemptOwnerAuthorityPorts = Readonly<{
  purpose: 'full-attempt';
  controlledWorkspace: AgentEvaluationControlledWorkspaceOwnerAuthorityPort;
  verificationEvidence: AgentEvaluationVerificationEvidenceOwnerAuthorityPort;
  providerCapability: AgentEvaluationAttemptOwnerAuthorityPort;
  attemptGrading: AgentEvaluationAttemptOwnerAuthorityPort;
  capabilityProbe?: never;
  capabilityProbeProviderResource?: never;
  capabilityProbeProviderResourceCleanup?: never;
  runtimeFactSourceRegistration?: never;
  close(): Promise<AgentEvaluationOwnerAuthorityResourceRetirementReceipt>;
}>;

export type AgentEvaluationProductionOwnerAuthorityPorts =
  | AgentEvaluationProductionPreplanOwnerAuthorityPorts
  | AgentEvaluationProductionFullAttemptOwnerAuthorityPorts;

export type AgentEvaluationAttemptAuthorityResultIngressPort = Readonly<{
  seal(
    input: Readonly<{
      request: AgentEvaluationOwnerAuthorityRequest;
      response: unknown;
      ownerImplementationDigest: CanonicalDigest;
    }>
  ): Promise<
    Readonly<{
      requestDigest: CanonicalDigest;
      responseDigest: CanonicalDigest;
      dispatchAckDigest: CanonicalDigest;
      resultIngressReceiptDigest: CanonicalDigest;
      replayed: boolean;
    }>
  >;
}>;

type AgentEvaluationOwnerAuthorityImplementationDigests =
  | Readonly<{
      controlledWorkspace: CanonicalDigest;
      verificationEvidence: CanonicalDigest;
      providerCapability: CanonicalDigest;
      attemptGrading: CanonicalDigest;
    }>
  | Readonly<{
      capabilityProbe: CanonicalDigest;
      capabilityProbeProviderResource: CanonicalDigest;
      capabilityProbeProviderResourceCleanup: CanonicalDigest;
      runtimeFactSourceRegistration: CanonicalDigest;
    }>;

type AgentEvaluationOwnerAuthorityResidualResourceIds =
  | Readonly<{
      controlledWorkspace: readonly [];
      verificationEvidence: readonly [];
      providerCapability: readonly [];
      attemptGrading: readonly [];
    }>
  | Readonly<{
      capabilityProbe: readonly [];
      capabilityProbeProviderResource: readonly [];
      capabilityProbeProviderResourceCleanup: readonly [];
      runtimeFactSourceRegistration: readonly [];
    }>;

export type AgentEvaluationOwnerAuthorityResourceRetirementReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_OWNER_AUTHORITY_RESOURCE_RETIREMENT_FORMAT;
  version: typeof AGENT_EVALUATION_OWNER_AUTHORITY_VERSION;
  status: 'clean';
  authorityImplementationDigests: AgentEvaluationOwnerAuthorityImplementationDigests;
  residualResourceIds: AgentEvaluationOwnerAuthorityResidualResourceIds;
  residualCanaryIds: readonly [];
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationOwnerAuthorityShutdownReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_OWNER_AUTHORITY_SHUTDOWN_FORMAT;
  version: typeof AGENT_EVALUATION_OWNER_AUTHORITY_VERSION;
  status: 'clean';
  authorityImplementationDigests: AgentEvaluationOwnerAuthorityImplementationDigests;
  replayJournalImplementationDigest: CanonicalDigest;
  startupHealthDigest: CanonicalDigest;
  resourceRetirementReceiptDigest: CanonicalDigest;
  residualResourceIds: AgentEvaluationOwnerAuthorityResidualResourceIds;
  residualCanaryIds: readonly [];
  receiptDigest: CanonicalDigest;
}>;

type CreateProductionAgentEvaluationOwnerAuthoritySidecarCommonInput =
  Readonly<{
    serviceToken: string;
    journal: AgentEvaluationOwnerAuthorityReplayJournal;
    forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
  }>;

export type CreateProductionAgentEvaluationOwnerAuthoritySidecarInput =
  CreateProductionAgentEvaluationOwnerAuthoritySidecarCommonInput &
    (
      | Readonly<{
          authorities: AgentEvaluationProductionPreplanOwnerAuthorityPorts;
          attemptAuthorityResultIngress?: never;
          capabilityProbeProviderResourceResultIngress?: AgentEvaluationCapabilityProbeProviderResourceResultIngressPort;
          capabilityProbeProviderResourceCleanupResultIngress?: AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressPort;
        }>
      | Readonly<{
          authorities: AgentEvaluationProductionFullAttemptOwnerAuthorityPorts;
          attemptAuthorityResultIngress?: AgentEvaluationAttemptAuthorityResultIngressPort;
          capabilityProbeProviderResourceResultIngress?: never;
          capabilityProbeProviderResourceCleanupResultIngress?: never;
        }>
    );

export type AgentEvaluationProductionOwnerAuthoritySidecar = Readonly<{
  health:
    | Readonly<{
        format: typeof AGENT_EVALUATION_OWNER_AUTHORITY_HEALTH_FORMAT;
        version: typeof AGENT_EVALUATION_OWNER_AUTHORITY_VERSION;
        purpose: 'preplan';
        status: 'ready';
        capabilityProbeAuthorityDigest: CanonicalDigest;
        capabilityProbeProviderResourceAuthorityDigest: CanonicalDigest;
        capabilityProbeProviderResourceCleanupAuthorityDigest: CanonicalDigest;
        runtimeFactSourceRegistrationAuthorityDigest: CanonicalDigest;
        replayJournalImplementationDigest: CanonicalDigest;
        healthDigest: CanonicalDigest;
      }>
    | Readonly<{
        format: typeof AGENT_EVALUATION_OWNER_AUTHORITY_HEALTH_FORMAT;
        version: typeof AGENT_EVALUATION_OWNER_AUTHORITY_VERSION;
        purpose: 'full-attempt';
        status: 'ready';
        controlledWorkspaceAuthorityDigest: CanonicalDigest;
        verificationEvidenceAuthorityDigest: CanonicalDigest;
        providerCapabilityAuthorityDigest: CanonicalDigest;
        attemptGradingAuthorityDigest: CanonicalDigest;
        replayJournalImplementationDigest: CanonicalDigest;
        healthDigest: CanonicalDigest;
      }>;
  listen(input: { host: '127.0.0.1' | '::1'; port: number }): Promise<
    Readonly<{
      baseUrl: string;
      close(): Promise<AgentEvaluationOwnerAuthorityShutdownReceipt>;
    }>
  >;
}>;

const fail = (message: string): never => {
  throw new TypeError(`G4_OWNER_AUTHORITY_SIDECAR_UNAVAILABLE: ${message}`);
};

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) =>
      !isUnsafeObjectKey(key) &&
      (required.includes(key) || optional.includes(key))
  );

const exactDurability = (
  value: unknown
): value is AgentEvaluationOwnerAuthorityDurability =>
  exactRecord(value, [
    'format',
    'version',
    'requestDigestKeyedExecute',
    'ownerStagingBeforeDispatch',
    'reconcileDispatched',
    'payloadPersistence',
    'secretResponsePersistence',
  ]) &&
  value.format === AGENT_EVALUATION_OWNER_AUTHORITY_DURABILITY_FORMAT &&
  value.version === AGENT_EVALUATION_OWNER_AUTHORITY_VERSION &&
  value.requestDigestKeyedExecute === true &&
  value.ownerStagingBeforeDispatch === true &&
  value.reconcileDispatched === true &&
  value.payloadPersistence === 'forbidden' &&
  value.secretResponsePersistence === 'forbidden';

type AgentEvaluationOwnerAuthorityIdentityPorts =
  | Omit<AgentEvaluationProductionPreplanOwnerAuthorityPorts, 'close'>
  | Omit<AgentEvaluationProductionFullAttemptOwnerAuthorityPorts, 'close'>;

export const createAgentEvaluationOwnerAuthorityResourceRetirementReceipt = (
  authorities: AgentEvaluationOwnerAuthorityIdentityPorts
): AgentEvaluationOwnerAuthorityResourceRetirementReceipt => {
  const authorityImplementationDigests =
    authorities.purpose === 'preplan'
      ? Object.freeze({
          capabilityProbe: authorities.capabilityProbe.implementationDigest,
          capabilityProbeProviderResource:
            authorities.capabilityProbeProviderResource.implementationDigest,
          capabilityProbeProviderResourceCleanup:
            authorities.capabilityProbeProviderResourceCleanup
              .implementationDigest,
          runtimeFactSourceRegistration:
            authorities.runtimeFactSourceRegistration.implementationDigest,
        })
      : Object.freeze({
          controlledWorkspace:
            authorities.controlledWorkspace.implementationDigest,
          verificationEvidence:
            authorities.verificationEvidence.implementationDigest,
          providerCapability:
            authorities.providerCapability.implementationDigest,
          attemptGrading: authorities.attemptGrading.implementationDigest,
        });
  const residualResourceIds =
    authorities.purpose === 'preplan'
      ? Object.freeze({
          capabilityProbe: Object.freeze([]) as readonly [],
          capabilityProbeProviderResource: Object.freeze([]) as readonly [],
          capabilityProbeProviderResourceCleanup: Object.freeze(
            []
          ) as readonly [],
          runtimeFactSourceRegistration: Object.freeze([]) as readonly [],
        })
      : Object.freeze({
          controlledWorkspace: Object.freeze([]) as readonly [],
          verificationEvidence: Object.freeze([]) as readonly [],
          providerCapability: Object.freeze([]) as readonly [],
          attemptGrading: Object.freeze([]) as readonly [],
        });
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_RESOURCE_RETIREMENT_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    status: 'clean' as const,
    authorityImplementationDigests,
    residualResourceIds,
    residualCanaryIds: Object.freeze([]) as readonly [],
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

const assertResourceRetirementReceipt = (
  value: AgentEvaluationOwnerAuthorityResourceRetirementReceipt,
  authorities: AgentEvaluationProductionOwnerAuthorityPorts
): AgentEvaluationOwnerAuthorityResourceRetirementReceipt => {
  const expected =
    createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(authorities);
  if (!sameCanonicalJson(value, expected)) {
    return fail('Owner authority retirement left residuals or drifted.');
  }
  return expected;
};

const createAgentEvaluationOwnerAuthorityShutdownReceipt = (
  health: AgentEvaluationProductionOwnerAuthoritySidecar['health'],
  retirement: AgentEvaluationOwnerAuthorityResourceRetirementReceipt
): AgentEvaluationOwnerAuthorityShutdownReceipt => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_SHUTDOWN_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    status: 'clean' as const,
    authorityImplementationDigests: retirement.authorityImplementationDigests,
    replayJournalImplementationDigest: health.replayJournalImplementationDigest,
    startupHealthDigest: health.healthDigest,
    resourceRetirementReceiptDigest: retirement.receiptDigest,
    residualResourceIds: retirement.residualResourceIds,
    residualCanaryIds: retirement.residualCanaryIds,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentEvaluationOwnerAuthorityDurability =
  (): AgentEvaluationOwnerAuthorityDurability =>
    Object.freeze({
      format: AGENT_EVALUATION_OWNER_AUTHORITY_DURABILITY_FORMAT,
      version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
      requestDigestKeyedExecute: true,
      ownerStagingBeforeDispatch: true,
      reconcileDispatched: true,
      payloadPersistence: 'forbidden',
      secretResponsePersistence: 'forbidden',
    });

const assertAuthorityPort = (
  value:
    | AgentEvaluationControlledWorkspaceOwnerAuthorityPort
    | AgentEvaluationVerificationEvidenceOwnerAuthorityPort
    | AgentEvaluationAttemptOwnerAuthorityPort
) => {
  if (
    !isAgentControlIdentity(value?.authorityId) ||
    !isAgentCanonicalDigest(value?.implementationDigest) ||
    !exactDurability(value?.durability) ||
    typeof value.stage !== 'function' ||
    typeof value.execute !== 'function' ||
    typeof value.reconcile !== 'function'
  ) {
    return fail('Concrete owner authority port is invalid.');
  }
};

const assertCapabilityProbeOwnerPort = (
  value: AgentEvaluationCapabilityProbeOwnerPort
): void => {
  if (
    !isAgentControlIdentity(value?.authorityId) ||
    !isAgentCanonicalDigest(value?.implementationDigest) ||
    typeof value.execute !== 'function'
  ) {
    return fail('Capability probe owner authority is unavailable.');
  }
};

const assertCapabilityProbeProviderResourceOwnerPort = (
  value: AgentEvaluationCapabilityProbeProviderResourceOwnerPort
): void => {
  if (
    !isAgentControlIdentity(value?.authorityId) ||
    !isAgentCanonicalDigest(value?.implementationDigest) ||
    typeof value.execute !== 'function'
  ) {
    return fail(
      'Capability probe provider resource owner authority is unavailable.'
    );
  }
};

const assertCapabilityProbeProviderResourceCleanupOwnerPort = (
  value: AgentEvaluationCapabilityProbeProviderResourceCleanupOwnerPort
): void => {
  if (
    !isAgentControlIdentity(value?.authorityId) ||
    !isAgentCanonicalDigest(value?.implementationDigest) ||
    typeof value.execute !== 'function'
  ) {
    return fail(
      'Capability probe provider resource cleanup owner authority is unavailable.'
    );
  }
};

const assertRuntimeFactSourceRegistrationOwnerPort = (
  value: AgentEvaluationRuntimeFactSourceRegistrationOwnerPort
): void => {
  if (
    !isAgentControlIdentity(value?.authorityId) ||
    !isAgentCanonicalDigest(value?.implementationDigest) ||
    typeof value.execute !== 'function' ||
    typeof value.reconcile !== 'function'
  ) {
    return fail('Runtime fact source registration owner is unavailable.');
  }
};

const safeText = (value: unknown, maximum = 512): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= maximum &&
  value === value.trim() &&
  !containsAsciiControlCharacter(value);

const parseJson = (source: Uint8Array): unknown => {
  let text = '';
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(source);
    const value = JSON.parse(text, (key, entry: unknown) => {
      if (key && isUnsafeObjectKey(key)) return fail('Unsafe request key.');
      return entry;
    }) as unknown;
    if (canonicalJsonText(value) !== text) {
      return fail('Request body is not canonical JSON.');
    }
    return value;
  } catch (caught) {
    if (
      caught instanceof TypeError &&
      caught.message.startsWith('G4_OWNER_AUTHORITY_SIDECAR_UNAVAILABLE:')
    ) {
      throw caught;
    }
    return fail('Request body is not decodable.');
  } finally {
    text = '';
  }
};

const commonRequestKeys = Object.freeze([
  'format',
  'version',
  'serviceKind',
  'mode',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'operation',
  'routeBinding',
  'requestDigest',
  'claimGeneration',
  'payload',
]);
const controlledWorkspaceStatelessRequestKeys = Object.freeze([
  ...commonRequestKeys,
  'ownerImplementationDigest',
]);
const capabilityProbeRequestKeys = Object.freeze([
  'format',
  'version',
  'serviceKind',
  'mode',
  'namespaceId',
  'repositoryCommit',
  'operation',
  'routeBinding',
  'requestDigest',
  'ownerImplementationDigest',
  'claimGeneration',
  'payload',
]);
const capabilityProbeProviderResourceRequestKeys = Object.freeze([
  'format',
  'version',
  'serviceKind',
  'mode',
  'namespaceId',
  'repositoryCommit',
  'operation',
  'routeBinding',
  'requestDigest',
  'ownerImplementationDigest',
  'claimGeneration',
  'payload',
]);
const capabilityProbeProviderResourceCleanupRequestKeys = Object.freeze([
  'format',
  'version',
  'serviceKind',
  'mode',
  'namespaceId',
  'repositoryCommit',
  'operation',
  'routeBinding',
  'requestDigest',
  'ownerImplementationDigest',
  'claimGeneration',
  'payload',
]);
const runtimeFactSourceRegistrationRequestKeys = Object.freeze([
  'format',
  'version',
  'serviceKind',
  'mode',
  'namespaceId',
  'repositoryCommit',
  'operation',
  'routeBinding',
  'requestDigest',
  'ownerImplementationDigest',
  'registrationAuthorityIssuerId',
  'claimGeneration',
  'payload',
]);
const verificationRequestKeys = Object.freeze([
  ...commonRequestKeys,
  'attemptId',
  'descriptorDigest',
  'generation',
  'controlledWorkspaceGrantDigest',
  'authorityDigest',
  'sandboxRegistrationReceiptDigest',
]);
const ownerStateRequestKeys = Object.freeze([
  'ownerImplementationDigest',
  'ownerStateRevision',
  'ownerStateBundle',
  'ownerStateRootDigest',
]);
const controlledOwnerStateRequestKeys = Object.freeze([
  ...commonRequestKeys,
  'attemptId',
  'descriptorDigest',
  'generation',
  'controlledWorkspaceGrantDigest',
  ...ownerStateRequestKeys,
]);
const verificationOwnerStateRequestKeys = Object.freeze([
  ...verificationRequestKeys,
  ...ownerStateRequestKeys,
]);
const attemptAuthorityRequestKeys = Object.freeze([
  ...commonRequestKeys,
  'attemptId',
  'descriptorDigest',
  'shardLeaseOwnerId',
  'shardLeaseGeneration',
  'verificationGrantGeneration',
  'verificationAttemptGrantReceiptSetDigest',
  'providerCapabilityObservationReceiptSetDigest',
  'ownerImplementationDigest',
]);
const g3CellAdmissionRequestKeys = Object.freeze([
  ...commonRequestKeys,
  'attemptId',
  'descriptorDigest',
  'generation',
  'ownerImplementationDigest',
]);

const isG3CellAdmissionRequest = (
  request: Pick<
    AgentEvaluationOwnerAuthorityRequest,
    'serviceKind' | 'operation' | 'routeBinding'
  >
): boolean =>
  request.serviceKind === 'controlled-workspace' &&
  request.operation === g3CellAdmissionOperation &&
  request.routeBinding === g3CellAdmissionRouteBinding;

const isControlledWorkspaceStatelessRequest = (
  request: Pick<
    AgentEvaluationOwnerAuthorityRequest,
    'serviceKind' | 'operation' | 'routeBinding'
  >
): boolean =>
  request.serviceKind === 'controlled-workspace' &&
  !isG3CellAdmissionRequest(request) &&
  !isAgentEvaluationOwnerStatefulOperation(
    request.serviceKind,
    request.operation,
    request.routeBinding
  );

const isCapabilityProbeAdmissionRequest = (
  request: Pick<
    AgentEvaluationOwnerAuthorityRequest,
    'serviceKind' | 'operation' | 'routeBinding'
  >
): boolean =>
  request.serviceKind === 'provider-capability' &&
  request.operation === AGENT_EVALUATION_CAPABILITY_PROBE_OPERATION &&
  request.routeBinding === AGENT_EVALUATION_CAPABILITY_PROBE_ROUTE_BINDING;

const isCapabilityProbeProviderResourceRequest = (
  request: Pick<
    AgentEvaluationOwnerAuthorityRequest,
    'serviceKind' | 'operation' | 'routeBinding'
  >
): boolean =>
  request.serviceKind === 'provider-capability' &&
  request.operation ===
    AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_OPERATION &&
  request.routeBinding ===
    AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_ROUTE_BINDING;

const isCapabilityProbeProviderResourceCleanupRequest = (
  request: Pick<
    AgentEvaluationOwnerAuthorityRequest,
    'serviceKind' | 'operation' | 'routeBinding'
  >
): boolean =>
  request.serviceKind === 'provider-capability' &&
  request.operation ===
    AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_OPERATION &&
  request.routeBinding ===
    AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ROUTE_BINDING;

const isRuntimeFactSourceRegistrationRequest = (
  request: Pick<
    AgentEvaluationOwnerAuthorityRequest,
    'serviceKind' | 'operation' | 'routeBinding'
  >
): boolean =>
  request.serviceKind === 'provider-capability' &&
  request.operation ===
    AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_OPERATION &&
  request.routeBinding ===
    AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ROUTE_BINDING;

const isOwnerStateRequest = (
  request: Pick<
    AgentEvaluationOwnerAuthorityRequest,
    'serviceKind' | 'operation' | 'routeBinding'
  >
): boolean =>
  isAgentEvaluationOwnerStatefulOperation(
    request.serviceKind,
    request.operation,
    request.routeBinding
  );

const g3CellAdmissionPayload = (
  request: AgentEvaluationOwnerAuthorityRequest
): AgentEvaluationControlledWorkspaceG3AdmissionRequest => {
  let payload: AgentEvaluationControlledWorkspaceG3AdmissionRequest;
  try {
    payload = decodeAgentEvaluationControlledWorkspaceG3AdmissionRequest(
      request.payload
    );
  } catch {
    return fail('G3 cell admission payload is invalid.');
  }
  if (
    request.namespaceId !== payload.namespaceId ||
    request.planDigest !== payload.evaluationPlanDigest ||
    request.repositoryCommit !== payload.repositoryCommit ||
    request.attemptId !== payload.attemptId ||
    request.descriptorDigest !== payload.descriptorDigest ||
    request.generation !== payload.generation ||
    request.requestDigest !== payload.requestDigest
  ) {
    return fail('G3 cell admission payload binding drifted.');
  }
  return payload;
};

const capabilityProbeAdmissionPayload = (
  request: AgentEvaluationOwnerAuthorityRequest
): AgentEvaluationCapabilityProbeAdmissionRequest => {
  let payload: AgentEvaluationCapabilityProbeAdmissionRequest;
  try {
    payload = decodeAgentEvaluationCapabilityProbeAdmissionRequest(
      request.payload
    );
  } catch {
    return fail('Capability probe admission payload is invalid.');
  }
  if (
    request.namespaceId !== payload.namespaceId ||
    request.repositoryCommit !== payload.repositoryCommit ||
    request.requestDigest !== payload.requestDigest
  ) {
    return fail('Capability probe admission payload binding drifted.');
  }
  return payload;
};

const capabilityProbeProviderResourcePayload = (
  request: AgentEvaluationOwnerAuthorityRequest
): AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest => {
  let payload: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest;
  try {
    payload =
      decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest(
        request.payload
      );
  } catch {
    return fail('Capability probe provider resource payload is invalid.');
  }
  if (
    request.namespaceId !== payload.namespaceId ||
    request.repositoryCommit !== payload.repositoryCommit ||
    request.requestDigest !== payload.requestDigest
  ) {
    return fail('Capability probe provider resource payload binding drifted.');
  }
  return payload;
};

const capabilityProbeProviderResourceCleanupPayload = (
  request: AgentEvaluationOwnerAuthorityRequest
): Readonly<{
  cleanupRequest: AgentCapabilityProbeProviderResourceCleanupAuthorityRequest;
  deletionAuthorityReceipt: AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt;
}> => {
  if (
    !exactRecord(request.payload, [
      'cleanupRequest',
      'deletionAuthorityReceipt',
    ]) ||
    !isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest(
      request.payload.cleanupRequest
    ) ||
    !isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(
      request.payload.deletionAuthorityReceipt
    )
  ) {
    return fail(
      'Capability probe provider resource cleanup payload is invalid.'
    );
  }
  const cleanupRequest = request.payload.cleanupRequest;
  const deletionAuthorityReceipt = request.payload.deletionAuthorityReceipt;
  if (
    request.repositoryCommit !== cleanupRequest.repositoryCommit ||
    request.requestDigest !== cleanupRequest.cleanupRequestDigest ||
    cleanupRequest.resourceRegistrationRequestDigest !==
      deletionAuthorityReceipt.requestDigest ||
    cleanupRequest.deletionAuthorityReceiptDigest !==
      deletionAuthorityReceipt.deletionAuthorityReceiptDigest
  ) {
    return fail(
      'Capability probe provider resource cleanup payload binding drifted.'
    );
  }
  return Object.freeze({ cleanupRequest, deletionAuthorityReceipt });
};

const matchesCapabilityProbeProviderResourceCleanupReceipt = (
  cleanupReceipt: unknown,
  payload: ReturnType<typeof capabilityProbeProviderResourceCleanupPayload>
): cleanupReceipt is AgentCapabilityProbeProviderResourceCleanupReceipt =>
  isAgentCapabilityProbeProviderResourceCleanupReceipt(cleanupReceipt) &&
  cleanupReceipt.requestDigest ===
    payload.cleanupRequest.resourceRegistrationRequestDigest &&
  cleanupReceipt.deletionAuthorityReceiptDigest ===
    payload.cleanupRequest.deletionAuthorityReceiptDigest &&
  cleanupReceipt.deletionRequestProjectionDigest ===
    payload.deletionAuthorityReceipt.deletionRequestProjectionDigest &&
  cleanupReceipt.protocolFamily ===
    payload.deletionAuthorityReceipt.deletionRequestProjection.protocolFamily &&
  cleanupReceipt.providerResourceKind ===
    payload.deletionAuthorityReceipt.providerResourceKind &&
  cleanupReceipt.providerResourceId ===
    payload.deletionAuthorityReceipt.providerResourceId &&
  sameCanonicalJson(
    cleanupReceipt.auxiliaryResourceIds,
    payload.deletionAuthorityReceipt.deletionRequestProjection
      .auxiliaryResourceIds
  );

const runtimeFactSourceRegistrationPayload = (
  request: AgentEvaluationOwnerAuthorityRequest
): AgentEvaluationRuntimeFactSourceRegistrationRequest => {
  let payload: AgentEvaluationRuntimeFactSourceRegistrationRequest;
  try {
    payload = decodeAgentEvaluationRuntimeFactSourceRegistrationRequest(
      request.payload
    );
  } catch {
    return fail('Runtime fact source registration payload is invalid.');
  }
  if (
    request.namespaceId !== payload.namespaceId ||
    request.repositoryCommit !== payload.repositoryCommit ||
    request.requestDigest !== payload.requestDigest
  ) {
    return fail('Runtime fact source registration payload binding drifted.');
  }
  return payload;
};

const ownerStateIdentityInput = (
  request: AgentEvaluationOwnerAuthorityRequest
): AgentEvaluationOwnerStateIdentityInput => {
  if (
    (request.serviceKind !== 'controlled-workspace' &&
      request.serviceKind !== 'verification-evidence') ||
    !isAgentControlIdentity(request.attemptId) ||
    !isAgentCanonicalDigest(request.planDigest) ||
    !isAgentCanonicalDigest(request.descriptorDigest) ||
    !Number.isSafeInteger(request.generation) ||
    request.generation! < 1
  ) {
    return fail('Owner state identity is invalid.');
  }
  const grantOrAuthorityDigest =
    request.serviceKind === 'controlled-workspace'
      ? request.controlledWorkspaceGrantDigest
      : request.authorityDigest;
  if (!isAgentCanonicalDigest(grantOrAuthorityDigest)) {
    return fail('Owner state authority binding is invalid.');
  }
  return Object.freeze({
    serviceKind: request.serviceKind,
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    attemptId: request.attemptId,
    descriptorDigest: request.descriptorDigest,
    generation: request.generation!,
    grantOrAuthorityDigest,
  });
};

const ownerStatePriorForRequest = (
  request: AgentEvaluationOwnerAuthorityRequest
) =>
  decodeAgentEvaluationOwnerStatePrior(
    {
      revision: request.ownerStateRevision,
      bundle: request.ownerStateBundle,
      rootDigest: request.ownerStateRootDigest,
    },
    ownerStateIdentityInput(request)
  );

const statefulTransitionFromSealedRequest = (
  request: AgentEvaluationOwnerAuthorityRequest
): AgentEvaluationOwnerStateTransition => {
  const identity = ownerStateIdentityInput(request);
  const ownerStateId = createAgentEvaluationOwnerStateIdentity(identity);
  const sealed = decodeAgentEvaluationOwnerStateSealedOperation(
    request.sealedOwnerOperation,
    {
      serviceKind: identity.serviceKind,
      operation: request.operation,
      routeBinding: request.routeBinding,
      requestDigest: request.requestDigest,
      ownerImplementationDigest:
        request.ownerImplementationDigest ??
        fail('Owner state implementation is missing.'),
      ownerStateId,
    }
  );
  if (
    request.ownerStateRevision !== sealed.ownerStateRevision ||
    request.ownerStateRootDigest !== sealed.ownerStateRootDigest ||
    request.stageDigest !== sealed.stageDigest ||
    request.dispatchAckDigest !== sealed.dispatchAckDigest
  ) {
    return fail('Sealed owner state request binding drifted.');
  }
  return decodeAgentEvaluationOwnerStateTransition(
    Object.freeze({
      ...sealed,
      ownerStateBundle: request.ownerStateBundle,
    }),
    {
      ...identity,
      operation: request.operation,
      routeBinding: request.routeBinding,
      requestDigest: request.requestDigest,
      ownerImplementationDigest: sealed.ownerImplementationDigest,
      priorOwnerStateRevision: sealed.priorOwnerStateRevision,
      priorOwnerStateRootDigest: sealed.priorOwnerStateRootDigest,
    }
  );
};

const assertOwnerStateRequest = (
  request: AgentEvaluationOwnerAuthorityRequest
): void => {
  const identity = ownerStateIdentityInput(request);
  const ownerStateId = createAgentEvaluationOwnerStateIdentity(identity);
  if (
    request.mode === 'read' ||
    !isAgentCanonicalDigest(request.ownerImplementationDigest) ||
    (request.serviceKind === 'controlled-workspace' &&
      (request.operation === 'session.load-or-reattach'
        ? request.sessionId !== undefined
        : !isAgentControlIdentity(request.sessionId))) ||
    (request.serviceKind === 'verification-evidence' &&
      request.sessionId !== undefined)
  ) {
    return fail('Owner state request identity is invalid.');
  }
  if (request.mode === 'stage' || request.mode === 'execute') {
    const prior = ownerStatePriorForRequest(request);
    const expectedStageDigest = digestAgentEvaluationOwnerStateStage({
      serviceKind: identity.serviceKind,
      operation: request.operation,
      routeBinding: request.routeBinding,
      requestDigest: request.requestDigest,
      ownerImplementationDigest: request.ownerImplementationDigest,
      ownerStateId,
      priorOwnerStateRevision: prior.revision,
      priorOwnerStateRootDigest: prior.rootDigest,
    });
    if (
      (request.mode === 'stage' &&
        (request.stageDigest !== undefined ||
          request.dispatchAckDigest !== undefined ||
          request.sealedOwnerOperation !== undefined)) ||
      (request.mode === 'execute' &&
        (request.stageDigest !== expectedStageDigest ||
          request.dispatchAckDigest !== undefined ||
          request.sealedOwnerOperation !== undefined))
    ) {
      return fail('Owner state stage binding drifted.');
    }
    return;
  }
  if (
    !isAgentCanonicalDigest(request.stageDigest) ||
    !isAgentCanonicalDigest(request.dispatchAckDigest) ||
    request.sealedOwnerOperation === undefined ||
    !Number.isSafeInteger(request.ownerStateRevision) ||
    request.ownerStateRevision! < 1 ||
    !isAgentCanonicalDigest(request.ownerStateRootDigest) ||
    request.ownerStateBundle === null ||
    request.ownerStateBundle === undefined
  ) {
    return fail('Owner state reconcile binding is invalid.');
  }
  statefulTransitionFromSealedRequest(request);
};

const assertRequest = (
  value: unknown,
  expected: Readonly<{
    serviceKind: AgentEvaluationOwnerAuthorityServiceKind;
    mode: AgentEvaluationOwnerAuthorityMode;
  }>
): AgentEvaluationOwnerAuthorityRequest => {
  const controlled = expected.serviceKind === 'controlled-workspace';
  const verification = expected.serviceKind === 'verification-evidence';
  const g3CellAdmission =
    controlled &&
    isPlainObject(value) &&
    value.operation === g3CellAdmissionOperation;
  const capabilityProbe =
    expected.serviceKind === 'provider-capability' &&
    isPlainObject(value) &&
    value.operation === AGENT_EVALUATION_CAPABILITY_PROBE_OPERATION;
  const capabilityProbeProviderResource =
    expected.serviceKind === 'provider-capability' &&
    isPlainObject(value) &&
    value.operation ===
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_OPERATION;
  const capabilityProbeProviderResourceCleanup =
    expected.serviceKind === 'provider-capability' &&
    isPlainObject(value) &&
    value.operation ===
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_OPERATION;
  const runtimeFactSourceRegistration =
    expected.serviceKind === 'provider-capability' &&
    isPlainObject(value) &&
    value.operation ===
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_OPERATION;
  const ownerStateful =
    isPlainObject(value) &&
    typeof value.serviceKind === 'string' &&
    typeof value.operation === 'string' &&
    typeof value.routeBinding === 'string' &&
    isAgentEvaluationOwnerStatefulOperation(
      value.serviceKind,
      value.operation,
      value.routeBinding
    );
  if (
    !(capabilityProbeProviderResourceCleanup
      ? exactRecord(
          value,
          capabilityProbeProviderResourceCleanupRequestKeys,
          expected.mode === 'stage'
            ? []
            : expected.mode === 'execute'
              ? ['stageDigest']
              : [
                  'stageDigest',
                  'dispatchAckDigest',
                  'resultIngressDigest',
                  'resultIngressReceiptDigest',
                  'sealedProviderResourceCleanupReceipt',
                ]
        )
      : capabilityProbeProviderResource
        ? exactRecord(
            value,
            capabilityProbeProviderResourceRequestKeys,
            expected.mode === 'stage'
              ? []
              : expected.mode === 'execute'
                ? ['stageDigest']
                : [
                    'stageDigest',
                    'dispatchAckDigest',
                    'resultIngressDigest',
                    'resultIngressReceiptDigest',
                    'sealedProviderResourceResult',
                  ]
          )
        : runtimeFactSourceRegistration
          ? exactRecord(
              value,
              runtimeFactSourceRegistrationRequestKeys,
              expected.mode === 'stage'
                ? []
                : expected.mode === 'execute'
                  ? ['stageDigest']
                  : ['stageDigest', 'dispatchAckDigest', 'sealedOwnerHealth']
            )
          : capabilityProbe
            ? exactRecord(
                value,
                capabilityProbeRequestKeys,
                expected.mode === 'stage'
                  ? []
                  : expected.mode === 'execute'
                    ? ['stageDigest']
                    : [
                        'stageDigest',
                        'dispatchAckDigest',
                        'sealedProbeObservation',
                        'sealedProbeObservationDigest',
                      ]
              )
            : ownerStateful
              ? exactRecord(
                  value,
                  expected.serviceKind === 'controlled-workspace'
                    ? controlledOwnerStateRequestKeys
                    : verificationOwnerStateRequestKeys,
                  [
                    ...(expected.serviceKind === 'controlled-workspace'
                      ? ['sessionId']
                      : []),
                    ...(expected.mode === 'stage'
                      ? []
                      : expected.mode === 'execute'
                        ? ['stageDigest']
                        : [
                            'stageDigest',
                            'dispatchAckDigest',
                            'sealedOwnerOperation',
                          ]),
                  ]
                )
              : g3CellAdmission
                ? exactRecord(
                    value,
                    g3CellAdmissionRequestKeys,
                    expected.mode === 'stage'
                      ? []
                      : expected.mode === 'execute'
                        ? ['stageDigest']
                        : ['stageDigest', 'dispatchAckDigest']
                  )
                : controlled
                  ? exactRecord(
                      value,
                      expected.mode === 'execute' ||
                        expected.mode === 'reconcile'
                        ? controlledWorkspaceStatelessRequestKeys
                        : commonRequestKeys,
                      [
                        'sessionId',
                        ...(expected.mode === 'execute' ||
                        expected.mode === 'reconcile'
                          ? ['stageDigest']
                          : []),
                        ...(expected.mode === 'reconcile'
                          ? ['dispatchAckDigest']
                          : []),
                      ]
                    )
                  : verification
                    ? exactRecord(value, verificationRequestKeys)
                    : exactRecord(
                        value,
                        attemptAuthorityRequestKeys,
                        expected.mode === 'stage'
                          ? []
                          : expected.mode === 'execute'
                            ? ['stageDigest']
                            : ['stageDigest', 'dispatchAckDigest']
                      ))
  ) {
    return fail('Request keys drifted.');
  }
  const request = value as unknown as AgentEvaluationOwnerAuthorityRequest;
  if (
    request.format !== AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT ||
    request.version !== AGENT_EVALUATION_OWNER_AUTHORITY_VERSION ||
    request.serviceKind !== expected.serviceKind ||
    request.mode !== expected.mode ||
    !isAgentControlIdentity(request.namespaceId) ||
    (capabilityProbe ||
    capabilityProbeProviderResource ||
    capabilityProbeProviderResourceCleanup ||
    runtimeFactSourceRegistration
      ? request.planDigest !== undefined
      : !isAgentCanonicalDigest(request.planDigest)) ||
    !exactCommitPattern.test(request.repositoryCommit) ||
    !isAgentControlIdentity(request.operation) ||
    !safeText(request.routeBinding, 1_024) ||
    (request.sessionId !== undefined &&
      !isAgentControlIdentity(request.sessionId)) ||
    !isAgentCanonicalDigest(request.requestDigest) ||
    !isPlainObject(request.payload) ||
    (request.mode === 'read'
      ? request.claimGeneration !== 0
      : request.claimGeneration !== 1)
  ) {
    return fail('Request identity is invalid.');
  }
  if (
    capabilityProbeProviderResourceCleanup &&
    (request.routeBinding !==
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_ROUTE_BINDING ||
      request.sessionId !== undefined ||
      !isAgentCanonicalDigest(request.ownerImplementationDigest) ||
      request.mode === 'read' ||
      (request.mode === 'stage'
        ? request.stageDigest !== undefined ||
          request.dispatchAckDigest !== undefined ||
          request.resultIngressDigest !== undefined ||
          request.resultIngressReceiptDigest !== undefined ||
          request.sealedProviderResourceCleanupReceipt !== undefined
        : request.mode === 'execute'
          ? !isAgentCanonicalDigest(request.stageDigest) ||
            request.dispatchAckDigest !== undefined ||
            request.resultIngressDigest !== undefined ||
            request.resultIngressReceiptDigest !== undefined ||
            request.sealedProviderResourceCleanupReceipt !== undefined
          : !isAgentCanonicalDigest(request.stageDigest) ||
            !isAgentCanonicalDigest(request.dispatchAckDigest) ||
            !isAgentCanonicalDigest(request.resultIngressDigest) ||
            !isAgentCanonicalDigest(request.resultIngressReceiptDigest) ||
            !isAgentCapabilityProbeProviderResourceCleanupReceipt(
              request.sealedProviderResourceCleanupReceipt
            )))
  ) {
    return fail('Capability probe provider resource cleanup binding drifted.');
  }
  if (
    capabilityProbeProviderResource &&
    (request.routeBinding !==
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_ROUTE_BINDING ||
      request.sessionId !== undefined ||
      !isAgentCanonicalDigest(request.ownerImplementationDigest) ||
      request.mode === 'read' ||
      (request.mode === 'stage'
        ? request.stageDigest !== undefined ||
          request.dispatchAckDigest !== undefined ||
          request.resultIngressDigest !== undefined ||
          request.resultIngressReceiptDigest !== undefined ||
          request.sealedProviderResourceResult !== undefined
        : request.mode === 'execute'
          ? !isAgentCanonicalDigest(request.stageDigest) ||
            request.dispatchAckDigest !== undefined ||
            request.resultIngressDigest !== undefined ||
            request.resultIngressReceiptDigest !== undefined ||
            request.sealedProviderResourceResult !== undefined
          : !isAgentCanonicalDigest(request.stageDigest) ||
            !isAgentCanonicalDigest(request.dispatchAckDigest) ||
            !isAgentCanonicalDigest(request.resultIngressDigest) ||
            !isAgentCanonicalDigest(request.resultIngressReceiptDigest) ||
            request.sealedProviderResourceResult === undefined))
  ) {
    return fail('Capability probe provider resource binding drifted.');
  }
  if (
    controlled &&
    !g3CellAdmission &&
    !ownerStateful &&
    ((request.operation.startsWith('session.') &&
      request.operation !== 'session.orphans.list' &&
      request.sessionId === undefined) ||
      (!request.operation.startsWith('session.') &&
        request.sessionId !== undefined))
  ) {
    return fail('Controlled Workspace session binding drifted.');
  }
  if (
    controlled &&
    !g3CellAdmission &&
    !ownerStateful &&
    (request.mode === 'execute' || request.mode === 'reconcile') &&
    (!isAgentCanonicalDigest(request.ownerImplementationDigest) ||
      !isAgentCanonicalDigest(request.stageDigest) ||
      request.stageDigest !==
        createAgentEvaluationControlledWorkspaceDirectStageDigest(
          request,
          request.ownerImplementationDigest
        ) ||
      (request.mode === 'execute'
        ? request.dispatchAckDigest !== undefined
        : !isAgentCanonicalDigest(request.dispatchAckDigest)))
  ) {
    return fail('Controlled Workspace direct owner fence drifted.');
  }
  if (ownerStateful) {
    assertOwnerStateRequest(request);
  }
  if (
    g3CellAdmission &&
    (request.routeBinding !== g3CellAdmissionRouteBinding ||
      request.sessionId !== undefined ||
      !isAgentControlIdentity(request.attemptId) ||
      !isAgentCanonicalDigest(request.descriptorDigest) ||
      !Number.isSafeInteger(request.generation) ||
      request.generation! < 1 ||
      !isAgentCanonicalDigest(request.ownerImplementationDigest) ||
      request.mode === 'read' ||
      (request.mode === 'stage'
        ? request.stageDigest !== undefined ||
          request.dispatchAckDigest !== undefined
        : !isAgentCanonicalDigest(request.stageDigest)) ||
      (request.mode === 'execute'
        ? request.dispatchAckDigest !== undefined
        : request.mode === 'reconcile'
          ? !isAgentCanonicalDigest(request.dispatchAckDigest)
          : false))
  ) {
    return fail('G3 cell admission authority binding drifted.');
  }
  if (
    verification &&
    (!isAgentControlIdentity(request.attemptId) ||
      !isAgentCanonicalDigest(request.descriptorDigest) ||
      !Number.isSafeInteger(request.generation) ||
      request.generation! < 1 ||
      !isAgentCanonicalDigest(request.controlledWorkspaceGrantDigest) ||
      !isAgentCanonicalDigest(request.authorityDigest) ||
      !isAgentCanonicalDigest(request.sandboxRegistrationReceiptDigest))
  ) {
    return fail('Verification Evidence authority binding drifted.');
  }
  if (
    runtimeFactSourceRegistration &&
    (request.routeBinding !==
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_ROUTE_BINDING ||
      request.sessionId !== undefined ||
      !isAgentCanonicalDigest(request.ownerImplementationDigest) ||
      !isAgentControlIdentity(request.registrationAuthorityIssuerId) ||
      request.mode === 'read' ||
      (request.mode === 'stage'
        ? request.stageDigest !== undefined ||
          request.dispatchAckDigest !== undefined ||
          request.sealedOwnerHealth !== undefined
        : request.mode === 'execute'
          ? !isAgentCanonicalDigest(request.stageDigest) ||
            request.dispatchAckDigest !== undefined ||
            request.sealedOwnerHealth !== undefined
          : !isAgentCanonicalDigest(request.stageDigest) ||
            (request.dispatchAckDigest !== undefined &&
              !isAgentCanonicalDigest(request.dispatchAckDigest))))
  ) {
    return fail('Runtime fact source registration binding drifted.');
  }
  if (
    capabilityProbe &&
    (request.routeBinding !== AGENT_EVALUATION_CAPABILITY_PROBE_ROUTE_BINDING ||
      request.sessionId !== undefined ||
      !isAgentCanonicalDigest(request.ownerImplementationDigest) ||
      request.mode === 'read' ||
      (request.mode === 'stage'
        ? request.stageDigest !== undefined ||
          request.dispatchAckDigest !== undefined ||
          request.sealedProbeObservation !== undefined ||
          request.sealedProbeObservationDigest !== undefined
        : request.mode === 'execute'
          ? !isAgentCanonicalDigest(request.stageDigest) ||
            request.dispatchAckDigest !== undefined ||
            request.sealedProbeObservation !== undefined ||
            request.sealedProbeObservationDigest !== undefined
          : !isAgentCanonicalDigest(request.stageDigest) ||
            !isAgentCanonicalDigest(request.dispatchAckDigest) ||
            request.sealedProbeObservation === undefined ||
            !isAgentCanonicalDigest(request.sealedProbeObservationDigest) ||
            request.sealedProbeObservationDigest !==
              digestAgentEvaluationCapabilityProbeSealedObservation(
                request.sealedProbeObservation
              )))
  ) {
    return fail('Capability probe admission authority binding drifted.');
  }
  if (
    !controlled &&
    !verification &&
    !capabilityProbe &&
    !capabilityProbeProviderResource &&
    !capabilityProbeProviderResourceCleanup &&
    !runtimeFactSourceRegistration &&
    (!isAgentControlIdentity(request.attemptId) ||
      !isAgentCanonicalDigest(request.descriptorDigest) ||
      !isAgentControlIdentity(request.shardLeaseOwnerId) ||
      !Number.isSafeInteger(request.shardLeaseGeneration) ||
      request.shardLeaseGeneration! < 1 ||
      !Number.isSafeInteger(request.verificationGrantGeneration) ||
      request.verificationGrantGeneration! < 1 ||
      !isAgentCanonicalDigest(
        request.verificationAttemptGrantReceiptSetDigest
      ) ||
      !isAgentCanonicalDigest(
        request.providerCapabilityObservationReceiptSetDigest
      ) ||
      !isAgentCanonicalDigest(request.ownerImplementationDigest) ||
      (request.mode === 'stage'
        ? request.stageDigest !== undefined ||
          request.dispatchAckDigest !== undefined
        : !isAgentCanonicalDigest(request.stageDigest)) ||
      (request.mode === 'execute'
        ? request.dispatchAckDigest !== undefined
        : request.mode === 'reconcile'
          ? request.dispatchAckDigest !== undefined &&
            !isAgentCanonicalDigest(request.dispatchAckDigest)
          : false) ||
      request.mode === 'read' ||
      (request.serviceKind === 'provider-capability' &&
        request.operation !== 'tool.execute' &&
        request.operation !== 'capability.assess') ||
      (request.serviceKind === 'attempt-grading' &&
        request.operation !== 'grade-and-persist'))
  ) {
    return fail('Attempt authority binding drifted.');
  }
  if (g3CellAdmission) g3CellAdmissionPayload(request);
  if (capabilityProbe) capabilityProbeAdmissionPayload(request);
  if (capabilityProbeProviderResource) {
    capabilityProbeProviderResourcePayload(request);
  }
  if (capabilityProbeProviderResourceCleanup) {
    const { cleanupRequest, deletionAuthorityReceipt } =
      capabilityProbeProviderResourceCleanupPayload(request);
    if (
      request.sealedProviderResourceCleanupReceipt !== undefined &&
      (request.sealedProviderResourceCleanupReceipt.requestDigest !==
        cleanupRequest.resourceRegistrationRequestDigest ||
        request.sealedProviderResourceCleanupReceipt
          .deletionAuthorityReceiptDigest !==
          cleanupRequest.deletionAuthorityReceiptDigest ||
        request.sealedProviderResourceCleanupReceipt
          .deletionRequestProjectionDigest !==
          deletionAuthorityReceipt.deletionRequestProjectionDigest ||
        request.sealedProviderResourceCleanupReceipt.protocolFamily !==
          deletionAuthorityReceipt.deletionRequestProjection.protocolFamily ||
        request.sealedProviderResourceCleanupReceipt.providerResourceId !==
          deletionAuthorityReceipt.providerResourceId ||
        !sameCanonicalJson(
          request.sealedProviderResourceCleanupReceipt.auxiliaryResourceIds,
          deletionAuthorityReceipt.deletionRequestProjection
            .auxiliaryResourceIds
        ))
    ) {
      return fail(
        'Sealed capability probe provider resource cleanup receipt drifted.'
      );
    }
  }
  if (runtimeFactSourceRegistration) {
    const payload = runtimeFactSourceRegistrationPayload(request);
    if (request.sealedOwnerHealth !== undefined) {
      decodeAgentEvaluationRuntimeFactSourceOwnerHealth(
        request.sealedOwnerHealth,
        payload
      );
    }
  }
  return Object.freeze({ ...request });
};

const requestBinding = (
  request: AgentEvaluationOwnerAuthorityRequest,
  authority: Readonly<{
    authorityId: string;
    implementationDigest: CanonicalDigest;
  }>
): AgentEvaluationOwnerAuthorityReplayBinding =>
  Object.freeze({
    serviceKind: request.serviceKind,
    requestDigest: request.requestDigest,
    requestBindingDigest: digestAgentCanonicalValue({
      format: request.format,
      version: request.version,
      serviceKind: request.serviceKind,
      ownerAuthorityId: authority.authorityId,
      ownerImplementationDigest: authority.implementationDigest,
      namespaceId: request.namespaceId,
      ...(request.planDigest ? { planDigest: request.planDigest } : {}),
      repositoryCommit: request.repositoryCommit,
      operation: request.operation,
      routeBinding: request.routeBinding,
      ...(request.sessionId ? { sessionId: request.sessionId } : {}),
      requestDigest: request.requestDigest,
      ...(request.attemptId ? { attemptId: request.attemptId } : {}),
      ...(request.descriptorDigest
        ? { descriptorDigest: request.descriptorDigest }
        : {}),
      ...(request.generation ? { generation: request.generation } : {}),
      ...(request.controlledWorkspaceGrantDigest
        ? {
            controlledWorkspaceGrantDigest:
              request.controlledWorkspaceGrantDigest,
          }
        : {}),
      ...(request.authorityDigest
        ? { authorityDigest: request.authorityDigest }
        : {}),
      ...(request.sandboxRegistrationReceiptDigest
        ? {
            sandboxRegistrationReceiptDigest:
              request.sandboxRegistrationReceiptDigest,
          }
        : {}),
      ...(request.shardLeaseGeneration
        ? { shardLeaseGeneration: request.shardLeaseGeneration }
        : {}),
      ...(request.shardLeaseOwnerId
        ? { shardLeaseOwnerId: request.shardLeaseOwnerId }
        : {}),
      ...(request.verificationGrantGeneration
        ? {
            verificationGrantGeneration: request.verificationGrantGeneration,
          }
        : {}),
      ...(request.verificationAttemptGrantReceiptSetDigest
        ? {
            verificationAttemptGrantReceiptSetDigest:
              request.verificationAttemptGrantReceiptSetDigest,
          }
        : {}),
      ...(request.providerCapabilityObservationReceiptSetDigest
        ? {
            providerCapabilityObservationReceiptSetDigest:
              request.providerCapabilityObservationReceiptSetDigest,
          }
        : {}),
      ...(request.registrationAuthorityIssuerId
        ? {
            registrationAuthorityIssuerId:
              request.registrationAuthorityIssuerId,
          }
        : {}),
      ...(request.stageDigest ? { stageDigest: request.stageDigest } : {}),
      ...(request.sealedProbeObservation
        ? { sealedProbeObservation: request.sealedProbeObservation }
        : {}),
      ...(request.sealedProbeObservationDigest
        ? {
            sealedProbeObservationDigest: request.sealedProbeObservationDigest,
          }
        : {}),
      ...(request.resultIngressDigest
        ? { resultIngressDigest: request.resultIngressDigest }
        : {}),
      ...(request.resultIngressReceiptDigest
        ? {
            resultIngressReceiptDigest: request.resultIngressReceiptDigest,
          }
        : {}),
      ...(request.sealedProviderResourceResult
        ? {
            sealedProviderResourceResultDigest: digestAgentCanonicalValue(
              request.sealedProviderResourceResult
            ),
          }
        : {}),
      ...(request.ownerStateRevision !== undefined
        ? { ownerStateRevision: request.ownerStateRevision }
        : {}),
      ...(request.ownerStateBundle !== undefined
        ? {
            ownerStateBundleDigest:
              request.ownerStateBundle === null
                ? null
                : digestAgentCanonicalValue(request.ownerStateBundle),
          }
        : {}),
      ...(request.ownerStateRootDigest !== undefined
        ? { ownerStateRootDigest: request.ownerStateRootDigest }
        : {}),
      ...(request.dispatchAckDigest &&
      !isControlledWorkspaceStatelessRequest(request)
        ? { dispatchAckDigest: request.dispatchAckDigest }
        : {}),
      ...(request.sealedOwnerOperation
        ? {
            sealedOwnerOperationReceiptDigest:
              request.sealedOwnerOperation.resultReceiptDigest,
          }
        : {}),
      claimGeneration: request.claimGeneration,
      payloadDigest: digestAgentCanonicalValue(request.payload),
    }),
    claimGeneration: request.claimGeneration,
  });

const exactFacts = (facts: readonly unknown[]): readonly unknown[] => {
  if (!Array.isArray(facts) || facts.length > maximumFacts) {
    return fail('Controlled Workspace fact count is invalid.');
  }
  canonicalJsonText(facts);
  return Object.freeze([...facts]);
};

const routeFor = (
  path: string
):
  | Readonly<{
      serviceKind: AgentEvaluationOwnerAuthorityServiceKind;
      mode: AgentEvaluationOwnerAuthorityMode;
    }>
  | undefined => {
  const match =
    /^\/v1\/(controlled-workspace|verification-evidence|capability-runtime|attempt-grading)\/(read|stage|execute|reconcile)$/u.exec(
      path
    );
  if (!match) return undefined;
  const serviceKind =
    match[1] === 'capability-runtime' ? 'provider-capability' : match[1];
  if (
    (serviceKind === 'provider-capability' ||
      serviceKind === 'attempt-grading') &&
    match[2] === 'read'
  ) {
    return undefined;
  }
  return Object.freeze({
    serviceKind: serviceKind as AgentEvaluationOwnerAuthorityServiceKind,
    mode: match[2] as AgentEvaluationOwnerAuthorityMode,
  });
};

export const createAgentEvaluationAttemptAuthorityDispatchStageDigest = (
  request: AgentEvaluationOwnerAuthorityRequest,
  ownerImplementationDigest: CanonicalDigest
): CanonicalDigest => {
  if (
    (request.serviceKind !== 'provider-capability' &&
      request.serviceKind !== 'attempt-grading') ||
    !isAgentCanonicalDigest(ownerImplementationDigest) ||
    !isAgentCanonicalDigest(
      request.providerCapabilityObservationReceiptSetDigest
    ) ||
    request.claimGeneration !== 1
  ) {
    return fail('Attempt authority dispatch stage is invalid.');
  }
  return digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-attempt-authority-dispatch-stage',
    version: 1,
    serviceKind: request.serviceKind,
    operation: request.operation,
    routeBinding: request.routeBinding,
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    attemptId: request.attemptId!,
    descriptorDigest: request.descriptorDigest!,
    shardLeaseOwnerId: request.shardLeaseOwnerId!,
    shardLeaseGeneration: request.shardLeaseGeneration!,
    verificationGrantGeneration: request.verificationGrantGeneration!,
    verificationAttemptGrantReceiptSetDigest:
      request.verificationAttemptGrantReceiptSetDigest!,
    requestDigest: request.requestDigest,
    providerCapabilityObservationReceiptSetDigest:
      request.providerCapabilityObservationReceiptSetDigest,
    ownerImplementationDigest,
    claimGeneration: 1,
  });
};

const attemptAuthorityStageResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
) => {
  const expected = createAgentEvaluationAttemptAuthorityDispatchStageDigest(
    request,
    ownerImplementationDigest
  );
  if (stageDigest !== expected) {
    return fail('Attempt authority stage receipt drifted.');
  }
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    mode: 'stage' as const,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
    stageDigest,
  });
};

const ownerStateStageResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
) => {
  const identity = ownerStateIdentityInput(request);
  const prior = ownerStatePriorForRequest(request);
  const ownerStateId = createAgentEvaluationOwnerStateIdentity(identity);
  const expected = digestAgentEvaluationOwnerStateStage({
    serviceKind: identity.serviceKind,
    operation: request.operation,
    routeBinding: request.routeBinding,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
    ownerStateId,
    priorOwnerStateRevision: prior.revision,
    priorOwnerStateRootDigest: prior.rootDigest,
  });
  if (stageDigest !== expected) {
    return fail('Owner state stage receipt drifted.');
  }
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    mode: 'stage' as const,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
    ownerStateId,
    priorOwnerStateRevision: prior.revision,
    priorOwnerStateRootDigest: prior.rootDigest,
    stageDigest,
  });
};

const g3CellAdmissionStageResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
) => {
  const expected = digestAgentEvaluationControlledWorkspaceG3AdmissionStage(
    g3CellAdmissionPayload(request),
    ownerImplementationDigest
  );
  if (stageDigest !== expected) {
    return fail('G3 cell admission stage receipt drifted.');
  }
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    mode: 'stage' as const,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
    stageDigest,
  });
};

const capabilityProbeAdmissionStageResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
) => {
  const expected = digestAgentEvaluationCapabilityProbeAdmissionStage(
    capabilityProbeAdmissionPayload(request),
    ownerImplementationDigest
  );
  if (stageDigest !== expected) {
    return fail('Capability probe admission stage receipt drifted.');
  }
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    mode: 'stage' as const,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
    stageDigest,
  });
};

const capabilityProbeProviderResourceStageResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
) => {
  const payload = capabilityProbeProviderResourcePayload(request);
  const expected = digestAgentEvaluationCapabilityProbeProviderResourceStage(
    payload.requestDigest,
    ownerImplementationDigest
  );
  if (stageDigest !== expected) {
    return fail('Capability probe provider resource stage receipt drifted.');
  }
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    mode: 'stage' as const,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
    stageDigest,
  });
};

const capabilityProbeProviderResourceResultResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  resourceResult: AgentEvaluationCapabilityProbeProviderResourceResult,
  ingress: AgentEvaluationCapabilityProbeProviderResourceResultIngressResponse,
  ownerImplementationDigest: CanonicalDigest,
  reconciled?: boolean
) => {
  const payload = capabilityProbeProviderResourcePayload(request);
  const stageDigest = request.stageDigest!;
  const sealed =
    createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest({
      namespaceId: request.namespaceId,
      repositoryCommit: request.repositoryCommit,
      registrationRequest: payload,
      ownerImplementationDigest,
      stageDigest,
      resourceResult,
    });
  const ownerAdmissionDigest =
    digestAgentEvaluationCapabilityProbeProviderResourceOwnerAdmission(
      request.requestDigest,
      sealed.resourceResultDigest,
      ownerImplementationDigest,
      stageDigest
    );
  const dispatchAckDigest =
    digestAgentEvaluationCapabilityProbeProviderResourceDispatchAck(
      request.requestDigest,
      sealed.resourceResultDigest,
      ownerAdmissionDigest,
      ownerImplementationDigest,
      stageDigest
    );
  const resultIngressReceiptDigest =
    digestAgentEvaluationCapabilityProbeProviderResourceResultIngressReceipt(
      request.requestDigest,
      sealed.ingressDigest,
      sealed.resourceResultDigest,
      dispatchAckDigest
    );
  if (
    ingress.requestDigest !== request.requestDigest ||
    ingress.ingressDigest !== sealed.ingressDigest ||
    ingress.resourceResultDigest !== sealed.resourceResultDigest ||
    ingress.dispatchAckDigest !== dispatchAckDigest ||
    ingress.resultIngressReceiptDigest !== resultIngressReceiptDigest
  ) {
    return fail('Capability probe provider resource result ingress drifted.');
  }
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    mode: request.mode,
    requestDigest: request.requestDigest,
    resourceResultDigest: sealed.resourceResultDigest,
    ownerImplementationDigest,
    ownerAdmissionDigest,
    stageDigest,
    dispatchAckDigest,
    resultIngressDigest: sealed.ingressDigest,
    resultIngressReceiptDigest,
    ...(request.mode === 'reconcile'
      ? { reconciled: reconciled === true }
      : {}),
  });
};

const capabilityProbeProviderResourceCleanupStageResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
) => {
  const { cleanupRequest } =
    capabilityProbeProviderResourceCleanupPayload(request);
  const expected =
    digestAgentCapabilityProbeProviderResourceCleanupAuthorityStage({
      cleanupRequestDigest: cleanupRequest.cleanupRequestDigest,
      ownerImplementationDigest,
    });
  if (stageDigest !== expected) {
    return fail(
      'Capability probe provider resource cleanup stage receipt drifted.'
    );
  }
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    mode: 'stage' as const,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
    stageDigest,
  });
};

const capabilityProbeProviderResourceCleanupResultResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  cleanupReceipt: AgentCapabilityProbeProviderResourceCleanupReceipt,
  ingress: AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressResponse,
  ownerImplementationDigest: CanonicalDigest,
  reconciled?: boolean
) => {
  const { cleanupRequest } =
    capabilityProbeProviderResourceCleanupPayload(request);
  const envelope =
    createAgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope(
      {
        namespaceId: request.namespaceId,
        repositoryCommit: request.repositoryCommit,
        cleanupRequest,
        ownerImplementationDigest,
        cleanupReceipt,
      }
    );
  const ownerAdmissionDigest =
    digestAgentCapabilityProbeProviderResourceCleanupOwnerAdmission({
      cleanupRequestDigest: cleanupRequest.cleanupRequestDigest,
      stageDigest: envelope.stageDigest,
      ownerImplementationDigest,
    });
  const dispatchAckDigest =
    digestAgentCapabilityProbeProviderResourceCleanupAuthorityDispatchAck({
      cleanupRequestDigest: cleanupRequest.cleanupRequestDigest,
      stageDigest: envelope.stageDigest,
      ownerAdmissionDigest,
      cleanupReceiptDigest: cleanupReceipt.cleanupReceiptDigest,
    });
  const resultIngressDigest =
    digestAgentCapabilityProbeProviderResourceCleanupResultIngress({
      cleanupRequestDigest: cleanupRequest.cleanupRequestDigest,
      dispatchAckDigest,
      cleanupReceiptDigest: cleanupReceipt.cleanupReceiptDigest,
    });
  const resultIngressReceiptDigest =
    digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt({
      resultIngressDigest,
      cleanupReceiptDigest: cleanupReceipt.cleanupReceiptDigest,
    });
  if (
    request.stageDigest !== envelope.stageDigest ||
    envelope.ownerAdmissionDigest !== ownerAdmissionDigest ||
    envelope.dispatchAckDigest !== dispatchAckDigest ||
    envelope.resultIngressDigest !== resultIngressDigest ||
    ingress.cleanupRequestDigest !== cleanupRequest.cleanupRequestDigest ||
    ingress.cleanupReceiptDigest !== cleanupReceipt.cleanupReceiptDigest ||
    ingress.dispatchAckDigest !== dispatchAckDigest ||
    ingress.resultIngressDigest !== resultIngressDigest ||
    ingress.resultIngressReceiptDigest !== resultIngressReceiptDigest
  ) {
    return fail(
      'Capability probe provider resource cleanup result ingress drifted.'
    );
  }
  const value = Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    mode: request.mode,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
    stageDigest: envelope.stageDigest,
    cleanupReceiptDigest: cleanupReceipt.cleanupReceiptDigest,
    ownerAdmissionDigest,
    dispatchAckDigest,
    resultIngressDigest,
    resultIngressReceiptDigest,
    ...(request.mode === 'reconcile'
      ? { reconciled: reconciled === true }
      : {}),
  });
  if (new TextEncoder().encode(canonicalJsonText(value)).byteLength > 65_536) {
    return fail(
      'Capability probe provider resource cleanup response is oversized.'
    );
  }
  return value;
};

const runtimeFactSourceRegistrationStageResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  stageDigest: CanonicalDigest
) => {
  const expected = digestAgentEvaluationRuntimeFactSourceRegistrationStage(
    runtimeFactSourceRegistrationPayload(request),
    request.registrationAuthorityIssuerId ??
      fail('Registration authority issuer is missing.')
  );
  if (stageDigest !== expected) {
    return fail('Runtime fact source registration stage drifted.');
  }
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    mode: 'stage' as const,
    requestDigest: request.requestDigest,
    stageDigest,
  });
};

const g3CellAdmissionResult = (
  request: AgentEvaluationOwnerAuthorityRequest,
  output: unknown,
  ownerImplementationDigest: CanonicalDigest
): AgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult => {
  const candidate =
    Array.isArray(output) && output.length === 1 ? output[0] : output;
  try {
    return decodeAgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult(
      candidate,
      g3CellAdmissionPayload(request),
      ownerImplementationDigest
    );
  } catch {
    return fail('G3 cell admission authority result is invalid.');
  }
};

const capabilityProbeAdmissionResult = (
  request: AgentEvaluationOwnerAuthorityRequest,
  output: unknown,
  ownerImplementationDigest: CanonicalDigest
): AgentEvaluationCapabilityProbeAdmissionAuthorityResult => {
  const candidate =
    Array.isArray(output) && output.length === 1 ? output[0] : output;
  try {
    return decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult(
      candidate,
      capabilityProbeAdmissionPayload(request),
      ownerImplementationDigest,
      request.stageDigest ?? fail('Capability probe stage is missing.')
    );
  } catch {
    return fail('Capability probe admission authority result is invalid.');
  }
};

const capabilityProbeSealedObservationResult = (
  request: AgentEvaluationOwnerAuthorityRequest,
  output: unknown,
  ownerImplementationDigest: CanonicalDigest
): AgentEvaluationCapabilityProbeAdmissionAuthorityResult => {
  try {
    const sealed = decodeAgentEvaluationCapabilityProbeSealedObservation(
      output,
      capabilityProbeAdmissionPayload(request),
      ownerImplementationDigest,
      request.stageDigest ?? fail('Capability probe stage is missing.')
    );
    return Object.freeze({
      probeEvidence: sealed.probeEvidence,
      ownerAdmissionDigest: sealed.ownerAdmissionDigest,
    });
  } catch {
    return fail('Sealed capability probe observation is invalid.');
  }
};

const runtimeFactSourceRegistrationResult = (
  request: AgentEvaluationOwnerAuthorityRequest,
  output: unknown
): AgentEvaluationRuntimeFactSourceRegistrationAuthorityResult => {
  try {
    return decodeAgentEvaluationRuntimeFactSourceRegistrationAuthorityResult(
      output,
      runtimeFactSourceRegistrationPayload(request),
      request.stageDigest ?? fail('Registration stage is missing.')
    );
  } catch {
    return fail('Runtime fact source registration result is invalid.');
  }
};

const runtimeFactSourceRegistrationResultFromSealedHealth = (
  request: AgentEvaluationOwnerAuthorityRequest
): AgentEvaluationRuntimeFactSourceRegistrationAuthorityResult => {
  const payload = runtimeFactSourceRegistrationPayload(request);
  const ownerHealth = decodeAgentEvaluationRuntimeFactSourceOwnerHealth(
    request.sealedOwnerHealth ?? fail('Sealed owner health is missing.'),
    payload
  );
  return Object.freeze({
    ownerHealth,
    ownerAdmissionDigest: digestAgentEvaluationRuntimeFactSourceOwnerAdmission(
      payload.requestDigest,
      ownerHealth.healthDigest,
      request.stageDigest ?? fail('Registration stage is missing.')
    ),
  });
};

const runtimeFactSourceRegistrationDispatchAck = (
  request: AgentEvaluationOwnerAuthorityRequest,
  result: AgentEvaluationRuntimeFactSourceRegistrationAuthorityResult
): CanonicalDigest =>
  digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck({
    requestDigest: request.requestDigest,
    ownerHealthDigest: result.ownerHealth.healthDigest,
    ownerAdmissionDigest: result.ownerAdmissionDigest,
    stageDigest: request.stageDigest ?? fail('Registration stage is missing.'),
    registrationAuthorityIssuerId:
      request.registrationAuthorityIssuerId ??
      fail('Registration authority issuer is missing.'),
  });

const decodeOwnerStateExecution = (
  request: AgentEvaluationOwnerAuthorityRequest,
  output: unknown,
  ownerImplementationDigest: CanonicalDigest
): Readonly<{
  transition: AgentEvaluationOwnerStateTransition;
  response?: unknown;
}> => {
  const identity = ownerStateIdentityInput(request);
  const prior = ownerStatePriorForRequest(request);
  const verificationExecution =
    request.serviceKind === 'verification-evidence'
      ? exactRecord(output, ['transition', 'response'])
        ? output
        : fail('Verification owner state execution is invalid.')
      : undefined;
  const candidateTransition = verificationExecution?.transition ?? output;
  const transition = decodeAgentEvaluationOwnerStateTransition(
    candidateTransition,
    {
      ...identity,
      operation: request.operation,
      routeBinding: request.routeBinding,
      requestDigest: request.requestDigest,
      ownerImplementationDigest,
      priorOwnerStateRevision: prior.revision,
      priorOwnerStateRootDigest: prior.rootDigest,
    }
  );
  if (
    request.serviceKind === 'verification-evidence' &&
    !matchAgentEvaluationVerificationEvidencePublicResponse(
      transition.publicResult,
      verificationExecution?.response
    )
  ) {
    return fail('Verification owner public response drifted.');
  }
  return Object.freeze({
    transition,
    ...(request.serviceKind === 'verification-evidence'
      ? { response: verificationExecution!.response }
      : {}),
  });
};

const ownerStateResponseBase = (
  request: AgentEvaluationOwnerAuthorityRequest,
  execution: Readonly<{
    transition: AgentEvaluationOwnerStateTransition;
    response?: unknown;
  }>,
  reconciled: boolean
) => {
  const { transition } = execution;
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: request.serviceKind,
    mode: request.mode,
    requestDigest: request.requestDigest,
    ownerImplementationDigest: transition.ownerImplementationDigest,
    ownerStateId: transition.ownerStateId,
    priorOwnerStateRevision: transition.priorOwnerStateRevision,
    priorOwnerStateRootDigest: transition.priorOwnerStateRootDigest,
    stageDigest: transition.stageDigest,
    publicResult: transition.publicResult,
    responseDigest: transition.responseDigest,
    dispatchAckDigest: transition.dispatchAckDigest,
    ownerStateRevision: transition.ownerStateRevision,
    ownerStateBundle: transition.ownerStateBundle,
    ownerStateRootDigest: transition.ownerStateRootDigest,
    resultReceiptDigest: transition.resultReceiptDigest,
    ...(request.serviceKind === 'verification-evidence'
      ? { response: execution.response }
      : {}),
    ...(request.mode === 'reconcile' ? { reconciled } : {}),
  });
};

const controlledWorkspaceStatelessResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  output: unknown,
  ownerImplementationDigest?: CanonicalDigest
) => {
  const facts = exactFacts(output as readonly unknown[]);
  if (request.mode === 'read') return Object.freeze({ facts });
  if (
    !isAgentCanonicalDigest(ownerImplementationDigest) ||
    !isAgentCanonicalDigest(request.stageDigest)
  ) {
    return fail('Controlled Workspace direct response fence is missing.');
  }
  return Object.freeze({
    facts,
    ownerImplementationDigest,
    stageDigest: request.stageDigest,
    dispatchAckDigest:
      createAgentEvaluationControlledWorkspaceDirectDispatchAckDigest(
        request,
        facts,
        ownerImplementationDigest,
        request.stageDigest
      ),
  });
};

const responseBase = (
  request: AgentEvaluationOwnerAuthorityRequest,
  output: unknown,
  ownerImplementationDigest?: CanonicalDigest,
  reconciled?: boolean
) =>
  isOwnerStateRequest(request)
    ? ownerStateResponseBase(
        request,
        output as Readonly<{
          transition: AgentEvaluationOwnerStateTransition;
          response?: unknown;
        }>,
        reconciled === true
      )
    : Object.freeze({
        format: AGENT_EVALUATION_OWNER_AUTHORITY_RESPONSE_FORMAT,
        version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
        serviceKind: request.serviceKind,
        mode: request.mode,
        requestDigest: request.requestDigest,
        ...(isRuntimeFactSourceRegistrationRequest(request)
          ? {
              ...runtimeFactSourceRegistrationResult(request, output),
              stageDigest: request.stageDigest,
              ...(request.mode === 'reconcile'
                ? {
                    dispatchAckDigest: runtimeFactSourceRegistrationDispatchAck(
                      request,
                      runtimeFactSourceRegistrationResult(request, output)
                    ),
                  }
                : {}),
            }
          : isCapabilityProbeAdmissionRequest(request)
            ? {
                ...capabilityProbeAdmissionResult(
                  request,
                  output,
                  ownerImplementationDigest ??
                    fail('Capability probe owner identity is missing.')
                ),
                ownerImplementationDigest,
                stageDigest: request.stageDigest,
                ...(request.mode === 'reconcile'
                  ? { dispatchAckDigest: request.dispatchAckDigest }
                  : {}),
              }
            : isG3CellAdmissionRequest(request)
              ? g3CellAdmissionResult(
                  request,
                  output,
                  ownerImplementationDigest ??
                    fail('G3 owner identity is missing.')
                )
              : request.serviceKind === 'controlled-workspace'
                ? controlledWorkspaceStatelessResponse(
                    request,
                    output,
                    ownerImplementationDigest
                  )
                : { response: output }),
        ...(isCapabilityProbeAdmissionRequest(request) ||
        isRuntimeFactSourceRegistrationRequest(request)
          ? {}
          : request.serviceKind === 'provider-capability' ||
              request.serviceKind === 'attempt-grading'
            ? {
                shardLeaseGeneration: request.shardLeaseGeneration,
                shardLeaseOwnerId: request.shardLeaseOwnerId,
                verificationGrantGeneration:
                  request.verificationGrantGeneration,
                verificationAttemptGrantReceiptSetDigest:
                  request.verificationAttemptGrantReceiptSetDigest,
                stageDigest: request.stageDigest,
                ownerImplementationDigest,
                dispatchAckDigest:
                  createAgentEvaluationAttemptAuthorityDispatchAckDigest(
                    request,
                    output,
                    ownerImplementationDigest
                  ),
              }
            : {}),
        ...(request.mode === 'reconcile'
          ? { reconciled: reconciled === true }
          : {}),
      });

const responseDigest = (
  request: AgentEvaluationOwnerAuthorityRequest,
  output: unknown
): CanonicalDigest =>
  isOwnerStateRequest(request) &&
  isPlainObject(output) &&
  isPlainObject(output.transition) &&
  isAgentCanonicalDigest(output.transition.resultReceiptDigest)
    ? output.transition.resultReceiptDigest
    : digestAgentCanonicalValue(output);

export const createAgentEvaluationAttemptAuthorityDispatchAckDigest = (
  request: AgentEvaluationOwnerAuthorityRequest,
  output: unknown,
  ownerImplementationDigest: CanonicalDigest | undefined
): CanonicalDigest => {
  if (
    (request.serviceKind !== 'provider-capability' &&
      request.serviceKind !== 'attempt-grading') ||
    !isAgentCanonicalDigest(ownerImplementationDigest)
  ) {
    return fail('Attempt authority dispatch acknowledgement is invalid.');
  }
  return digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-attempt-authority-dispatch-ack',
    version: 1,
    serviceKind: request.serviceKind,
    operation: request.operation,
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    attemptId: request.attemptId!,
    descriptorDigest: request.descriptorDigest!,
    shardLeaseOwnerId: request.shardLeaseOwnerId!,
    shardLeaseGeneration: request.shardLeaseGeneration!,
    verificationGrantGeneration: request.verificationGrantGeneration!,
    verificationAttemptGrantReceiptSetDigest:
      request.verificationAttemptGrantReceiptSetDigest!,
    providerCapabilityObservationReceiptSetDigest:
      request.providerCapabilityObservationReceiptSetDigest!,
    stageDigest: request.stageDigest!,
    requestDigest: request.requestDigest,
    responseDigest: digestAgentCanonicalValue(output),
    ownerImplementationDigest,
  });
};

const readBody = async (request: IncomingMessage): Promise<Uint8Array> => {
  const length = Number(request.headers['content-length']);
  if (
    !Number.isSafeInteger(length) ||
    length < 1 ||
    length > maximumRequestBytes ||
    request.headers['transfer-encoding'] !== undefined ||
    request.headers['content-encoding'] !== undefined
  ) {
    return fail('Request byte framing is invalid.');
  }
  const chunks: Uint8Array[] = [];
  let observed = 0;
  try {
    for await (const chunk of request) {
      const bytes =
        typeof chunk === 'string'
          ? new TextEncoder().encode(chunk)
          : new Uint8Array(chunk);
      observed += bytes.byteLength;
      if (observed > length || observed > maximumRequestBytes) {
        return fail('Request body exceeds its byte budget.');
      }
      chunks.push(bytes);
    }
    if (observed !== length) return fail('Request byte length drifted.');
    const body = new Uint8Array(observed);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return body;
  } finally {
    for (const chunk of chunks) chunk.fill(0);
  }
};

const sendJson = (
  response: ServerResponse,
  status: number,
  value: unknown
): void => {
  const bytes = new TextEncoder().encode(canonicalJsonText(value));
  if (bytes.byteLength > maximumResponseBytes) {
    bytes.fill(0);
    return fail('Response exceeds its byte budget.');
  }
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Content-Length', String(bytes.byteLength));
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(bytes, () => bytes.fill(0));
};

const sendUnavailable = (response: ServerResponse): void =>
  sendJson(
    response,
    503,
    Object.freeze({
      format: 'prodivix.agent-evaluation-owner-authority-error',
      version: 1,
      code: 'authority-unavailable',
    })
  );

const tokenBytes = (token: string): Uint8Array => {
  if (!isAgentEvaluationServiceToken(token)) {
    return fail('Service token is invalid.');
  }
  return new TextEncoder().encode(token);
};

const authorized = (
  request: IncomingMessage,
  expected: Uint8Array
): boolean => {
  const value = request.headers.authorization;
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return false;
  const observed = new TextEncoder().encode(value.slice('Bearer '.length));
  try {
    return (
      observed.byteLength === expected.byteLength &&
      timingSafeEqual(observed, expected)
    );
  } finally {
    observed.fill(0);
  }
};

const closeServer = async (server: Server): Promise<void> => {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
};

/**
 * Loopback-only owner bridge. It journals only request/response commitments;
 * payloads, capabilities, nonces, proof bytes, artifacts, and raw responses
 * remain inside the concrete owner callback. Only a fresh claimed request can
 * move through durable owner staging and dispatch to execute. Dispatched and
 * accepted retries use the owner's durable reconcile method.
 */
export const createProductionAgentEvaluationOwnerAuthoritySidecar = (
  input: CreateProductionAgentEvaluationOwnerAuthoritySidecarInput
): AgentEvaluationProductionOwnerAuthoritySidecar => {
  const preplanAuthorities =
    input.authorities?.purpose === 'preplan' ? input.authorities : undefined;
  const fullAttemptAuthorities =
    input.authorities?.purpose === 'full-attempt'
      ? input.authorities
      : undefined;
  if (!preplanAuthorities && !fullAttemptAuthorities) {
    return fail('Owner authority purpose is invalid.');
  }
  if (preplanAuthorities) {
    assertCapabilityProbeOwnerPort(preplanAuthorities.capabilityProbe);
    assertCapabilityProbeProviderResourceOwnerPort(
      preplanAuthorities.capabilityProbeProviderResource
    );
    assertCapabilityProbeProviderResourceCleanupOwnerPort(
      preplanAuthorities.capabilityProbeProviderResourceCleanup
    );
    assertRuntimeFactSourceRegistrationOwnerPort(
      preplanAuthorities.runtimeFactSourceRegistration
    );
  } else {
    assertAuthorityPort(fullAttemptAuthorities!.controlledWorkspace);
    assertAuthorityPort(fullAttemptAuthorities!.verificationEvidence);
    assertAuthorityPort(fullAttemptAuthorities!.providerCapability);
    assertAuthorityPort(fullAttemptAuthorities!.attemptGrading);
    if (
      typeof fullAttemptAuthorities!.controlledWorkspace.read !== 'function' ||
      typeof fullAttemptAuthorities!.verificationEvidence.read !== 'function'
    ) {
      return fail('Owner read authority is unavailable.');
    }
  }
  if (
    !input.journal ||
    !isAgentCanonicalDigest(input.journal.implementationDigest) ||
    typeof input.journal.claim !== 'function' ||
    typeof input.journal.markDispatched !== 'function' ||
    typeof input.journal.accept !== 'function' ||
    typeof input.authorities.close !== 'function' ||
    typeof input.forbiddenCanaries !== 'function' ||
    (preplanAuthorities
      ? input.attemptAuthorityResultIngress !== undefined ||
        (input.capabilityProbeProviderResourceResultIngress !== undefined &&
          typeof input.capabilityProbeProviderResourceResultIngress.seal !==
            'function') ||
        (input.capabilityProbeProviderResourceCleanupResultIngress !==
          undefined &&
          typeof input.capabilityProbeProviderResourceCleanupResultIngress
            .seal !== 'function')
      : (input.attemptAuthorityResultIngress !== undefined &&
          typeof input.attemptAuthorityResultIngress.seal !== 'function') ||
        input.capabilityProbeProviderResourceResultIngress !== undefined ||
        input.capabilityProbeProviderResourceCleanupResultIngress !== undefined)
  ) {
    return fail('Replay journal or canary authority is unavailable.');
  }
  const credential = tokenBytes(input.serviceToken);
  assertProductionAgentEvaluationG3SandboxCanaryClean(
    Object.freeze({
      ...(preplanAuthorities
        ? {
            capabilityProbeAuthorityDigest:
              preplanAuthorities.capabilityProbe.implementationDigest,
            capabilityProbeProviderResourceAuthorityDigest:
              preplanAuthorities.capabilityProbeProviderResource
                .implementationDigest,
            capabilityProbeProviderResourceCleanupAuthorityDigest:
              preplanAuthorities.capabilityProbeProviderResourceCleanup
                .implementationDigest,
            runtimeFactSourceRegistrationAuthorityDigest:
              preplanAuthorities.runtimeFactSourceRegistration
                .implementationDigest,
          }
        : {
            controlledWorkspaceAuthorityDigest:
              fullAttemptAuthorities!.controlledWorkspace.implementationDigest,
            verificationEvidenceAuthorityDigest:
              fullAttemptAuthorities!.verificationEvidence.implementationDigest,
            providerCapabilityAuthorityDigest:
              fullAttemptAuthorities!.providerCapability.implementationDigest,
            attemptGradingAuthorityDigest:
              fullAttemptAuthorities!.attemptGrading.implementationDigest,
          }),
      replayJournalImplementationDigest: input.journal.implementationDigest,
    }),
    input.forbiddenCanaries
  );
  const healthBase = preplanAuthorities
    ? Object.freeze({
        format: AGENT_EVALUATION_OWNER_AUTHORITY_HEALTH_FORMAT,
        version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
        purpose: 'preplan' as const,
        status: 'ready' as const,
        capabilityProbeAuthorityDigest:
          preplanAuthorities.capabilityProbe.implementationDigest,
        capabilityProbeProviderResourceAuthorityDigest:
          preplanAuthorities.capabilityProbeProviderResource
            .implementationDigest,
        capabilityProbeProviderResourceCleanupAuthorityDigest:
          preplanAuthorities.capabilityProbeProviderResourceCleanup
            .implementationDigest,
        runtimeFactSourceRegistrationAuthorityDigest:
          preplanAuthorities.runtimeFactSourceRegistration.implementationDigest,
        replayJournalImplementationDigest: input.journal.implementationDigest,
      })
    : Object.freeze({
        format: AGENT_EVALUATION_OWNER_AUTHORITY_HEALTH_FORMAT,
        version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
        purpose: 'full-attempt' as const,
        status: 'ready' as const,
        controlledWorkspaceAuthorityDigest:
          fullAttemptAuthorities!.controlledWorkspace.implementationDigest,
        verificationEvidenceAuthorityDigest:
          fullAttemptAuthorities!.verificationEvidence.implementationDigest,
        providerCapabilityAuthorityDigest:
          fullAttemptAuthorities!.providerCapability.implementationDigest,
        attemptGradingAuthorityDigest:
          fullAttemptAuthorities!.attemptGrading.implementationDigest,
        replayJournalImplementationDigest: input.journal.implementationDigest,
      });
  const health: AgentEvaluationProductionOwnerAuthoritySidecar['health'] =
    Object.freeze({
      ...healthBase,
      healthDigest: digestAgentCanonicalValue(healthBase),
    });
  const locks = new Map<string, Promise<void>>();
  let listenStarted = false;
  let retiring = false;
  let draining = false;
  let closePromise:
    Promise<AgentEvaluationOwnerAuthorityShutdownReceipt> | undefined;

  const exclusive = async <T>(key: string, effect: () => Promise<T>) => {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    locks.set(key, tail);
    await previous;
    try {
      return await effect();
    } finally {
      release();
      if (locks.get(key) === tail) locks.delete(key);
    }
  };

  const sealSharedEffectResult = async (
    request: AgentEvaluationOwnerAuthorityRequest,
    output: unknown,
    ownerImplementationDigest: CanonicalDigest
  ): Promise<void> => {
    const sealed = await input.attemptAuthorityResultIngress!.seal({
      request,
      response: output,
      ownerImplementationDigest,
    });
    if (
      sealed.requestDigest !== request.requestDigest ||
      sealed.responseDigest !== digestAgentCanonicalValue(output) ||
      sealed.dispatchAckDigest !==
        createAgentEvaluationAttemptAuthorityDispatchAckDigest(
          request,
          output,
          ownerImplementationDigest
        ) ||
      !isAgentCanonicalDigest(sealed.resultIngressReceiptDigest) ||
      typeof sealed.replayed !== 'boolean'
    ) {
      return fail('Shared-effect durable result ingress drifted.');
    }
  };

  const dispatch = async (request: AgentEvaluationOwnerAuthorityRequest) => {
    const g3CellAdmission = isG3CellAdmissionRequest(request);
    const ownerStateful = isOwnerStateRequest(request);
    const controlledWorkspaceStateless =
      isControlledWorkspaceStatelessRequest(request) &&
      (request.mode === 'execute' || request.mode === 'reconcile');
    const capabilityProbe = isCapabilityProbeAdmissionRequest(request);
    const capabilityProbeOwner = preplanAuthorities?.capabilityProbe;
    const capabilityProbeProviderResource =
      isCapabilityProbeProviderResourceRequest(request);
    const capabilityProbeProviderResourceOwner =
      preplanAuthorities?.capabilityProbeProviderResource;
    const capabilityProbeProviderResourceCleanup =
      isCapabilityProbeProviderResourceCleanupRequest(request);
    const capabilityProbeProviderResourceCleanupOwner =
      preplanAuthorities?.capabilityProbeProviderResourceCleanup;
    const runtimeFactSourceRegistration =
      isRuntimeFactSourceRegistrationRequest(request);
    const runtimeFactSourceRegistrationOwner =
      preplanAuthorities?.runtimeFactSourceRegistration;
    const requestPurpose =
      capabilityProbe ||
      capabilityProbeProviderResource ||
      capabilityProbeProviderResourceCleanup ||
      runtimeFactSourceRegistration
        ? 'preplan'
        : 'full-attempt';
    if (requestPurpose !== input.authorities.purpose) {
      return fail('Request purpose does not match the fixed sidecar purpose.');
    }
    const authority = (
      fullAttemptAuthorities
        ? request.serviceKind === 'controlled-workspace'
          ? fullAttemptAuthorities.controlledWorkspace
          : request.serviceKind === 'verification-evidence'
            ? fullAttemptAuthorities.verificationEvidence
            : request.serviceKind === 'provider-capability'
              ? fullAttemptAuthorities.providerCapability
              : fullAttemptAuthorities.attemptGrading
        : undefined
    ) as AgentEvaluationAttemptOwnerAuthorityPort;
    if (
      capabilityProbeProviderResourceCleanup &&
      (!capabilityProbeProviderResourceCleanupOwner ||
        !isAgentControlIdentity(
          capabilityProbeProviderResourceCleanupOwner.authorityId
        ) ||
        !isAgentCanonicalDigest(
          capabilityProbeProviderResourceCleanupOwner.implementationDigest
        ) ||
        typeof capabilityProbeProviderResourceCleanupOwner.execute !==
          'function')
    ) {
      return fail(
        'Capability probe provider resource cleanup owner is unavailable.'
      );
    }
    if (
      capabilityProbeProviderResource &&
      (!capabilityProbeProviderResourceOwner ||
        !isAgentControlIdentity(
          capabilityProbeProviderResourceOwner.authorityId
        ) ||
        !isAgentCanonicalDigest(
          capabilityProbeProviderResourceOwner.implementationDigest
        ) ||
        typeof capabilityProbeProviderResourceOwner.execute !== 'function')
    ) {
      return fail('Capability probe provider resource owner is unavailable.');
    }
    if (
      capabilityProbe &&
      (!capabilityProbeOwner ||
        !isAgentControlIdentity(capabilityProbeOwner.authorityId) ||
        !isAgentCanonicalDigest(capabilityProbeOwner.implementationDigest) ||
        typeof capabilityProbeOwner.execute !== 'function')
    ) {
      return fail('Capability probe owner is unavailable.');
    }
    if (
      runtimeFactSourceRegistration &&
      (!runtimeFactSourceRegistrationOwner ||
        typeof runtimeFactSourceRegistrationOwner.execute !== 'function' ||
        typeof runtimeFactSourceRegistrationOwner.reconcile !== 'function')
    ) {
      return fail('Runtime fact source registration owner is unavailable.');
    }
    if (capabilityProbeProviderResourceCleanup) {
      const owner = capabilityProbeProviderResourceCleanupOwner!;
      const payload = capabilityProbeProviderResourceCleanupPayload(request);
      const expectedStage =
        digestAgentCapabilityProbeProviderResourceCleanupAuthorityStage({
          cleanupRequestDigest: payload.cleanupRequest.cleanupRequestDigest,
          ownerImplementationDigest: owner.implementationDigest,
        });
      if (request.ownerImplementationDigest !== owner.implementationDigest) {
        return fail(
          'Backend-sealed provider resource cleanup owner implementation drifted.'
        );
      }
      if (request.mode === 'stage') {
        const value = capabilityProbeProviderResourceCleanupStageResponse(
          request,
          owner.implementationDigest,
          expectedStage
        );
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          value,
          input.forbiddenCanaries
        );
        return value;
      }
      if (request.stageDigest !== expectedStage) {
        return fail('Backend-sealed provider resource cleanup stage drifted.');
      }
      return exclusive(
        `provider-capability\u0000provider-resource-cleanup\u0000${request.requestDigest}`,
        async () => {
          let cleanupReceipt: AgentCapabilityProbeProviderResourceCleanupReceipt;
          let ingress: AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressResponse;
          if (request.mode === 'execute') {
            if (!input.capabilityProbeProviderResourceCleanupResultIngress) {
              return fail(
                'Capability probe provider resource cleanup result ingress is unavailable.'
              );
            }
            cleanupReceipt = await owner.execute(payload);
            if (
              !matchesCapabilityProbeProviderResourceCleanupReceipt(
                cleanupReceipt,
                payload
              )
            ) {
              return fail(
                'Capability probe provider resource cleanup receipt drifted.'
              );
            }
            const envelope =
              createAgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope(
                {
                  namespaceId: request.namespaceId,
                  repositoryCommit: request.repositoryCommit,
                  cleanupRequest: payload.cleanupRequest,
                  ownerImplementationDigest: owner.implementationDigest,
                  cleanupReceipt,
                }
              );
            ingress =
              await input.capabilityProbeProviderResourceCleanupResultIngress.seal(
                envelope
              );
          } else {
            cleanupReceipt = request.sealedProviderResourceCleanupReceipt!;
            if (
              !matchesCapabilityProbeProviderResourceCleanupReceipt(
                cleanupReceipt,
                payload
              )
            ) {
              return fail(
                'Backend-sealed provider resource cleanup receipt drifted.'
              );
            }
            const envelope =
              createAgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope(
                {
                  namespaceId: request.namespaceId,
                  repositoryCommit: request.repositoryCommit,
                  cleanupRequest: payload.cleanupRequest,
                  ownerImplementationDigest: owner.implementationDigest,
                  cleanupReceipt,
                }
              );
            const resultIngressReceiptDigest =
              digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt(
                {
                  resultIngressDigest: envelope.resultIngressDigest,
                  cleanupReceiptDigest: envelope.cleanupReceiptDigest,
                }
              );
            if (
              request.dispatchAckDigest !== envelope.dispatchAckDigest ||
              request.resultIngressDigest !== envelope.resultIngressDigest ||
              request.resultIngressReceiptDigest !== resultIngressReceiptDigest
            ) {
              return fail(
                'Backend-sealed provider resource cleanup reconciliation drifted.'
              );
            }
            ingress = Object.freeze({
              format:
                AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_RESPONSE_FORMAT,
              version:
                AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
              cleanupRequestDigest: payload.cleanupRequest.cleanupRequestDigest,
              cleanupReceiptDigest: cleanupReceipt.cleanupReceiptDigest,
              dispatchAckDigest: envelope.dispatchAckDigest,
              resultIngressDigest: envelope.resultIngressDigest,
              resultIngressReceiptDigest,
              replayed: true,
            });
          }
          const value = capabilityProbeProviderResourceCleanupResultResponse(
            request,
            cleanupReceipt,
            ingress,
            owner.implementationDigest,
            request.mode === 'reconcile'
          );
          assertProductionAgentEvaluationG3SandboxCanaryClean(
            value,
            input.forbiddenCanaries
          );
          return value;
        }
      );
    }
    if (capabilityProbeProviderResource) {
      const owner = capabilityProbeProviderResourceOwner!;
      const payload = capabilityProbeProviderResourcePayload(request);
      const expectedStage =
        digestAgentEvaluationCapabilityProbeProviderResourceStage(
          payload.requestDigest,
          owner.implementationDigest
        );
      if (request.ownerImplementationDigest !== owner.implementationDigest) {
        return fail(
          'Backend-sealed provider resource owner implementation drifted.'
        );
      }
      if (request.mode === 'stage') {
        const value = capabilityProbeProviderResourceStageResponse(
          request,
          owner.implementationDigest,
          expectedStage
        );
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          value,
          input.forbiddenCanaries
        );
        return value;
      }
      if (request.stageDigest !== expectedStage) {
        return fail('Backend-sealed provider resource stage drifted.');
      }
      return exclusive(
        `provider-capability\u0000provider-resource\u0000${request.requestDigest}`,
        async () => {
          let resourceResult: AgentEvaluationCapabilityProbeProviderResourceResult;
          let ingress: AgentEvaluationCapabilityProbeProviderResourceResultIngressResponse;
          if (request.mode === 'execute') {
            if (!input.capabilityProbeProviderResourceResultIngress) {
              return fail(
                'Capability probe provider resource result ingress is unavailable.'
              );
            }
            resourceResult = await owner.execute({
              request: payload,
              stageDigest: expectedStage,
            });
            ingress =
              await input.capabilityProbeProviderResourceResultIngress.seal({
                request: payload,
                resourceResult,
                ownerImplementationDigest: owner.implementationDigest,
                stageDigest: expectedStage,
              });
          } else {
            resourceResult = request.sealedProviderResourceResult!;
            const sealed =
              createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest(
                {
                  namespaceId: request.namespaceId,
                  repositoryCommit: request.repositoryCommit,
                  registrationRequest: payload,
                  ownerImplementationDigest: owner.implementationDigest,
                  stageDigest: expectedStage,
                  resourceResult,
                }
              );
            const resultIngressReceiptDigest =
              digestAgentEvaluationCapabilityProbeProviderResourceResultIngressReceipt(
                request.requestDigest,
                sealed.ingressDigest,
                sealed.resourceResultDigest,
                sealed.dispatchAckDigest
              );
            if (
              request.dispatchAckDigest !== sealed.dispatchAckDigest ||
              request.resultIngressDigest !== sealed.ingressDigest ||
              request.resultIngressReceiptDigest !== resultIngressReceiptDigest
            ) {
              return fail(
                'Backend-sealed provider resource reconciliation drifted.'
              );
            }
            ingress = Object.freeze({
              format:
                AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESULT_INGRESS_RESPONSE_FORMAT,
              version:
                AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
              requestDigest: request.requestDigest,
              ingressDigest: sealed.ingressDigest,
              resourceResultDigest: sealed.resourceResultDigest,
              dispatchAckDigest: sealed.dispatchAckDigest,
              resultIngressReceiptDigest,
              replayed: true,
            });
          }
          const value = capabilityProbeProviderResourceResultResponse(
            request,
            resourceResult,
            ingress,
            owner.implementationDigest,
            request.mode === 'reconcile'
          );
          assertProductionAgentEvaluationG3SandboxCanaryClean(
            value,
            input.forbiddenCanaries
          );
          return value;
        }
      );
    }
    if (
      (g3CellAdmission ||
        controlledWorkspaceStateless ||
        ownerStateful ||
        capabilityProbe ||
        runtimeFactSourceRegistration ||
        (request.serviceKind === 'provider-capability' &&
          !runtimeFactSourceRegistration) ||
        request.serviceKind === 'attempt-grading') &&
      request.ownerImplementationDigest !==
        (runtimeFactSourceRegistration
          ? runtimeFactSourceRegistrationOwner!.implementationDigest
          : capabilityProbe
            ? capabilityProbeOwner!.implementationDigest
            : authority.implementationDigest)
    ) {
      return fail('Backend-sealed owner implementation binding drifted.');
    }
    if (request.mode === 'read') {
      if (
        request.serviceKind !== 'controlled-workspace' &&
        request.serviceKind !== 'verification-evidence'
      ) {
        return fail('Attempt authority read is unavailable.');
      }
      const output =
        request.serviceKind === 'controlled-workspace'
          ? await fullAttemptAuthorities!.controlledWorkspace.read(request)
          : await fullAttemptAuthorities!.verificationEvidence.read(request);
      const value = responseBase(request, output);
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        value,
        input.forbiddenCanaries
      );
      return value;
    }
    if (request.mode === 'stage') {
      if (
        !g3CellAdmission &&
        !ownerStateful &&
        request.serviceKind !== 'provider-capability' &&
        request.serviceKind !== 'attempt-grading'
      ) {
        return fail('Owner stage route is unavailable.');
      }
      const stageDigest = runtimeFactSourceRegistration
        ? digestAgentEvaluationRuntimeFactSourceRegistrationStage(
            runtimeFactSourceRegistrationPayload(request),
            request.registrationAuthorityIssuerId!
          )
        : capabilityProbe
          ? digestAgentEvaluationCapabilityProbeAdmissionStage(
              capabilityProbeAdmissionPayload(request),
              capabilityProbeOwner!.implementationDigest
            )
          : ownerStateful
            ? digestAgentEvaluationOwnerStateStage({
                serviceKind: request.serviceKind as
                  'controlled-workspace' | 'verification-evidence',
                operation: request.operation,
                routeBinding: request.routeBinding,
                requestDigest: request.requestDigest,
                ownerImplementationDigest: authority.implementationDigest,
                ownerStateId: createAgentEvaluationOwnerStateIdentity(
                  ownerStateIdentityInput(request)
                ),
                priorOwnerStateRevision:
                  ownerStatePriorForRequest(request).revision,
                priorOwnerStateRootDigest:
                  ownerStatePriorForRequest(request).rootDigest,
              })
            : await authority.stage(request);
      const value = runtimeFactSourceRegistration
        ? runtimeFactSourceRegistrationStageResponse(request, stageDigest)
        : capabilityProbe
          ? capabilityProbeAdmissionStageResponse(
              request,
              capabilityProbeOwner!.implementationDigest,
              stageDigest
            )
          : ownerStateful
            ? ownerStateStageResponse(
                request,
                authority.implementationDigest,
                stageDigest
              )
            : g3CellAdmission
              ? g3CellAdmissionStageResponse(
                  request,
                  authority.implementationDigest,
                  stageDigest
                )
              : attemptAuthorityStageResponse(
                  request,
                  authority.implementationDigest,
                  stageDigest
                );
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        value,
        input.forbiddenCanaries
      );
      return value;
    }
    if (
      (runtimeFactSourceRegistration &&
        request.stageDigest !==
          digestAgentEvaluationRuntimeFactSourceRegistrationStage(
            runtimeFactSourceRegistrationPayload(request),
            request.registrationAuthorityIssuerId!
          )) ||
      (capabilityProbe &&
        request.stageDigest !==
          digestAgentEvaluationCapabilityProbeAdmissionStage(
            capabilityProbeAdmissionPayload(request),
            capabilityProbeOwner!.implementationDigest
          )) ||
      (g3CellAdmission &&
        request.stageDigest !==
          digestAgentEvaluationControlledWorkspaceG3AdmissionStage(
            g3CellAdmissionPayload(request),
            authority.implementationDigest
          )) ||
      (ownerStateful &&
        request.stageDigest !==
          digestAgentEvaluationOwnerStateStage({
            serviceKind: request.serviceKind as
              'controlled-workspace' | 'verification-evidence',
            operation: request.operation,
            routeBinding: request.routeBinding,
            requestDigest: request.requestDigest,
            ownerImplementationDigest: authority.implementationDigest,
            ownerStateId: createAgentEvaluationOwnerStateIdentity(
              ownerStateIdentityInput(request)
            ),
            priorOwnerStateRevision:
              request.mode === 'reconcile'
                ? (
                    request.sealedOwnerOperation as AgentEvaluationOwnerStateSealedOperation
                  ).priorOwnerStateRevision
                : ownerStatePriorForRequest(request).revision,
            priorOwnerStateRootDigest:
              request.mode === 'reconcile'
                ? (
                    request.sealedOwnerOperation as AgentEvaluationOwnerStateSealedOperation
                  ).priorOwnerStateRootDigest
                : ownerStatePriorForRequest(request).rootDigest,
          })) ||
      (controlledWorkspaceStateless &&
        request.stageDigest !==
          createAgentEvaluationControlledWorkspaceDirectStageDigest(
            request,
            authority.implementationDigest
          )) ||
      (!runtimeFactSourceRegistration &&
        !capabilityProbe &&
        !ownerStateful &&
        (request.serviceKind === 'provider-capability' ||
          request.serviceKind === 'attempt-grading') &&
        request.stageDigest !==
          createAgentEvaluationAttemptAuthorityDispatchStageDigest(
            request,
            authority.implementationDigest
          ))
    ) {
      return fail('Backend-sealed owner stage binding drifted.');
    }
    const binding = requestBinding(
      request,
      runtimeFactSourceRegistration
        ? {
            authorityId:
              runtimeFactSourceRegistrationPayload(request).sourceAuthorityId,
            implementationDigest:
              runtimeFactSourceRegistrationPayload(request)
                .sourceAuthorityImplementationDigest,
          }
        : capabilityProbe
          ? capabilityProbeOwner!
          : authority
    );
    const sharedEffectResult =
      request.serviceKind === 'provider-capability' &&
      request.operation === 'tool.execute' &&
      isPlainObject(request.payload) &&
      request.payload.executionAuthorityKind === 'shared-effect';
    if (sharedEffectResult && !input.attemptAuthorityResultIngress) {
      return fail('Shared-effect durable result ingress is unavailable.');
    }
    return exclusive(
      `${binding.serviceKind}\u0000${binding.requestDigest}`,
      async () => {
        let record = await input.journal.claim(binding);
        let output: unknown;
        let reconciled = false;
        let stagedForExecute = false;
        if (record.state === 'claimed') {
          const dispatchReceiptDigest =
            runtimeFactSourceRegistration ||
            capabilityProbe ||
            g3CellAdmission ||
            controlledWorkspaceStateless ||
            ownerStateful ||
            (request.mode === 'reconcile' &&
              (request.serviceKind === 'provider-capability' ||
                request.serviceKind === 'attempt-grading'))
              ? request.stageDigest!
              : await authority.stage(request);
          if (!isAgentCanonicalDigest(dispatchReceiptDigest)) {
            return fail('Owner staging receipt is invalid.');
          }
          if (
            (g3CellAdmission ||
              controlledWorkspaceStateless ||
              ownerStateful ||
              (request.serviceKind === 'provider-capability' &&
                !runtimeFactSourceRegistration) ||
              request.serviceKind === 'attempt-grading') &&
            dispatchReceiptDigest !== request.stageDigest
          ) {
            return fail('Owner staging receipt drifted from Backend seal.');
          }
          record = await input.journal.markDispatched(
            binding,
            dispatchReceiptDigest
          );
          stagedForExecute =
            request.mode === 'execute' && record.state === 'dispatched';
        }
        if (!stagedForExecute || request.mode === 'reconcile') {
          const observed =
            capabilityProbe || runtimeFactSourceRegistration
              ? undefined
              : ownerStateful
                ? request.serviceKind === 'verification-evidence'
                  ? await fullAttemptAuthorities!.verificationEvidence.reconcile(
                      request
                    )
                  : undefined
                : await authority.reconcile(request);
          if (runtimeFactSourceRegistration) {
            const recovered = request.sealedOwnerHealth
              ? runtimeFactSourceRegistrationResultFromSealedHealth(request)
              : await runtimeFactSourceRegistrationOwner!.reconcile({
                  request: runtimeFactSourceRegistrationPayload(request),
                  registrationAuthorityIssuerId:
                    request.registrationAuthorityIssuerId!,
                  stageDigest: request.stageDigest!,
                });
            if (!recovered) {
              return fail(
                'Runtime fact source registration reconciliation is incomplete.'
              );
            }
            output = runtimeFactSourceRegistrationResult(request, recovered);
            reconciled = true;
          } else if (capabilityProbe) {
            output = capabilityProbeSealedObservationResult(
              request,
              request.sealedProbeObservation,
              capabilityProbeOwner!.implementationDigest
            );
            reconciled = true;
          } else if (ownerStateful) {
            const transition = statefulTransitionFromSealedRequest(request);
            if (request.serviceKind === 'verification-evidence') {
              const verificationObserved = observed as
                | Readonly<{ response: unknown; reconciled: boolean }>
                | undefined;
              if (
                verificationObserved?.reconciled !== true ||
                !matchAgentEvaluationVerificationEvidencePublicResponse(
                  transition.publicResult,
                  verificationObserved.response
                )
              ) {
                return fail(
                  'Verification owner state reconciliation is incomplete.'
                );
              }
              output = Object.freeze({
                transition,
                response: verificationObserved.response,
              });
            } else {
              output = Object.freeze({ transition });
            }
            reconciled = true;
          } else {
            output =
              request.serviceKind === 'controlled-workspace'
                ? g3CellAdmission
                  ? g3CellAdmissionResult(
                      request,
                      (observed as unknown as { facts: readonly unknown[] })
                        .facts,
                      authority.implementationDigest
                    )
                  : (observed as unknown as { facts: readonly unknown[] }).facts
                : (observed as { response: unknown }).response;
            reconciled = observed!.reconciled;
          }
          if (
            reconciled &&
            request.mode === 'reconcile' &&
            ((runtimeFactSourceRegistration &&
              request.dispatchAckDigest !== undefined &&
              request.dispatchAckDigest !==
                runtimeFactSourceRegistrationDispatchAck(
                  request,
                  output as AgentEvaluationRuntimeFactSourceRegistrationAuthorityResult
                )) ||
              (capabilityProbe &&
                request.dispatchAckDigest !==
                  digestAgentEvaluationCapabilityProbeDispatchAck(
                    capabilityProbeAdmissionPayload(request),
                    output as AgentEvaluationCapabilityProbeAdmissionAuthorityResult,
                    capabilityProbeOwner!.implementationDigest,
                    request.stageDigest!
                  )) ||
              (g3CellAdmission &&
                request.dispatchAckDigest !==
                  (
                    output as AgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult
                  ).dispatchAckDigest) ||
              (ownerStateful &&
                request.dispatchAckDigest !==
                  (
                    output as Readonly<{
                      transition: AgentEvaluationOwnerStateTransition;
                    }>
                  ).transition.dispatchAckDigest) ||
              (controlledWorkspaceStateless &&
                request.dispatchAckDigest !==
                  createAgentEvaluationControlledWorkspaceDirectDispatchAckDigest(
                    request,
                    exactFacts(output as readonly unknown[]),
                    authority.implementationDigest,
                    request.stageDigest!
                  )) ||
              (!runtimeFactSourceRegistration &&
                !capabilityProbe &&
                !g3CellAdmission &&
                !ownerStateful &&
                (request.serviceKind === 'provider-capability' ||
                  request.serviceKind === 'attempt-grading') &&
                request.dispatchAckDigest !== undefined &&
                request.dispatchAckDigest !==
                  createAgentEvaluationAttemptAuthorityDispatchAckDigest(
                    request,
                    output,
                    authority.implementationDigest
                  )))
          ) {
            return fail('Backend-sealed dispatch acknowledgement drifted.');
          }
          if (
            record.state === 'accepted' &&
            (!reconciled ||
              record.responseDigest !== responseDigest(request, output))
          ) {
            return fail('Durable owner reconciliation drifted.');
          }
          if (record.state === 'dispatched' && reconciled) {
            assertProductionAgentEvaluationG3SandboxCanaryClean(
              output,
              input.forbiddenCanaries
            );
            if (sharedEffectResult) {
              await sealSharedEffectResult(
                request,
                output,
                authority.implementationDigest
              );
            }
            record = await input.journal.accept(
              binding,
              responseDigest(request, output)
            );
          }
          if (request.mode === 'execute' && !reconciled) {
            return fail('Dispatched owner reconciliation is incomplete.');
          }
        } else {
          const executed = runtimeFactSourceRegistration
            ? await runtimeFactSourceRegistrationOwner!.execute({
                request: runtimeFactSourceRegistrationPayload(request),
                registrationAuthorityIssuerId:
                  request.registrationAuthorityIssuerId!,
                stageDigest: request.stageDigest!,
              })
            : capabilityProbe
              ? await capabilityProbeOwner!.execute({
                  request: capabilityProbeAdmissionPayload(request),
                  stageDigest: request.stageDigest!,
                })
              : await authority.execute(request);
          output = runtimeFactSourceRegistration
            ? runtimeFactSourceRegistrationResult(request, executed)
            : capabilityProbe
              ? capabilityProbeAdmissionResult(
                  request,
                  executed,
                  capabilityProbeOwner!.implementationDigest
                )
              : ownerStateful
                ? decodeOwnerStateExecution(
                    request,
                    executed,
                    authority.implementationDigest
                  )
                : g3CellAdmission
                  ? g3CellAdmissionResult(
                      request,
                      executed,
                      authority.implementationDigest
                    )
                  : executed;
          assertProductionAgentEvaluationG3SandboxCanaryClean(
            output,
            input.forbiddenCanaries
          );
          if (sharedEffectResult) {
            await sealSharedEffectResult(
              request,
              output,
              authority.implementationDigest
            );
          }
          record = await input.journal.accept(
            binding,
            responseDigest(request, output)
          );
        }
        const value = responseBase(
          request,
          output,
          capabilityProbe
            ? capabilityProbeOwner!.implementationDigest
            : runtimeFactSourceRegistration
              ? runtimeFactSourceRegistrationOwner!.implementationDigest
              : authority.implementationDigest,
          reconciled
        );
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          value,
          input.forbiddenCanaries
        );
        return value;
      }
    );
  };

  return Object.freeze({
    health,
    async listen({ host, port }) {
      if (
        listenStarted ||
        closePromise !== undefined ||
        (host !== '127.0.0.1' && host !== '::1') ||
        !Number.isSafeInteger(port) ||
        port < 0 ||
        port > 65_535
      ) {
        return fail('Listen address must be numeric loopback.');
      }
      listenStarted = true;
      const server = createServer(async (request, response) => {
        try {
          if (draining) {
            sendUnavailable(response);
            return;
          }
          if (
            request.url === '/healthz' &&
            request.method === 'GET' &&
            !retiring &&
            request.headers['content-length'] === undefined &&
            request.headers['transfer-encoding'] === undefined
          ) {
            sendJson(response, 200, health);
            return;
          }
          const url = request.url
            ? new URL(request.url, 'http://sidecar')
            : undefined;
          const route = url ? routeFor(url.pathname) : undefined;
          if (
            request.method !== 'POST' ||
            !url ||
            url.search !== '' ||
            !route ||
            request.headers['content-type'] !== 'application/json' ||
            !authorized(request, credential)
          ) {
            sendUnavailable(response);
            return;
          }
          const body = await readBody(request);
          try {
            const parsed = parseJson(body);
            const authorityRequest = assertRequest(parsed, route);
            if (
              retiring &&
              !isCapabilityProbeProviderResourceCleanupRequest(authorityRequest)
            ) {
              return sendUnavailable(response);
            }
            assertProductionAgentEvaluationG3SandboxCanaryClean(
              authorityRequest,
              input.forbiddenCanaries
            );
            if (
              request.headers['idempotency-key'] !==
              authorityRequest.requestDigest
            ) {
              return sendUnavailable(response);
            }
            sendJson(response, 200, await dispatch(authorityRequest));
          } finally {
            body.fill(0);
          }
        } catch {
          if (!response.headersSent) sendUnavailable(response);
          else response.destroy();
        }
      });
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen({ host, port, exclusive: true }, () => {
          server.off('error', reject);
          resolve();
        });
      });
      const address = server.address();
      if (!address || typeof address === 'string') {
        await closeServer(server);
        credential.fill(0);
        return fail('Sidecar listen address is unavailable.');
      }
      const displayHost = host === '::1' ? '[::1]' : host;
      return Object.freeze({
        baseUrl: `http://${displayHost}:${address.port}`,
        async close() {
          if (!closePromise) {
            retiring = true;
            closePromise = (async () => {
              const retirement = assertResourceRetirementReceipt(
                await input.authorities.close(),
                input.authorities
              );
              assertProductionAgentEvaluationG3SandboxCanaryClean(
                retirement,
                input.forbiddenCanaries
              );
              draining = true;
              const closing = closeServer(server);
              server.closeIdleConnections();
              await closing;
              const receipt =
                createAgentEvaluationOwnerAuthorityShutdownReceipt(
                  health,
                  retirement
                );
              assertProductionAgentEvaluationG3SandboxCanaryClean(
                receipt,
                input.forbiddenCanaries
              );
              credential.fill(0);
              return receipt;
            })().catch((caught: unknown) => {
              closePromise = undefined;
              throw caught;
            });
          }
          return closePromise;
        },
      });
    },
  });
};
