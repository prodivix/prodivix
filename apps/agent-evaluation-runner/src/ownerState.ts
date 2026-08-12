import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  createVerificationEvidenceStatementDigest,
  type VerificationEvidenceStatement,
} from '@prodivix/verification';
import { containsAsciiControlCharacter } from './textSafety';
import type { AgentEvaluationControlledWorkspaceCheckpoint } from './controlledWorkspaceRuntime';

export const AGENT_EVALUATION_OWNER_STATE_VERSION = 1 as const;
export const AGENT_EVALUATION_OWNER_STATE_IDENTITY_FORMAT =
  'prodivix.agent-evaluation-owner-state-identity' as const;
export const AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT =
  'prodivix.agent-evaluation-owner-state-bundle' as const;
export const AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT =
  'prodivix.agent-evaluation-owner-state-operation-record' as const;
export const AGENT_EVALUATION_OWNER_STATE_STAGE_FORMAT =
  'prodivix.agent-evaluation-owner-state-stage' as const;
export const AGENT_EVALUATION_OWNER_STATE_DISPATCH_ACK_FORMAT =
  'prodivix.agent-evaluation-owner-state-dispatch-ack' as const;
export const AGENT_EVALUATION_SEALED_OWNER_OPERATION_FORMAT =
  'prodivix.agent-evaluation-sealed-owner-operation' as const;
export const AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT =
  'prodivix.agent-evaluation-owner-state-cas-descriptor' as const;

export const AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT =
  'prodivix.agent-evaluation-controlled-workspace-owner-state-snapshot' as const;
export const AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT =
  'prodivix.agent-evaluation-verification-evidence-owner-state-snapshot' as const;
export const AGENT_EVALUATION_VERIFICATION_EVIDENCE_PUBLIC_RESULT_FORMAT =
  'prodivix.agent-evaluation-verification-evidence-public-result' as const;

export const AGENT_EVALUATION_CONTROLLED_OWNER_STATE_MAXIMUM_BYTES =
  25_165_824 as const;
export const AGENT_EVALUATION_VERIFICATION_OWNER_STATE_MAXIMUM_BYTES =
  7_864_320 as const;
export const AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACTS = 128 as const;
export const AGENT_EVALUATION_OWNER_STATE_MAXIMUM_RECENT_OPERATIONS =
  4 as const;
export const AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACT_BYTES =
  8_388_608 as const;

export type AgentEvaluationOwnerStateServiceKind =
  'controlled-workspace' | 'verification-evidence';

export type AgentEvaluationOwnerStateIdentityInput = Readonly<{
  serviceKind: AgentEvaluationOwnerStateServiceKind;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  generation: number;
  grantOrAuthorityDigest: CanonicalDigest;
}>;

export type AgentEvaluationOwnerStateOperationRecord = Readonly<{
  format: typeof AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT;
  version: typeof AGENT_EVALUATION_OWNER_STATE_VERSION;
  sequence: number;
  operation: string;
  routeBinding: string;
  requestDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  recordDigest: CanonicalDigest;
}>;

export type AgentEvaluationOwnerStateCASDescriptor = Readonly<{
  format: typeof AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT;
  version: typeof AGENT_EVALUATION_OWNER_STATE_VERSION;
  artifactRef: string;
  artifactKind: string;
  mediaType: string;
  artifactDigest: CanonicalDigest;
  byteLength: number;
  casReceiptDigest: CanonicalDigest;
  descriptorDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceOwnerStateSnapshot = Readonly<{
  format: typeof AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT;
  version: typeof AGENT_EVALUATION_OWNER_STATE_VERSION;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  fixtureDigest: CanonicalDigest;
  grantDigest: CanonicalDigest;
  generation: number;
  sessionId: string;
  isolationPolicyDigest: CanonicalDigest;
  revision: number;
  state: 'active' | 'destroyed';
  initialCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint | null;
  initialCheckpointDigest: CanonicalDigest | null;
  currentCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint | null;
  currentCheckpointDigest: CanonicalDigest | null;
  workspaceSnapshot: unknown;
  workspaceSnapshotDigest: CanonicalDigest;
  toolDefinitions: readonly unknown[];
  toolDefinitionSetDigest: CanonicalDigest;
  actionRegistry: unknown;
  actionRegistryDigest: CanonicalDigest;
  g3VerificationPlan: unknown;
  verificationPlanDigest: CanonicalDigest;
  adapterRegistry: unknown;
  adapterRegistryDigest: CanonicalDigest;
  finalWorkspaceSnapshotDigest: CanonicalDigest | null;
  artifactDescriptors: readonly unknown[];
  artifactDescriptorSetDigest: CanonicalDigest;
  finalAuthorityReceiptDigest: CanonicalDigest | null;
  cleanupReceiptDigest: CanonicalDigest | null;
  snapshotDigest: CanonicalDigest;
}>;

export type AgentEvaluationVerificationEvidenceOwnerStateSnapshot = Readonly<{
  format: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT;
  version: typeof AGENT_EVALUATION_OWNER_STATE_VERSION;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  generation: number;
  authorityDigest: CanonicalDigest;
  sandboxRegistrationReceiptDigest: CanonicalDigest;
  revision: number;
  state: 'registered' | 'active' | 'prepared' | 'finalized' | 'destroyed';
  promotionId: string | null;
  evidenceId: string | null;
  projectId: string | null;
  workspaceId: string | null;
  workspaceRevision: number;
  verificationPlanDigest: CanonicalDigest;
  adapterRegistryDigest: CanonicalDigest;
  candidate: unknown | null;
  candidateDigest: CanonicalDigest | null;
  createdAt: string | null;
  deadlineAt: string | null;
  uploadCapabilityDigest: CanonicalDigest;
  attestationNonceDigest: CanonicalDigest | null;
  attestationStatement: unknown | null;
  attestationStatementDigest: CanonicalDigest | null;
  uploadedArtifactManifests: readonly unknown[] | null;
  artifactManifestSetDigest: CanonicalDigest | null;
  verifiedClaims: readonly unknown[] | null;
  verifiedClaimSetDigest: CanonicalDigest | null;
  finalManifest: unknown | null;
  finalManifestDigest: CanonicalDigest | null;
  evidenceRecords: readonly unknown[] | null;
  evidenceRecordSetDigest: CanonicalDigest | null;
  snapshotDigest: CanonicalDigest;
}>;

export type AgentEvaluationOwnerStateSnapshot =
  | AgentEvaluationControlledWorkspaceOwnerStateSnapshot
  | AgentEvaluationVerificationEvidenceOwnerStateSnapshot;

export type AgentEvaluationOwnerStateBundle = Readonly<{
  format: typeof AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT;
  version: typeof AGENT_EVALUATION_OWNER_STATE_VERSION;
  serviceKind: AgentEvaluationOwnerStateServiceKind;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  ownerStateId: CanonicalDigest;
  revision: number;
  previousOwnerStateRootDigest: CanonicalDigest | null;
  snapshotKind: AgentEvaluationOwnerStateServiceKind;
  snapshot: AgentEvaluationOwnerStateSnapshot;
  snapshotDigest: CanonicalDigest;
  casArtifacts: readonly AgentEvaluationOwnerStateCASDescriptor[];
  casArtifactSetDigest: CanonicalDigest;
  recentOperations: readonly AgentEvaluationOwnerStateOperationRecord[];
  recentOperationSetDigest: CanonicalDigest;
}>;

export type AgentEvaluationOwnerStatePrior = Readonly<{
  ownerStateId: CanonicalDigest;
  revision: number;
  bundle: AgentEvaluationOwnerStateBundle | null;
  rootDigest: CanonicalDigest | null;
}>;

export type AgentEvaluationOwnerStateSealedOperation = Readonly<{
  format: typeof AGENT_EVALUATION_SEALED_OWNER_OPERATION_FORMAT;
  version: typeof AGENT_EVALUATION_OWNER_STATE_VERSION;
  serviceKind: AgentEvaluationOwnerStateServiceKind;
  operation: string;
  routeBinding: string;
  requestDigest: CanonicalDigest;
  ownerImplementationDigest: CanonicalDigest;
  ownerStateId: CanonicalDigest;
  priorOwnerStateRevision: number;
  priorOwnerStateRootDigest: CanonicalDigest | null;
  stageDigest: CanonicalDigest;
  publicResult: unknown;
  responseDigest: CanonicalDigest;
  ownerStateRevision: number;
  ownerStateRootDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  resultReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationOwnerStateTransition =
  AgentEvaluationOwnerStateSealedOperation &
    Readonly<{
      ownerStateBundle: AgentEvaluationOwnerStateBundle;
    }>;

export type AgentEvaluationVerificationEvidencePublicResult = Readonly<{
  format: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_PUBLIC_RESULT_FORMAT;
  version: typeof AGENT_EVALUATION_OWNER_STATE_VERSION;
  operation:
    | 'promotion.create'
    | 'artifact.upload'
    | 'promotion.prepare'
    | 'promotion.final-commit';
  requestDigest: CanonicalDigest;
  responseReceiptDigest: CanonicalDigest;
  responseProjection: unknown;
  responseProjectionDigest: CanonicalDigest;
}>;

const exactCommitPattern = /^[a-f0-9]{40}$/u;
const exactMediaTypePattern =
  /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[\x20-\x7e]+)?$/u;
const textEncoder = new TextEncoder();

const fail = (message: string): never => {
  throw new TypeError(`G4_OWNER_STATE_INVALID: ${message}`);
};

const exactRecord = (
  value: unknown,
  required: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && required.includes(key)
  );

const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

const nonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const safeText = (value: unknown, maximum = 1_024): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= maximum &&
  value === value.trim() &&
  !containsAsciiControlCharacter(value);

const nullableDigest = (value: unknown): value is CanonicalDigest | null =>
  value === null || isAgentCanonicalDigest(value);

const canonicalProjectionMatches = (
  value: unknown,
  digest: unknown
): digest is CanonicalDigest =>
  isAgentCanonicalDigest(digest) && digestAgentCanonicalValue(value) === digest;

const verificationStatementMatches = (
  value: unknown,
  digest: unknown
): digest is CanonicalDigest => {
  if (!isAgentCanonicalDigest(digest)) return false;
  try {
    return (
      createVerificationEvidenceStatementDigest(
        value as VerificationEvidenceStatement
      ) === digest
    );
  } catch {
    return false;
  }
};

const selfDigestMatches = (
  value: Record<string, unknown>,
  digestKey: string
): boolean => {
  const digest = value[digestKey];
  if (!isAgentCanonicalDigest(digest)) return false;
  const base = Object.freeze(
    Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== digestKey)
    )
  );
  return digestAgentCanonicalValue(base) === digest;
};

const sortedUniqueBy = (values: readonly unknown[], key: string): boolean => {
  let previous: string | undefined;
  for (const value of values) {
    if (!isPlainObject(value) || !safeText(value[key])) return false;
    const current = value[key] as string;
    if (
      previous !== undefined &&
      compareUnicodeCodePoints(previous, current) >= 0
    ) {
      return false;
    }
    previous = current;
  }
  return true;
};

const identityBase = (input: AgentEvaluationOwnerStateIdentityInput) => {
  if (
    (input.serviceKind !== 'controlled-workspace' &&
      input.serviceKind !== 'verification-evidence') ||
    !isAgentControlIdentity(input.namespaceId) ||
    !isAgentCanonicalDigest(input.planDigest) ||
    !exactCommitPattern.test(input.repositoryCommit) ||
    !isAgentControlIdentity(input.attemptId) ||
    !isAgentCanonicalDigest(input.descriptorDigest) ||
    !positiveInteger(input.generation) ||
    !isAgentCanonicalDigest(input.grantOrAuthorityDigest)
  ) {
    return fail('Owner state identity is invalid.');
  }
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_IDENTITY_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: input.serviceKind,
    namespaceId: input.namespaceId,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    ...(input.serviceKind === 'controlled-workspace'
      ? { grantDigest: input.grantOrAuthorityDigest }
      : { authorityDigest: input.grantOrAuthorityDigest }),
    generation: input.generation,
  });
};

export const createAgentEvaluationOwnerStateIdentity = (
  input: AgentEvaluationOwnerStateIdentityInput
): CanonicalDigest => digestAgentCanonicalValue(identityBase(input));

const controlledOperationBindings = Object.freeze({
  'session.load-or-reattach': 'sessions/load-or-reattach',
  'session.preflight': 'sessions/{sessionId}/preflight',
  'session.restore-checkpoint': 'sessions/{sessionId}/restore-checkpoint',
  'session.execute': 'sessions/{sessionId}/execute',
  'session.reconcile-dispatched': 'sessions/{sessionId}/reconcile-dispatched',
  'session.artifact.resolve': 'sessions/{sessionId}/artifacts/resolve',
  'session.assess-final': 'sessions/{sessionId}/assess-final',
  'session.destroy': 'sessions/{sessionId}/destroy',
} as const);

const verificationOperationBindings = Object.freeze({
  'promotion.create': 'promotions',
  'artifact.upload': 'promotions/{promotionId}/artifacts/{artifactId}',
  'promotion.prepare': 'promotions/{promotionId}/prepare',
  'promotion.final-commit': 'promotions/{promotionId}/final-commit',
} as const);

export const isAgentEvaluationOwnerStatefulOperation = (
  serviceKind: string,
  operation: string,
  routeBinding: string
): serviceKind is AgentEvaluationOwnerStateServiceKind => {
  const bindings =
    serviceKind === 'controlled-workspace'
      ? controlledOperationBindings
      : serviceKind === 'verification-evidence'
        ? verificationOperationBindings
        : undefined;
  return (
    bindings !== undefined &&
    Object.hasOwn(bindings, operation) &&
    bindings[operation as keyof typeof bindings] === routeBinding
  );
};

export const digestAgentEvaluationOwnerStateStage = (input: {
  serviceKind: AgentEvaluationOwnerStateServiceKind;
  operation: string;
  routeBinding: string;
  requestDigest: CanonicalDigest;
  ownerImplementationDigest: CanonicalDigest;
  ownerStateId: CanonicalDigest;
  priorOwnerStateRevision: number;
  priorOwnerStateRootDigest: CanonicalDigest | null;
}): CanonicalDigest => {
  if (
    !isAgentEvaluationOwnerStatefulOperation(
      input.serviceKind,
      input.operation,
      input.routeBinding
    ) ||
    !isAgentCanonicalDigest(input.requestDigest) ||
    !isAgentCanonicalDigest(input.ownerImplementationDigest) ||
    !isAgentCanonicalDigest(input.ownerStateId) ||
    !nonNegativeInteger(input.priorOwnerStateRevision) ||
    !nullableDigest(input.priorOwnerStateRootDigest) ||
    (input.priorOwnerStateRevision === 0
      ? input.priorOwnerStateRootDigest !== null
      : input.priorOwnerStateRootDigest === null)
  ) {
    return fail('Owner state stage binding is invalid.');
  }
  return digestAgentCanonicalValue({
    format: AGENT_EVALUATION_OWNER_STATE_STAGE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: input.serviceKind,
    operation: input.operation,
    routeBinding: input.routeBinding,
    requestDigest: input.requestDigest,
    ownerImplementationDigest: input.ownerImplementationDigest,
    ownerStateId: input.ownerStateId,
    priorOwnerStateRevision: input.priorOwnerStateRevision,
    priorOwnerStateRootDigest: input.priorOwnerStateRootDigest,
  });
};

export const digestAgentEvaluationOwnerStateDispatchAck = (input: {
  serviceKind: AgentEvaluationOwnerStateServiceKind;
  operation: string;
  routeBinding: string;
  requestDigest: CanonicalDigest;
  ownerImplementationDigest: CanonicalDigest;
  ownerStateId: CanonicalDigest;
  priorOwnerStateRevision: number;
  priorOwnerStateRootDigest: CanonicalDigest | null;
  stageDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  ownerStateRevision: number;
  ownerStateRootDigest: CanonicalDigest;
}): CanonicalDigest => {
  digestAgentEvaluationOwnerStateStage(input);
  if (
    !isAgentCanonicalDigest(input.stageDigest) ||
    !isAgentCanonicalDigest(input.responseDigest) ||
    input.ownerStateRevision !== input.priorOwnerStateRevision + 1 ||
    !isAgentCanonicalDigest(input.ownerStateRootDigest)
  ) {
    return fail('Owner state dispatch acknowledgement is invalid.');
  }
  return digestAgentCanonicalValue({
    format: AGENT_EVALUATION_OWNER_STATE_DISPATCH_ACK_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: input.serviceKind,
    operation: input.operation,
    routeBinding: input.routeBinding,
    requestDigest: input.requestDigest,
    ownerImplementationDigest: input.ownerImplementationDigest,
    ownerStateId: input.ownerStateId,
    priorOwnerStateRevision: input.priorOwnerStateRevision,
    priorOwnerStateRootDigest: input.priorOwnerStateRootDigest,
    stageDigest: input.stageDigest,
    responseDigest: input.responseDigest,
    ownerStateRevision: input.ownerStateRevision,
    ownerStateRootDigest: input.ownerStateRootDigest,
  });
};

const decodeOperationRecord = (
  value: unknown
): AgentEvaluationOwnerStateOperationRecord => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'sequence',
      'operation',
      'routeBinding',
      'requestDigest',
      'stageDigest',
      'responseDigest',
      'recordDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_STATE_VERSION ||
    !positiveInteger(value.sequence) ||
    !isAgentControlIdentity(value.operation) ||
    !safeText(value.routeBinding) ||
    !isAgentCanonicalDigest(value.requestDigest) ||
    !isAgentCanonicalDigest(value.stageDigest) ||
    !isAgentCanonicalDigest(value.responseDigest) ||
    !selfDigestMatches(value, 'recordDigest')
  ) {
    return fail('Owner state operation record is invalid.');
  }
  return Object.freeze({
    ...value,
  }) as AgentEvaluationOwnerStateOperationRecord;
};

export const decodeAgentEvaluationOwnerStateCASDescriptor = (
  value: unknown
): AgentEvaluationOwnerStateCASDescriptor => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'artifactRef',
      'artifactKind',
      'mediaType',
      'artifactDigest',
      'byteLength',
      'casReceiptDigest',
      'descriptorDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_STATE_VERSION ||
    !isAgentControlIdentity(value.artifactRef) ||
    !isAgentControlIdentity(value.artifactKind) ||
    typeof value.mediaType !== 'string' ||
    !exactMediaTypePattern.test(value.mediaType) ||
    !isAgentCanonicalDigest(value.artifactDigest) ||
    !nonNegativeInteger(value.byteLength) ||
    value.byteLength >
      AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACT_BYTES ||
    !isAgentCanonicalDigest(value.casReceiptDigest) ||
    !selfDigestMatches(value, 'descriptorDigest')
  ) {
    return fail('Owner state CAS descriptor is invalid.');
  }
  return Object.freeze({ ...value }) as AgentEvaluationOwnerStateCASDescriptor;
};

const controlledSnapshotKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'caseId',
  'materialDigest',
  'fixtureDigest',
  'grantDigest',
  'generation',
  'sessionId',
  'isolationPolicyDigest',
  'revision',
  'state',
  'initialCheckpoint',
  'initialCheckpointDigest',
  'currentCheckpoint',
  'currentCheckpointDigest',
  'workspaceSnapshot',
  'workspaceSnapshotDigest',
  'toolDefinitions',
  'toolDefinitionSetDigest',
  'actionRegistry',
  'actionRegistryDigest',
  'g3VerificationPlan',
  'verificationPlanDigest',
  'adapterRegistry',
  'adapterRegistryDigest',
  'finalWorkspaceSnapshotDigest',
  'artifactDescriptors',
  'artifactDescriptorSetDigest',
  'finalAuthorityReceiptDigest',
  'cleanupReceiptDigest',
  'snapshotDigest',
]);

const verificationSnapshotKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'generation',
  'authorityDigest',
  'sandboxRegistrationReceiptDigest',
  'revision',
  'state',
  'promotionId',
  'evidenceId',
  'projectId',
  'workspaceId',
  'workspaceRevision',
  'verificationPlanDigest',
  'adapterRegistryDigest',
  'candidate',
  'candidateDigest',
  'createdAt',
  'deadlineAt',
  'uploadCapabilityDigest',
  'attestationNonceDigest',
  'attestationStatement',
  'attestationStatementDigest',
  'uploadedArtifactManifests',
  'artifactManifestSetDigest',
  'verifiedClaims',
  'verifiedClaimSetDigest',
  'finalManifest',
  'finalManifestDigest',
  'evidenceRecords',
  'evidenceRecordSetDigest',
  'snapshotDigest',
]);

export const decodeAgentEvaluationVerificationEvidencePublicResult = (
  value: unknown,
  expected?: Readonly<{
    operation: string;
    requestDigest: CanonicalDigest;
  }>
): AgentEvaluationVerificationEvidencePublicResult => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'operation',
      'requestDigest',
      'responseReceiptDigest',
      'responseProjection',
      'responseProjectionDigest',
    ]) ||
    value.format !==
      AGENT_EVALUATION_VERIFICATION_EVIDENCE_PUBLIC_RESULT_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_STATE_VERSION ||
    (value.operation !== 'promotion.create' &&
      value.operation !== 'artifact.upload' &&
      value.operation !== 'promotion.prepare' &&
      value.operation !== 'promotion.final-commit') ||
    (expected !== undefined &&
      (value.operation !== expected.operation ||
        value.requestDigest !== expected.requestDigest)) ||
    !isAgentCanonicalDigest(value.requestDigest) ||
    !isAgentCanonicalDigest(value.responseReceiptDigest) ||
    !canonicalProjectionMatches(
      value.responseProjection,
      value.responseProjectionDigest
    )
  ) {
    return fail('Verification Evidence public result is invalid.');
  }
  if (value.operation === 'promotion.create') {
    const projection = value.responseProjection;
    if (
      !exactRecord(projection, [
        'kind',
        'promotionId',
        'evidenceId',
        'uploadCapabilityDigest',
      ]) ||
      projection.kind !== 'promotion-created' ||
      !isAgentControlIdentity(projection.promotionId) ||
      !isAgentControlIdentity(projection.evidenceId) ||
      !isAgentCanonicalDigest(projection.uploadCapabilityDigest)
    ) {
      return fail('Verification Evidence create projection is invalid.');
    }
  }
  if (value.operation === 'promotion.prepare') {
    const projection = value.responseProjection;
    if (
      !exactRecord(projection, [
        'kind',
        'promotionId',
        'evidenceId',
        'attestationNonceDigest',
        'attestationStatement',
        'attestationStatementDigest',
      ]) ||
      projection.kind !== 'promotion-prepared' ||
      !isAgentControlIdentity(projection.promotionId) ||
      !isAgentControlIdentity(projection.evidenceId) ||
      !isAgentCanonicalDigest(projection.attestationNonceDigest) ||
      !verificationStatementMatches(
        projection.attestationStatement,
        projection.attestationStatementDigest
      )
    ) {
      return fail('Verification Evidence prepare projection is invalid.');
    }
  }
  return Object.freeze({
    ...value,
  }) as AgentEvaluationVerificationEvidencePublicResult;
};

export const matchAgentEvaluationVerificationEvidencePublicResponse = (
  publicResultInput: unknown,
  response: unknown
): boolean => {
  let publicResult: AgentEvaluationVerificationEvidencePublicResult;
  try {
    publicResult =
      decodeAgentEvaluationVerificationEvidencePublicResult(publicResultInput);
  } catch {
    return false;
  }
  if (!isPlainObject(response)) return false;
  if (
    response.requestDigest !== publicResult.requestDigest ||
    response.receiptDigest !== publicResult.responseReceiptDigest
  ) {
    return false;
  }
  if (
    publicResult.operation !== 'promotion.create' &&
    publicResult.operation !== 'promotion.prepare'
  ) {
    return sameCanonicalJson(response, publicResult.responseProjection);
  }
  if (publicResult.operation === 'promotion.create') {
    if (
      !exactRecord(response, [
        'format',
        'version',
        'kind',
        'requestDigest',
        'promotionId',
        'evidenceId',
        'uploadCapability',
        'receiptDigest',
      ]) ||
      response.format !==
        'prodivix.agent-evaluation-verification-evidence-bridge' ||
      response.version !== 1 ||
      response.kind !== 'promotion-created' ||
      !isAgentControlIdentity(response.promotionId) ||
      !isAgentControlIdentity(response.evidenceId) ||
      !safeText(response.uploadCapability, 4_096) ||
      (response.uploadCapability as string).length < 32
    ) {
      return false;
    }
    return sameCanonicalJson(publicResult.responseProjection, {
      kind: response.kind,
      promotionId: response.promotionId,
      evidenceId: response.evidenceId,
      uploadCapabilityDigest: digestAgentCanonicalValue(
        response.uploadCapability
      ),
    });
  }
  if (
    !exactRecord(response, [
      'format',
      'version',
      'kind',
      'requestDigest',
      'promotionId',
      'evidenceId',
      'attestationNonce',
      'attestationStatement',
      'attestationStatementDigest',
      'receiptDigest',
    ]) ||
    response.format !==
      'prodivix.agent-evaluation-verification-evidence-bridge' ||
    response.version !== 1 ||
    response.kind !== 'promotion-prepared' ||
    !isAgentControlIdentity(response.promotionId) ||
    !isAgentControlIdentity(response.evidenceId) ||
    !safeText(response.attestationNonce, 4_096) ||
    (response.attestationNonce as string).length < 16 ||
    !verificationStatementMatches(
      response.attestationStatement,
      response.attestationStatementDigest
    )
  ) {
    return false;
  }
  return sameCanonicalJson(publicResult.responseProjection, {
    kind: response.kind,
    promotionId: response.promotionId,
    evidenceId: response.evidenceId,
    attestationNonceDigest: digestAgentCanonicalValue(
      response.attestationNonce
    ),
    attestationStatement: response.attestationStatement,
    attestationStatementDigest: response.attestationStatementDigest,
  });
};

const projectionPair = (
  value: Record<string, unknown>,
  valueKey: string,
  digestKey: string,
  nullable: boolean
): boolean => {
  if (value[valueKey] === null) {
    return nullable && value[digestKey] === null;
  }
  return canonicalProjectionMatches(value[valueKey], value[digestKey]);
};

const decodeControlledSnapshot = (
  value: unknown,
  input: AgentEvaluationOwnerStateIdentityInput,
  revision: number
): AgentEvaluationControlledWorkspaceOwnerStateSnapshot => {
  const decodeCheckpoint = (
    checkpoint: unknown
  ): AgentEvaluationControlledWorkspaceCheckpoint | null => {
    if (checkpoint === null) return null;
    if (
      !exactRecord(
        checkpoint,
        checkpoint !== null &&
          isPlainObject(checkpoint) &&
          Object.hasOwn(checkpoint, 'predecessorCheckpointDigest')
          ? [
              'checkpointRef',
              'attemptId',
              'grantDigest',
              'generation',
              'predecessorCheckpointDigest',
              'snapshotDigest',
              'securePersistenceReceiptDigest',
              'checkpointDigest',
            ]
          : [
              'checkpointRef',
              'attemptId',
              'grantDigest',
              'generation',
              'snapshotDigest',
              'securePersistenceReceiptDigest',
              'checkpointDigest',
            ]
      ) ||
      !isAgentControlIdentity(checkpoint.checkpointRef) ||
      checkpoint.attemptId !== input.attemptId ||
      checkpoint.grantDigest !== input.grantOrAuthorityDigest ||
      checkpoint.generation !== input.generation ||
      (checkpoint.predecessorCheckpointDigest !== undefined &&
        !isAgentCanonicalDigest(checkpoint.predecessorCheckpointDigest)) ||
      !isAgentCanonicalDigest(checkpoint.snapshotDigest) ||
      !isAgentCanonicalDigest(checkpoint.securePersistenceReceiptDigest) ||
      !selfDigestMatches(checkpoint, 'checkpointDigest')
    ) {
      return fail('Controlled Workspace owner checkpoint is invalid.');
    }
    return Object.freeze({
      ...checkpoint,
    }) as AgentEvaluationControlledWorkspaceCheckpoint;
  };
  const snapshotRecord = isPlainObject(value) ? value : undefined;
  const initialCheckpoint = decodeCheckpoint(snapshotRecord?.initialCheckpoint);
  const currentCheckpoint = decodeCheckpoint(snapshotRecord?.currentCheckpoint);
  if (
    !exactRecord(value, controlledSnapshotKeys) ||
    value.format !==
      AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_STATE_VERSION ||
    value.namespaceId !== input.namespaceId ||
    value.planDigest !== input.planDigest ||
    value.repositoryCommit !== input.repositoryCommit ||
    value.attemptId !== input.attemptId ||
    value.descriptorDigest !== input.descriptorDigest ||
    value.grantDigest !== input.grantOrAuthorityDigest ||
    value.generation !== input.generation ||
    value.revision !== revision ||
    !isAgentControlIdentity(value.caseId) ||
    !isAgentCanonicalDigest(value.materialDigest) ||
    !isAgentCanonicalDigest(value.fixtureDigest) ||
    !isAgentControlIdentity(value.sessionId) ||
    !isAgentCanonicalDigest(value.isolationPolicyDigest) ||
    (value.state !== 'active' && value.state !== 'destroyed') ||
    (initialCheckpoint === null) !== (currentCheckpoint === null) ||
    (value.state === 'active' &&
      (initialCheckpoint === null || currentCheckpoint === null)) ||
    !nullableDigest(value.initialCheckpointDigest) ||
    !nullableDigest(value.currentCheckpointDigest) ||
    value.initialCheckpointDigest !==
      (initialCheckpoint?.checkpointDigest ?? null) ||
    value.currentCheckpointDigest !==
      (currentCheckpoint?.checkpointDigest ?? null) ||
    !projectionPair(
      value,
      'workspaceSnapshot',
      'workspaceSnapshotDigest',
      false
    ) ||
    !projectionPair(
      value,
      'toolDefinitions',
      'toolDefinitionSetDigest',
      false
    ) ||
    !projectionPair(value, 'actionRegistry', 'actionRegistryDigest', false) ||
    !projectionPair(
      value,
      'g3VerificationPlan',
      'verificationPlanDigest',
      false
    ) ||
    !projectionPair(value, 'adapterRegistry', 'adapterRegistryDigest', false) ||
    !projectionPair(
      value,
      'artifactDescriptors',
      'artifactDescriptorSetDigest',
      false
    ) ||
    !nullableDigest(value.finalWorkspaceSnapshotDigest) ||
    !nullableDigest(value.finalAuthorityReceiptDigest) ||
    !nullableDigest(value.cleanupReceiptDigest) ||
    !Array.isArray(value.toolDefinitions) ||
    !sortedUniqueBy(value.toolDefinitions, 'toolId') ||
    !Array.isArray(value.artifactDescriptors) ||
    !sortedUniqueBy(value.artifactDescriptors, 'artifactRef') ||
    !selfDigestMatches(value, 'snapshotDigest')
  ) {
    return fail('Controlled Workspace owner state snapshot is invalid.');
  }
  return Object.freeze({
    ...value,
    initialCheckpoint,
    currentCheckpoint,
  }) as AgentEvaluationControlledWorkspaceOwnerStateSnapshot;
};

const validNullableControlIdentity = (value: unknown): boolean =>
  value === null || isAgentControlIdentity(value);

const validNullableInstant = (value: unknown): boolean =>
  value === null || isAgentControlInstant(value);

const nullableSortedProjection = (
  value: Record<string, unknown>,
  valueKey: string,
  digestKey: string,
  sortKey: string
): boolean =>
  value[valueKey] === null
    ? value[digestKey] === null
    : Array.isArray(value[valueKey]) &&
      sortedUniqueBy(value[valueKey] as readonly unknown[], sortKey) &&
      canonicalProjectionMatches(value[valueKey], value[digestKey]);

const decodeVerificationSnapshot = (
  value: unknown,
  input: AgentEvaluationOwnerStateIdentityInput,
  revision: number
): AgentEvaluationVerificationEvidenceOwnerStateSnapshot => {
  if (
    !exactRecord(value, verificationSnapshotKeys) ||
    value.format !==
      AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_STATE_VERSION ||
    value.namespaceId !== input.namespaceId ||
    value.planDigest !== input.planDigest ||
    value.repositoryCommit !== input.repositoryCommit ||
    value.attemptId !== input.attemptId ||
    value.descriptorDigest !== input.descriptorDigest ||
    value.authorityDigest !== input.grantOrAuthorityDigest ||
    value.generation !== input.generation ||
    value.revision !== revision ||
    !isAgentCanonicalDigest(value.sandboxRegistrationReceiptDigest) ||
    (value.state !== 'registered' &&
      value.state !== 'active' &&
      value.state !== 'prepared' &&
      value.state !== 'finalized' &&
      value.state !== 'destroyed') ||
    !validNullableControlIdentity(value.promotionId) ||
    !validNullableControlIdentity(value.evidenceId) ||
    !validNullableControlIdentity(value.projectId) ||
    !validNullableControlIdentity(value.workspaceId) ||
    !nonNegativeInteger(value.workspaceRevision) ||
    !isAgentCanonicalDigest(value.verificationPlanDigest) ||
    !isAgentCanonicalDigest(value.adapterRegistryDigest) ||
    !projectionPair(value, 'candidate', 'candidateDigest', true) ||
    !validNullableInstant(value.createdAt) ||
    !validNullableInstant(value.deadlineAt) ||
    !isAgentCanonicalDigest(value.uploadCapabilityDigest) ||
    !nullableDigest(value.attestationNonceDigest) ||
    !(value.attestationStatement === null
      ? value.attestationStatementDigest === null
      : verificationStatementMatches(
          value.attestationStatement,
          value.attestationStatementDigest
        )) ||
    !nullableSortedProjection(
      value,
      'uploadedArtifactManifests',
      'artifactManifestSetDigest',
      'artifactId'
    ) ||
    !nullableSortedProjection(
      value,
      'verifiedClaims',
      'verifiedClaimSetDigest',
      'claimDigest'
    ) ||
    !projectionPair(value, 'finalManifest', 'finalManifestDigest', true) ||
    !nullableSortedProjection(
      value,
      'evidenceRecords',
      'evidenceRecordSetDigest',
      'evidenceId'
    ) ||
    ((value.state === 'active' ||
      value.state === 'prepared' ||
      value.state === 'finalized') &&
      (value.promotionId === null || value.evidenceId === null)) ||
    ((value.state === 'registered' || value.state === 'active') &&
      (value.attestationNonceDigest !== null ||
        value.attestationStatement !== null ||
        value.attestationStatementDigest !== null)) ||
    ((value.state === 'prepared' || value.state === 'finalized') &&
      (value.attestationNonceDigest === null ||
        value.attestationStatement === null ||
        value.attestationStatementDigest === null)) ||
    (value.state === 'prepared' && value.finalManifest !== null) ||
    (value.state === 'finalized' &&
      (value.finalManifest === null || value.evidenceRecords === null)) ||
    !selfDigestMatches(value, 'snapshotDigest')
  ) {
    return fail('Verification Evidence owner state snapshot is invalid.');
  }
  return Object.freeze({
    ...value,
  }) as AgentEvaluationVerificationEvidenceOwnerStateSnapshot;
};

export const decodeAgentEvaluationOwnerStateBundle = (
  value: unknown,
  expected: AgentEvaluationOwnerStateIdentityInput &
    Readonly<{
      revision: number;
      previousOwnerStateRootDigest: CanonicalDigest | null;
    }>
): AgentEvaluationOwnerStateBundle => {
  const ownerStateId = createAgentEvaluationOwnerStateIdentity(expected);
  const maximumBytes =
    expected.serviceKind === 'controlled-workspace'
      ? AGENT_EVALUATION_CONTROLLED_OWNER_STATE_MAXIMUM_BYTES
      : AGENT_EVALUATION_VERIFICATION_OWNER_STATE_MAXIMUM_BYTES;
  if (
    !exactRecord(value, [
      'format',
      'version',
      'serviceKind',
      'namespaceId',
      'planDigest',
      'repositoryCommit',
      'ownerStateId',
      'revision',
      'previousOwnerStateRootDigest',
      'snapshotKind',
      'snapshot',
      'snapshotDigest',
      'casArtifacts',
      'casArtifactSetDigest',
      'recentOperations',
      'recentOperationSetDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_STATE_VERSION ||
    value.serviceKind !== expected.serviceKind ||
    value.namespaceId !== expected.namespaceId ||
    value.planDigest !== expected.planDigest ||
    value.repositoryCommit !== expected.repositoryCommit ||
    value.ownerStateId !== ownerStateId ||
    value.revision !== expected.revision ||
    !positiveInteger(value.revision) ||
    value.previousOwnerStateRootDigest !==
      expected.previousOwnerStateRootDigest ||
    value.snapshotKind !== expected.serviceKind ||
    !isAgentCanonicalDigest(value.snapshotDigest) ||
    !Array.isArray(value.casArtifacts) ||
    value.casArtifacts.length >
      AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACTS ||
    !sortedUniqueBy(value.casArtifacts, 'artifactRef') ||
    !canonicalProjectionMatches(
      value.casArtifacts,
      value.casArtifactSetDigest
    ) ||
    !Array.isArray(value.recentOperations) ||
    value.recentOperations.length === 0 ||
    value.recentOperations.length >
      AGENT_EVALUATION_OWNER_STATE_MAXIMUM_RECENT_OPERATIONS ||
    !canonicalProjectionMatches(
      value.recentOperations,
      value.recentOperationSetDigest
    ) ||
    textEncoder.encode(canonicalJsonText(value)).byteLength > maximumBytes
  ) {
    return fail('Owner state bundle is invalid.');
  }
  const casArtifacts = Object.freeze(
    value.casArtifacts.map(decodeAgentEvaluationOwnerStateCASDescriptor)
  );
  const recentOperations = Object.freeze(
    value.recentOperations.map(decodeOperationRecord)
  );
  for (let index = 1; index < recentOperations.length; index += 1) {
    if (
      recentOperations[index]!.sequence <= recentOperations[index - 1]!.sequence
    ) {
      return fail('Owner state operation sequence is invalid.');
    }
  }
  const snapshot =
    expected.serviceKind === 'controlled-workspace'
      ? decodeControlledSnapshot(value.snapshot, expected, expected.revision)
      : decodeVerificationSnapshot(value.snapshot, expected, expected.revision);
  if (snapshot.snapshotDigest !== value.snapshotDigest) {
    return fail('Owner state snapshot binding drifted.');
  }
  return Object.freeze({
    ...value,
    snapshot,
    casArtifacts,
    recentOperations,
  }) as AgentEvaluationOwnerStateBundle;
};

export const decodeAgentEvaluationOwnerStatePrior = (
  value: Readonly<{
    revision: unknown;
    bundle: unknown;
    rootDigest: unknown;
  }>,
  expected: AgentEvaluationOwnerStateIdentityInput
): AgentEvaluationOwnerStatePrior => {
  const ownerStateId = createAgentEvaluationOwnerStateIdentity(expected);
  if (!nonNegativeInteger(value.revision)) {
    return fail('Prior owner state revision is invalid.');
  }
  if (value.revision === 0) {
    if (value.bundle !== null || value.rootDigest !== null) {
      return fail('Initial owner state must be empty.');
    }
    return Object.freeze({
      ownerStateId,
      revision: 0,
      bundle: null,
      rootDigest: null,
    });
  }
  if (!isAgentCanonicalDigest(value.rootDigest)) {
    return fail('Prior owner state root is invalid.');
  }
  const bundle = decodeAgentEvaluationOwnerStateBundle(value.bundle, {
    ...expected,
    revision: value.revision,
    previousOwnerStateRootDigest:
      isPlainObject(value.bundle) &&
      (value.bundle.previousOwnerStateRootDigest === null ||
        isAgentCanonicalDigest(value.bundle.previousOwnerStateRootDigest))
        ? value.bundle.previousOwnerStateRootDigest
        : fail('Prior owner state chain is invalid.'),
  });
  if (digestAgentCanonicalValue(bundle) !== value.rootDigest) {
    return fail('Prior owner state root drifted.');
  }
  return Object.freeze({
    ownerStateId,
    revision: value.revision,
    bundle,
    rootDigest: value.rootDigest,
  });
};

const sealedOperationKeys = Object.freeze([
  'format',
  'version',
  'serviceKind',
  'operation',
  'routeBinding',
  'requestDigest',
  'ownerImplementationDigest',
  'ownerStateId',
  'priorOwnerStateRevision',
  'priorOwnerStateRootDigest',
  'stageDigest',
  'publicResult',
  'responseDigest',
  'ownerStateRevision',
  'ownerStateRootDigest',
  'dispatchAckDigest',
  'resultReceiptDigest',
]);

export const decodeAgentEvaluationOwnerStateSealedOperation = (
  value: unknown,
  expected: Readonly<{
    serviceKind: AgentEvaluationOwnerStateServiceKind;
    operation: string;
    routeBinding: string;
    requestDigest: CanonicalDigest;
    ownerImplementationDigest: CanonicalDigest;
    ownerStateId: CanonicalDigest;
  }>
): AgentEvaluationOwnerStateSealedOperation => {
  if (
    !exactRecord(value, sealedOperationKeys) ||
    value.format !== AGENT_EVALUATION_SEALED_OWNER_OPERATION_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_STATE_VERSION ||
    value.serviceKind !== expected.serviceKind ||
    value.operation !== expected.operation ||
    value.routeBinding !== expected.routeBinding ||
    value.requestDigest !== expected.requestDigest ||
    value.ownerImplementationDigest !== expected.ownerImplementationDigest ||
    value.ownerStateId !== expected.ownerStateId ||
    !nonNegativeInteger(value.priorOwnerStateRevision) ||
    !nullableDigest(value.priorOwnerStateRootDigest) ||
    (value.priorOwnerStateRevision === 0
      ? value.priorOwnerStateRootDigest !== null
      : value.priorOwnerStateRootDigest === null) ||
    !isAgentCanonicalDigest(value.stageDigest) ||
    !canonicalProjectionMatches(value.publicResult, value.responseDigest) ||
    !positiveInteger(value.ownerStateRevision) ||
    value.ownerStateRevision !== value.priorOwnerStateRevision + 1 ||
    !isAgentCanonicalDigest(value.ownerStateRootDigest) ||
    !isAgentCanonicalDigest(value.dispatchAckDigest) ||
    !selfDigestMatches(value, 'resultReceiptDigest')
  ) {
    return fail('Sealed owner operation is invalid.');
  }
  const sealed = Object.freeze({
    ...value,
  }) as AgentEvaluationOwnerStateSealedOperation;
  if (sealed.serviceKind === 'verification-evidence') {
    decodeAgentEvaluationVerificationEvidencePublicResult(
      sealed.publicResult,
      sealed
    );
  }
  if (
    sealed.stageDigest !==
      digestAgentEvaluationOwnerStateStage({
        ...sealed,
        priorOwnerStateRootDigest: sealed.priorOwnerStateRootDigest,
      }) ||
    sealed.dispatchAckDigest !==
      digestAgentEvaluationOwnerStateDispatchAck(sealed)
  ) {
    return fail('Sealed owner operation fence drifted.');
  }
  return sealed;
};

export const decodeAgentEvaluationOwnerStateTransition = (
  value: unknown,
  expected: AgentEvaluationOwnerStateIdentityInput &
    Readonly<{
      operation: string;
      routeBinding: string;
      requestDigest: CanonicalDigest;
      ownerImplementationDigest: CanonicalDigest;
      priorOwnerStateRevision: number;
      priorOwnerStateRootDigest: CanonicalDigest | null;
    }>
): AgentEvaluationOwnerStateTransition => {
  if (!exactRecord(value, [...sealedOperationKeys, 'ownerStateBundle'])) {
    return fail('Owner state transition keys drifted.');
  }
  const ownerStateId = createAgentEvaluationOwnerStateIdentity(expected);
  const sealed = decodeAgentEvaluationOwnerStateSealedOperation(
    Object.freeze(
      Object.fromEntries(
        Object.entries(value).filter(([key]) => key !== 'ownerStateBundle')
      )
    ),
    {
      serviceKind: expected.serviceKind,
      operation: expected.operation,
      routeBinding: expected.routeBinding,
      requestDigest: expected.requestDigest,
      ownerImplementationDigest: expected.ownerImplementationDigest,
      ownerStateId,
    }
  );
  if (
    sealed.priorOwnerStateRevision !== expected.priorOwnerStateRevision ||
    sealed.priorOwnerStateRootDigest !== expected.priorOwnerStateRootDigest
  ) {
    return fail('Owner state transition prior binding drifted.');
  }
  const bundle = decodeAgentEvaluationOwnerStateBundle(value.ownerStateBundle, {
    ...expected,
    revision: sealed.ownerStateRevision,
    previousOwnerStateRootDigest: sealed.priorOwnerStateRootDigest,
  });
  if (digestAgentCanonicalValue(bundle) !== sealed.ownerStateRootDigest) {
    return fail('Owner state transition root drifted.');
  }
  return Object.freeze({ ...sealed, ownerStateBundle: bundle });
};

export const matchAgentEvaluationOwnerStateTransition = (
  left: AgentEvaluationOwnerStateTransition,
  right: AgentEvaluationOwnerStateTransition
): boolean => sameCanonicalJson(left, right);
