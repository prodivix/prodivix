import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  decodeVerificationEvidenceVerifiedView,
  type VerificationEvidenceVerifiedView,
} from '@prodivix/verification';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import {
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
  createAgentEvaluationVerificationEvidenceBridgeAuthority,
  type AgentEvaluationVerificationEvidenceBridgeAuthority,
  type AgentEvaluationVerificationEvidenceVerifiedViewReceipt,
} from './evaluationVerificationEvidenceBridge';
import {
  createAgentEvaluationOwnerStateIdentity,
  type AgentEvaluationVerificationEvidenceOwnerStateSnapshot,
} from './ownerState';
import type {
  AgentEvaluationOwnerStateQueryClient,
  AgentEvaluationOwnerStateReadResult,
} from './ownerStateQueryClient';
import type { AgentEvaluationOwnerAuthorityRequest } from './productionOwnerAuthoritySidecar';

export type ProductionAgentEvaluationVerifiedViewAuthorityInput = Readonly<{
  request: AgentEvaluationOwnerAuthorityRequest;
  authority: AgentEvaluationVerificationEvidenceBridgeAuthority;
  evidenceIds: readonly string[];
  snapshot: AgentEvaluationVerificationEvidenceOwnerStateSnapshot;
  durableState: AgentEvaluationOwnerStateReadResult;
}>;

/**
 * Supplies current revocation, retention, tombstone, and artifact-availability
 * facts. Its result must be derived from authoritative persistence rather than
 * the immutable finalization snapshot alone.
 */
export interface ProductionAgentEvaluationVerifiedViewAuthority {
  resolve(
    input: ProductionAgentEvaluationVerifiedViewAuthorityInput
  ): Promise<unknown>;
}

export type ProductionAgentEvaluationVerificationEvidenceOwnerReadAuthority =
  Readonly<{
    read(request: AgentEvaluationOwnerAuthorityRequest): Promise<unknown>;
  }>;

export type CreateProductionAgentEvaluationVerificationEvidenceOwnerReadAuthorityInput =
  Readonly<{
    ownerStateQueryFor(
      request: AgentEvaluationOwnerAuthorityRequest
    ): AgentEvaluationOwnerStateQueryClient;
    verifiedViewAuthority: ProductionAgentEvaluationVerifiedViewAuthority;
    forbiddenCanaries: () => readonly string[];
  }>;

const maximumEvidenceIds = 128;

const fail = (reason: string): never => {
  throw new TypeError(`G4_VERIFICATION_EVIDENCE_OWNER_READ_INVALID: ${reason}`);
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

const canonicalEvidenceIds = (value: unknown): readonly string[] => {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > maximumEvidenceIds ||
    value.some((entry) => !isAgentControlIdentity(entry)) ||
    new Set(value).size !== value.length
  ) {
    return fail('evidence-ids');
  }
  const canonical = Object.freeze(
    [...value].sort(compareUnicodeCodePoints) as string[]
  );
  if (!sameCanonicalJson(value, canonical)) return fail('evidence-id-order');
  return canonical;
};

const decodeAuthority = (
  value: unknown
): AgentEvaluationVerificationEvidenceBridgeAuthority => {
  if (!isPlainObject(value)) return fail('authority');
  let authority: AgentEvaluationVerificationEvidenceBridgeAuthority;
  try {
    authority = createAgentEvaluationVerificationEvidenceBridgeAuthority(
      value as Parameters<
        typeof createAgentEvaluationVerificationEvidenceBridgeAuthority
      >[0]
    );
  } catch {
    return fail('authority');
  }
  if (!sameCanonicalJson(authority, value)) return fail('authority-drift');
  return authority;
};

const decodePayload = (
  request: AgentEvaluationOwnerAuthorityRequest
): Readonly<{
  authority: AgentEvaluationVerificationEvidenceBridgeAuthority;
  evidenceIds: readonly string[];
  workspaceRevision: number;
  verificationPlanDigest: string;
}> => {
  const value = request.payload;
  if (
    !exactRecord(value, [
      'format',
      'version',
      'kind',
      'authority',
      'sandboxRegistrationReceiptDigest',
      'evidenceIds',
      'workspaceRevision',
      'verificationPlanDigest',
      'idempotencyKey',
      'requestDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT ||
    value.version !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION ||
    value.kind !== 'verified-view-resolve-request' ||
    value.requestDigest !== request.requestDigest ||
    value.sandboxRegistrationReceiptDigest !==
      request.sandboxRegistrationReceiptDigest ||
    !Number.isSafeInteger(value.workspaceRevision) ||
    Number(value.workspaceRevision) < 0 ||
    !isAgentCanonicalDigest(value.verificationPlanDigest) ||
    !isAgentControlIdentity(value.idempotencyKey)
  ) {
    return fail('payload');
  }
  const authority = decodeAuthority(value.authority);
  if (
    authority.namespaceId !== request.namespaceId ||
    authority.evaluationPlanDigest !== request.planDigest ||
    authority.repositoryCommit !== request.repositoryCommit ||
    authority.descriptor.attemptId !== request.attemptId ||
    authority.descriptor.descriptorDigest !== request.descriptorDigest ||
    authority.generation !== request.generation ||
    authority.controlledWorkspaceGrantDigest !==
      request.controlledWorkspaceGrantDigest ||
    authority.authorityDigest !== request.authorityDigest ||
    authority.workspaceRevision !== value.workspaceRevision ||
    authority.verificationPlanDigest !== value.verificationPlanDigest
  ) {
    return fail('payload-authority-binding');
  }
  return Object.freeze({
    authority,
    evidenceIds: canonicalEvidenceIds(value.evidenceIds),
    workspaceRevision: value.workspaceRevision,
    verificationPlanDigest: value.verificationPlanDigest,
  });
};

const decodeVerifiedViewReceipt = (
  value: unknown,
  requestDigest: CanonicalDigest,
  evidenceIds: readonly string[]
): AgentEvaluationVerificationEvidenceVerifiedViewReceipt => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'kind',
      'requestDigest',
      'verifiedEvidenceView',
      'revokedEvidenceIds',
      'receiptDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT ||
    value.version !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION ||
    value.kind !== 'verified-view-resolved' ||
    value.requestDigest !== requestDigest ||
    !isAgentCanonicalDigest(value.receiptDigest) ||
    !Array.isArray(value.revokedEvidenceIds) ||
    value.revokedEvidenceIds.length > maximumEvidenceIds ||
    value.revokedEvidenceIds.some((entry) => !isAgentControlIdentity(entry)) ||
    new Set(value.revokedEvidenceIds).size !== value.revokedEvidenceIds.length
  ) {
    return fail('verified-view-response');
  }
  const decoded = decodeVerificationEvidenceVerifiedView(
    value.verifiedEvidenceView
  );
  if (!decoded.ok) return fail('verified-view');
  const actualEvidenceIds = decoded.value.records.map(
    ({ evidenceId }) => evidenceId
  );
  if (!sameCanonicalJson(actualEvidenceIds, evidenceIds)) {
    return fail('verified-view-evidence-binding');
  }
  const revoked = Object.freeze(
    [...value.revokedEvidenceIds].sort(compareUnicodeCodePoints) as string[]
  );
  if (
    !sameCanonicalJson(revoked, value.revokedEvidenceIds) ||
    revoked.some((evidenceId) => !evidenceIds.includes(evidenceId))
  ) {
    return fail('verified-view-revocation-binding');
  }
  const rawBase = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
    version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
    kind: 'verified-view-resolved' as const,
    requestDigest,
    verifiedEvidenceView: value.verifiedEvidenceView,
    revokedEvidenceIds: revoked,
  });
  if (digestAgentCanonicalValue(rawBase) !== value.receiptDigest) {
    return fail('verified-view-receipt');
  }
  return Object.freeze({
    ...rawBase,
    verifiedEvidenceView: decoded.value,
    receiptDigest: value.receiptDigest,
  });
};

const immutableEvidenceBinding = (
  snapshot: AgentEvaluationVerificationEvidenceOwnerStateSnapshot,
  view: VerificationEvidenceVerifiedView,
  evidenceIds: readonly string[]
): void => {
  if (!Array.isArray(snapshot.evidenceRecords)) {
    return fail('snapshot-evidence-records');
  }
  const records = new Map<string, Record<string, unknown>>();
  for (const record of snapshot.evidenceRecords) {
    if (
      !isPlainObject(record) ||
      !isAgentControlIdentity(record.evidenceId) ||
      records.has(record.evidenceId)
    ) {
      return fail('snapshot-evidence-record');
    }
    records.set(record.evidenceId, record);
  }
  for (const [index, evidenceId] of evidenceIds.entries()) {
    const persisted = records.get(evidenceId);
    const current = view.records[index];
    if (
      !persisted ||
      !current ||
      persisted.manifestDigest !== current.manifestDigest ||
      persisted.materializedEvidenceDigest !==
        current.materializedEvidenceDigest
    ) {
      return fail('immutable-evidence-binding');
    }
  }
};

export const createProductionAgentEvaluationVerificationEvidenceOwnerReadAuthority =
  (
    input: CreateProductionAgentEvaluationVerificationEvidenceOwnerReadAuthorityInput
  ): ProductionAgentEvaluationVerificationEvidenceOwnerReadAuthority =>
    Object.freeze({
      async read(request) {
        if (
          request.serviceKind !== 'verification-evidence' ||
          request.mode !== 'read' ||
          request.operation !== 'verified-view.resolve' ||
          request.routeBinding !== 'verified-view/resolve' ||
          !isAgentCanonicalDigest(request.planDigest) ||
          !isAgentControlIdentity(request.attemptId) ||
          !isAgentCanonicalDigest(request.descriptorDigest) ||
          !Number.isSafeInteger(request.generation) ||
          request.generation! < 1 ||
          !isAgentCanonicalDigest(request.authorityDigest)
        ) {
          return fail('request');
        }
        const payload = decodePayload(request);
        const identity = Object.freeze({
          serviceKind: 'verification-evidence' as const,
          namespaceId: request.namespaceId,
          planDigest: request.planDigest,
          repositoryCommit: request.repositoryCommit,
          attemptId: request.attemptId,
          descriptorDigest: request.descriptorDigest,
          generation: request.generation!,
          grantOrAuthorityDigest: request.authorityDigest,
        });
        const ownerStateId = createAgentEvaluationOwnerStateIdentity(identity);
        const ownerStateQuery = input.ownerStateQueryFor(request);
        if (
          !ownerStateQuery ||
          typeof ownerStateQuery.list !== 'function' ||
          typeof ownerStateQuery.read !== 'function' ||
          typeof ownerStateQuery.readArtifact !== 'function'
        ) {
          return fail('owner-state-query');
        }
        const durableState = await ownerStateQuery.read(
          Object.freeze({
            serviceKind: 'verification-evidence',
            operation: 'verified-view.resolve',
          }),
          ownerStateId
        );
        const snapshot = durableState.ownerStateBundle.snapshot;
        if (
          snapshot.format !==
            'prodivix.agent-evaluation-verification-evidence-owner-state-snapshot' ||
          snapshot.state !== 'finalized' ||
          snapshot.authorityDigest !== request.authorityDigest ||
          snapshot.sandboxRegistrationReceiptDigest !==
            request.sandboxRegistrationReceiptDigest ||
          snapshot.workspaceRevision !== payload.workspaceRevision ||
          snapshot.verificationPlanDigest !== payload.verificationPlanDigest ||
          snapshot.finalManifest === null ||
          snapshot.evidenceRecords === null
        ) {
          return fail('durable-snapshot-binding');
        }
        const resolved = await input.verifiedViewAuthority.resolve({
          request,
          authority: payload.authority,
          evidenceIds: payload.evidenceIds,
          snapshot,
          durableState,
        });
        const receipt = decodeVerifiedViewReceipt(
          resolved,
          request.requestDigest,
          payload.evidenceIds
        );
        immutableEvidenceBinding(
          snapshot,
          receipt.verifiedEvidenceView,
          payload.evidenceIds
        );
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          receipt,
          input.forbiddenCanaries
        );
        return receipt;
      },
    });
