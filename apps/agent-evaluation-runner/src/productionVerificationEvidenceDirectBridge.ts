import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type AgentJsonValue,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  computeVerificationArtifactContentDigest,
  encodeVerificationEvidenceCandidate,
} from '@prodivix/verification';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  assertProductionAgentEvaluationG3SandboxCanaryClean,
  type AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource,
} from './controlledWorkspaceG3CellAdapter';
import {
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
  createAgentEvaluationVerificationEvidenceBridgeAuthority,
  decodeAgentEvaluationVerificationEvidenceArtifactUploadReceipt,
  decodeAgentEvaluationVerificationEvidenceFinalizationReceipt,
  decodeAgentEvaluationVerificationEvidencePreparationReceipt,
  decodeAgentEvaluationVerificationEvidencePromotionReceipt,
  type AgentEvaluationVerificationEvidenceBridge,
  type AgentEvaluationVerificationEvidenceBridgeAuthority,
  type AgentEvaluationVerificationEvidenceSandboxRegistrationReceipt,
} from './evaluationVerificationEvidenceBridge';
import type { ProductionVerificationEvidenceDirectAuthority } from './productionVerificationEvidenceDirectAuthority';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import type { ProductionOwnerResourceRetirement } from './productionWorkspaceVerificationOwnerAuthorityPorts';

const maximumArtifactBytes = 16_777_216;
const maximumReceipts = 128;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{15,1023}$/u;
const mediaTypePattern = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;

export type ProductionVerificationEvidenceDirectBridge =
  AgentEvaluationVerificationEvidenceBridge &
    Readonly<{ close(): Promise<ProductionOwnerResourceRetirement> }>;

export type CreateProductionVerificationEvidenceDirectBridgeInput = Readonly<{
  authority: ProductionVerificationEvidenceDirectAuthority;
  forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
}>;

const fail = (code: string): never => {
  throw new TypeError(
    `G4_VERIFICATION_EVIDENCE_DIRECT_BRIDGE_INVALID: ${code}`
  );
};

const authorityValue = (
  value: AgentEvaluationVerificationEvidenceBridgeAuthority
): AgentEvaluationVerificationEvidenceBridgeAuthority => {
  let expected: AgentEvaluationVerificationEvidenceBridgeAuthority;
  try {
    expected = createAgentEvaluationVerificationEvidenceBridgeAuthority(value);
  } catch {
    return fail('authority');
  }
  if (!sameCanonicalJson(expected, value)) return fail('authority');
  return value;
};

const receipt = <T extends Readonly<Record<string, unknown>>>(
  base: T
): T & Readonly<{ receiptDigest: CanonicalDigest }> =>
  Object.freeze({ ...base, receiptDigest: digestAgentCanonicalValue(base) });

const registrationFor = (
  authority: AgentEvaluationVerificationEvidenceBridgeAuthority,
  idempotencyKey: string
): AgentEvaluationVerificationEvidenceSandboxRegistrationReceipt => {
  if (!idempotencyPattern.test(idempotencyKey)) {
    return fail('registration-idempotency');
  }
  authorityValue(authority);
  const requestBase = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
    version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
    kind: 'sandbox-registration-request' as const,
    authority,
    idempotencyKey,
  });
  const requestDigest = digestAgentCanonicalValue(requestBase);
  const registrationId = `sandbox-registration.${requestDigest.slice(7, 47)}`;
  const registrationDigest = digestAgentCanonicalValue({
    kind: 'production-direct-sandbox-registration',
    authorityDigest: authority.authorityDigest,
    requestDigest,
    registrationId,
  });
  return receipt({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
    version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
    kind: 'sandbox-registration' as const,
    requestDigest,
    idempotencyKey,
    registrationId,
    registrationDigest,
  });
};

const assertRegistration = (
  value: AgentEvaluationVerificationEvidenceSandboxRegistrationReceipt,
  authority: AgentEvaluationVerificationEvidenceBridgeAuthority
): void => {
  const { receiptDigest, ...base } = value;
  if (
    value.format !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT ||
    value.version !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION ||
    value.kind !== 'sandbox-registration' ||
    !isAgentControlIdentity(value.registrationId) ||
    !isAgentCanonicalDigest(value.requestDigest) ||
    !isAgentCanonicalDigest(value.registrationDigest) ||
    !isAgentCanonicalDigest(receiptDigest) ||
    receiptDigest !== digestAgentCanonicalValue(base) ||
    !sameCanonicalJson(value, registrationFor(authority, value.idempotencyKey))
  ) {
    return fail('registration');
  }
};

const requestFor = (
  authority: AgentEvaluationVerificationEvidenceBridgeAuthority,
  operation:
    | 'promotion.create'
    | 'artifact.upload'
    | 'promotion.prepare'
    | 'promotion.final-commit',
  routeBinding: string,
  payloadBase: Readonly<Record<string, unknown>>,
  sandboxRegistrationReceiptDigest: CanonicalDigest
): Readonly<{
  request: AgentEvaluationOwnerAuthorityRequest;
  payload: Readonly<Record<string, unknown>> &
    Readonly<{ requestDigest: CanonicalDigest }>;
}> => {
  authorityValue(authority);
  const requestDigest = digestAgentCanonicalValue(payloadBase);
  const payload = Object.freeze({ ...payloadBase, requestDigest });
  return Object.freeze({
    payload,
    request: Object.freeze({
      format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
      version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
      serviceKind: 'verification-evidence' as const,
      mode: 'execute' as const,
      namespaceId: authority.namespaceId,
      planDigest: authority.evaluationPlanDigest,
      repositoryCommit: authority.repositoryCommit,
      operation,
      routeBinding,
      requestDigest,
      attemptId: authority.descriptor.attemptId,
      descriptorDigest: authority.descriptor.descriptorDigest,
      generation: authority.generation,
      authorityDigest: authority.authorityDigest,
      sandboxRegistrationReceiptDigest,
      claimGeneration: 1,
      payload,
    }),
  });
};

const assertClean = (value: ProductionOwnerResourceRetirement): void => {
  if (
    value.status !== 'clean' ||
    value.residualResourceIds.length !== 0 ||
    value.residualCanaryIds.length !== 0
  ) {
    return fail('resource-retirement');
  }
};

/**
 * Cycle-safe G3 bridge. Mutable Verification state lives exclusively in the
 * purpose-bound Backend authority; the sandbox registration is a local,
 * deterministic binding receipt and carries no mutable evidence state.
 */
export const createProductionVerificationEvidenceDirectBridge = (
  input: CreateProductionVerificationEvidenceDirectBridgeInput
): ProductionVerificationEvidenceDirectBridge => {
  if (
    typeof input.authority?.dispatch !== 'function' ||
    typeof input.authority?.resolve !== 'function' ||
    typeof input.authority?.close !== 'function' ||
    typeof input.forbiddenCanaries !== 'function'
  ) {
    return fail('factory');
  }
  let closed = false;
  let closePromise: Promise<ProductionOwnerResourceRetirement> | undefined;
  const bridge: ProductionVerificationEvidenceDirectBridge = Object.freeze({
    async registerSandbox(
      registrationInput: Parameters<
        AgentEvaluationVerificationEvidenceBridge['registerSandbox']
      >[0]
    ) {
      const { authority, idempotencyKey } = registrationInput;
      if (closed) return fail('closed');
      const registration = registrationFor(authority, idempotencyKey);
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        registration,
        input.forbiddenCanaries
      );
      return registration;
    },
    async promoteCell(
      promotionInput: Parameters<
        AgentEvaluationVerificationEvidenceBridge['promoteCell']
      >[0]
    ) {
      const {
        authority,
        registration,
        cellId,
        candidate,
        stagedArtifacts,
        artifactSource,
        attestationAuthority,
        idempotencyKey,
      } = promotionInput;
      if (closed) return fail('closed');
      assertRegistration(registration, authority);
      const grantReceipt = authority.verificationAttemptGrantReceipts.find(
        (candidateReceipt) => candidateReceipt.cellId === cellId
      );
      if (
        !grantReceipt ||
        !idempotencyPattern.test(idempotencyKey) ||
        !isAgentControlIdentity(cellId) ||
        candidate.cellId !== cellId ||
        candidate.attemptId !== authority.descriptor.attemptId ||
        candidate.planDigest !== authority.verificationPlanDigest ||
        candidate.projectId !== authority.projectId ||
        candidate.workspaceId !== authority.workspaceId ||
        candidate.workspaceRevision !== authority.workspaceRevision ||
        stagedArtifacts.length > maximumReceipts ||
        typeof artifactSource?.read !== 'function' ||
        typeof attestationAuthority?.sign !== 'function'
      ) {
        return fail('promotion-binding');
      }
      const createBase = Object.freeze({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'promotion-create-request' as const,
        authority,
        sandboxRegistrationReceiptDigest: registration.receiptDigest,
        cellId,
        candidate: encodeVerificationEvidenceCandidate(candidate),
        idempotencyKey,
      });
      const createdRequest = requestFor(
        authority,
        'promotion.create',
        'promotions',
        createBase,
        registration.receiptDigest
      );
      let promotion = decodeAgentEvaluationVerificationEvidencePromotionReceipt(
        await input.authority.dispatch({
          request: createdRequest.request,
          authority,
          previousSnapshot: null,
        }),
        createdRequest.request.requestDigest
      );
      const uploadReceipts: CanonicalDigest[] = [];
      let prepared:
        | ReturnType<
            typeof decodeAgentEvaluationVerificationEvidencePreparationReceipt
          >
        | undefined;
      let attestation: AgentJsonValue | undefined;
      try {
        for (const artifact of stagedArtifacts) {
          const bytes = await artifactSource.read(artifact);
          try {
            if (
              !(bytes instanceof Uint8Array) ||
              bytes.byteLength !== artifact.size ||
              bytes.byteLength > maximumArtifactBytes ||
              computeVerificationArtifactContentDigest(bytes) !==
                artifact.digest ||
              !mediaTypePattern.test(artifact.mediaType)
            ) {
              return fail('artifact');
            }
            const uploadBase = Object.freeze({
              format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
              version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
              kind: 'artifact-upload-request' as const,
              authority,
              sandboxRegistrationReceiptDigest: registration.receiptDigest,
              promotionId: promotion.promotionId,
              cellId,
              uploadCapability: promotion.uploadCapability,
              artifact: Object.freeze({
                id: artifact.id,
                stagingArtifactId: artifact.stagingArtifactId,
                kind: artifact.kind,
                digest: artifact.digest,
                size: artifact.size,
                mediaType: artifact.mediaType,
                bytesBase64: Buffer.from(bytes).toString('base64'),
              }),
              idempotencyKey: `${idempotencyKey}.artifact.${artifact.id}`,
            });
            const uploadRequest = requestFor(
              authority,
              'artifact.upload',
              'promotions/{promotionId}/artifacts/{artifactId}',
              uploadBase,
              registration.receiptDigest
            );
            const uploaded =
              decodeAgentEvaluationVerificationEvidenceArtifactUploadReceipt(
                await input.authority.dispatch({
                  request: uploadRequest.request,
                  authority,
                  previousSnapshot: null,
                }),
                {
                  requestDigest: uploadRequest.request.requestDigest,
                  promotionId: promotion.promotionId,
                  artifact,
                }
              );
            uploadReceipts.push(uploaded.receiptDigest);
          } finally {
            bytes.fill(0);
          }
        }
        const prepareBase = Object.freeze({
          format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
          version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
          kind: 'promotion-prepare-request' as const,
          authority,
          sandboxRegistrationReceiptDigest: registration.receiptDigest,
          promotionId: promotion.promotionId,
          cellId,
          uploadCapability: promotion.uploadCapability,
          idempotencyKey: `${idempotencyKey}.prepare`,
        });
        const prepareRequest = requestFor(
          authority,
          'promotion.prepare',
          'promotions/{promotionId}/prepare',
          prepareBase,
          registration.receiptDigest
        );
        prepared = decodeAgentEvaluationVerificationEvidencePreparationReceipt(
          await input.authority.dispatch({
            request: prepareRequest.request,
            authority,
            previousSnapshot: null,
          }),
          {
            requestDigest: prepareRequest.request.requestDigest,
            promotionId: promotion.promotionId,
            evidenceId: promotion.evidenceId,
          }
        );
        attestation = await attestationAuthority.sign({
          authorityDigest: authority.authorityDigest,
          verificationAttemptGrantReceiptDigest: grantReceipt.receiptDigest,
          candidateDigest: candidate.candidateDigest as CanonicalDigest,
          attestationNonce: prepared.attestationNonce,
          attestationStatement: prepared.attestationStatement,
          attestationStatementDigest: prepared.attestationStatementDigest,
        });
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          attestation,
          input.forbiddenCanaries
        );
        const finalBase = Object.freeze({
          format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
          version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
          kind: 'promotion-final-commit-request' as const,
          authority,
          sandboxRegistrationReceiptDigest: registration.receiptDigest,
          promotionId: promotion.promotionId,
          cellId,
          uploadCapability: promotion.uploadCapability,
          attestation,
          idempotencyKey: `${idempotencyKey}.final-commit`,
        });
        const finalRequest = requestFor(
          authority,
          'promotion.final-commit',
          'promotions/{promotionId}/final-commit',
          finalBase,
          registration.receiptDigest
        );
        const finalized =
          decodeAgentEvaluationVerificationEvidenceFinalizationReceipt(
            await input.authority.dispatch({
              request: finalRequest.request,
              authority,
              previousSnapshot: null,
            }),
            {
              requestDigest: finalRequest.request.requestDigest,
              promotionId: promotion.promotionId,
              evidenceId: promotion.evidenceId,
              candidate,
            }
          );
        const result = Object.freeze({
          evidence: Object.freeze({
            ...finalized.manifest.evidence,
            manifestDigest: finalized.manifest.manifestDigest,
          }),
          manifest: finalized.manifest,
          authorityReceiptDigests: Object.freeze([
            registration.receiptDigest,
            promotion.receiptDigest,
            ...uploadReceipts,
            prepared.receiptDigest,
            finalized.receiptDigest,
          ]),
        });
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          result,
          input.forbiddenCanaries
        );
        return result;
      } finally {
        promotion = Object.freeze({
          ...promotion,
          uploadCapability: '',
        });
        if (prepared) {
          prepared = Object.freeze({
            ...prepared,
            attestationNonce: '',
            attestationStatement: null,
          });
        }
        attestation = undefined;
      }
    },
    async resolveVerifiedView(
      viewInput: Parameters<
        AgentEvaluationVerificationEvidenceBridge['resolveVerifiedView']
      >[0]
    ) {
      const { authority, registration, evidenceIds, idempotencyKey } =
        viewInput;
      if (closed) return fail('closed');
      assertRegistration(registration, authority);
      const normalizedEvidenceIds = Object.freeze(
        [...evidenceIds].sort(compareUnicodeCodePoints)
      );
      if (
        !idempotencyPattern.test(idempotencyKey) ||
        normalizedEvidenceIds.length < 1 ||
        normalizedEvidenceIds.length > maximumReceipts ||
        normalizedEvidenceIds.some((id) => !isAgentControlIdentity(id)) ||
        new Set(normalizedEvidenceIds).size !== normalizedEvidenceIds.length
      ) {
        return fail('verified-view-binding');
      }
      const requestBase = Object.freeze({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'verified-view-resolve-request' as const,
        authority,
        sandboxRegistrationReceiptDigest: registration.receiptDigest,
        evidenceIds: normalizedEvidenceIds,
        workspaceRevision: authority.workspaceRevision,
        verificationPlanDigest: authority.verificationPlanDigest,
        idempotencyKey,
      });
      const requestDigest = digestAgentCanonicalValue(requestBase);
      const request: AgentEvaluationOwnerAuthorityRequest = Object.freeze({
        format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
        version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
        serviceKind: 'verification-evidence',
        mode: 'read',
        namespaceId: authority.namespaceId,
        planDigest: authority.evaluationPlanDigest,
        repositoryCommit: authority.repositoryCommit,
        operation: 'verified-view.resolve',
        routeBinding: 'verified-view/resolve',
        requestDigest,
        attemptId: authority.descriptor.attemptId,
        descriptorDigest: authority.descriptor.descriptorDigest,
        generation: authority.generation,
        authorityDigest: authority.authorityDigest,
        sandboxRegistrationReceiptDigest: registration.receiptDigest,
        claimGeneration: 0,
        payload: Object.freeze({ ...requestBase, requestDigest }),
      });
      const resolved = await input.authority.resolveDirect({
        request,
        authority,
        evidenceIds: normalizedEvidenceIds,
      });
      if (resolved.requestDigest !== requestDigest) {
        return fail('verified-view-response');
      }
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        resolved,
        input.forbiddenCanaries
      );
      return resolved;
    },
    close() {
      closePromise ??= input.authority.close().then((result) => {
        assertClean(result);
        closed = true;
        return result;
      });
      return closePromise;
    },
  });
  return bridge;
};
