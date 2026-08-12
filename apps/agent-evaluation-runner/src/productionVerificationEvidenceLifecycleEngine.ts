import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  decodeVerificationEvidenceCandidate,
  digestVerificationValue,
  validateVerificationEvidenceCandidate,
  type VerificationAdapterStagedArtifactRef,
  type VerificationEvidenceCandidate,
} from '@prodivix/verification';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
  createAgentEvaluationVerificationEvidenceBridgeAuthority,
  decodeAgentEvaluationVerificationEvidenceArtifactUploadReceipt,
  decodeAgentEvaluationVerificationEvidenceFinalizationReceipt,
  decodeAgentEvaluationVerificationEvidencePreparationReceipt,
  decodeAgentEvaluationVerificationEvidencePromotionReceipt,
  type AgentEvaluationVerificationEvidenceBridgeAuthority,
} from './evaluationVerificationEvidenceBridge';
import {
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT,
  decodeAgentEvaluationVerificationEvidencePublicResult,
  matchAgentEvaluationVerificationEvidencePublicResponse,
  type AgentEvaluationOwnerStateTransition,
  type AgentEvaluationVerificationEvidenceOwnerStateSnapshot,
  type AgentEvaluationVerificationEvidencePublicResult,
} from './ownerState';
import type { AgentEvaluationOwnerAuthorityRequest } from './productionOwnerAuthoritySidecar';
import type { ProductionAgentEvaluationVerificationEvidenceOwnerReadAuthority } from './productionVerificationEvidenceOwnerRead';
import type {
  OwnerStateExecutionContext,
  ProductionOwnerResourceRetirement,
  ProductionVerificationEvidenceOwnerEngine,
  ProductionVerificationEvidenceOwnerExecution,
} from './productionWorkspaceVerificationOwnerAuthorityPorts';

export type ProductionVerificationEvidenceLifecycleDispatchInput = Readonly<{
  request: AgentEvaluationOwnerAuthorityRequest;
  authority: AgentEvaluationVerificationEvidenceBridgeAuthority;
  previousSnapshot: AgentEvaluationVerificationEvidenceOwnerStateSnapshot | null;
}>;

/**
 * Purpose-bound direct Verification owner. A production implementation must
 * enter the Backend Verification service directly; calling the public G4
 * bridge from the 8791 sidecar would create an 8791 -> 8790 -> 8791 cycle.
 */
export interface ProductionVerificationEvidenceLifecycleAuthority {
  dispatch(
    input: ProductionVerificationEvidenceLifecycleDispatchInput
  ): Promise<unknown>;
  reconstruct(input: {
    request: AgentEvaluationOwnerAuthorityRequest;
    transition: AgentEvaluationOwnerStateTransition;
    snapshot: AgentEvaluationVerificationEvidenceOwnerStateSnapshot;
  }): Promise<unknown>;
  close(): Promise<ProductionOwnerResourceRetirement>;
}

export type CreateProductionVerificationEvidenceLifecycleEngineInput =
  Readonly<{
    readAuthority: ProductionAgentEvaluationVerificationEvidenceOwnerReadAuthority;
    lifecycleAuthority: ProductionVerificationEvidenceLifecycleAuthority;
  }>;

type DecodedPayload = Readonly<{
  authority: AgentEvaluationVerificationEvidenceBridgeAuthority;
  value: Record<string, unknown>;
}>;

const maximumArtifacts = 128;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{15,1023}$/u;

const fail = (code: string): never => {
  throw new TypeError(`G4_VERIFICATION_EVIDENCE_LIFECYCLE_INVALID: ${code}`);
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

const exactClean = (value: ProductionOwnerResourceRetirement): void => {
  if (
    value.status !== 'clean' ||
    value.residualResourceIds.length !== 0 ||
    value.residualCanaryIds.length !== 0
  ) {
    return fail('resource-retirement');
  }
};

const operationBinding = Object.freeze({
  'promotion.create': Object.freeze({
    routeBinding: 'promotions',
    kind: 'promotion-create-request',
    keys: Object.freeze([
      'format',
      'version',
      'kind',
      'authority',
      'sandboxRegistrationReceiptDigest',
      'cellId',
      'candidate',
      'idempotencyKey',
      'requestDigest',
    ]),
  }),
  'artifact.upload': Object.freeze({
    routeBinding: 'promotions/{promotionId}/artifacts/{artifactId}',
    kind: 'artifact-upload-request',
    keys: Object.freeze([
      'format',
      'version',
      'kind',
      'authority',
      'sandboxRegistrationReceiptDigest',
      'promotionId',
      'cellId',
      'uploadCapability',
      'artifact',
      'idempotencyKey',
      'requestDigest',
    ]),
  }),
  'promotion.prepare': Object.freeze({
    routeBinding: 'promotions/{promotionId}/prepare',
    kind: 'promotion-prepare-request',
    keys: Object.freeze([
      'format',
      'version',
      'kind',
      'authority',
      'sandboxRegistrationReceiptDigest',
      'promotionId',
      'cellId',
      'uploadCapability',
      'idempotencyKey',
      'requestDigest',
    ]),
  }),
  'promotion.final-commit': Object.freeze({
    routeBinding: 'promotions/{promotionId}/final-commit',
    kind: 'promotion-final-commit-request',
    keys: Object.freeze([
      'format',
      'version',
      'kind',
      'authority',
      'sandboxRegistrationReceiptDigest',
      'promotionId',
      'cellId',
      'uploadCapability',
      'attestation',
      'idempotencyKey',
      'requestDigest',
    ]),
  }),
});

type LifecycleOperation = keyof typeof operationBinding;

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
): DecodedPayload => {
  const binding = operationBinding[request.operation as LifecycleOperation];
  const value = request.payload;
  if (
    request.serviceKind !== 'verification-evidence' ||
    request.mode !== 'execute' ||
    !binding ||
    request.routeBinding !== binding.routeBinding ||
    !exactRecord(value, binding.keys) ||
    value.format !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT ||
    value.version !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION ||
    value.kind !== binding.kind ||
    value.requestDigest !== request.requestDigest ||
    value.sandboxRegistrationReceiptDigest !==
      request.sandboxRegistrationReceiptDigest ||
    typeof value.idempotencyKey !== 'string' ||
    !idempotencyPattern.test(value.idempotencyKey)
  ) {
    return fail('request-payload');
  }
  const authority = decodeAuthority(value.authority);
  if (
    authority.namespaceId !== request.namespaceId ||
    authority.evaluationPlanDigest !== request.planDigest ||
    authority.repositoryCommit !== request.repositoryCommit ||
    authority.descriptor.attemptId !== request.attemptId ||
    authority.descriptor.descriptorDigest !== request.descriptorDigest ||
    authority.generation !== request.generation ||
    authority.authorityDigest !== request.authorityDigest
  ) {
    return fail('request-authority-binding');
  }
  return Object.freeze({ authority, value });
};

const candidateFromWire = (value: unknown): VerificationEvidenceCandidate => {
  const decoded = decodeVerificationEvidenceCandidate(value);
  if (decoded.status !== 'ready') return fail('candidate');
  return decoded.candidate;
};

const candidateFromSnapshot = (
  snapshot: AgentEvaluationVerificationEvidenceOwnerStateSnapshot
): VerificationEvidenceCandidate => {
  const validated = validateVerificationEvidenceCandidate(
    snapshot.candidate as VerificationEvidenceCandidate
  );
  if (
    validated.status !== 'ready' ||
    validated.candidate.candidateDigest !== snapshot.candidateDigest
  ) {
    return fail('snapshot-candidate');
  }
  return validated.candidate;
};

const artifactFromPayload = (
  value: Record<string, unknown>
): VerificationAdapterStagedArtifactRef => {
  const artifact = value.artifact;
  if (
    !exactRecord(artifact, [
      'id',
      'stagingArtifactId',
      'kind',
      'digest',
      'size',
      'mediaType',
      'bytesBase64',
    ]) ||
    !isAgentControlIdentity(artifact.id) ||
    !isAgentControlIdentity(artifact.stagingArtifactId) ||
    typeof artifact.kind !== 'string' ||
    !isAgentCanonicalDigest(artifact.digest) ||
    !Number.isSafeInteger(artifact.size) ||
    Number(artifact.size) < 0 ||
    typeof artifact.mediaType !== 'string' ||
    typeof artifact.bytesBase64 !== 'string'
  ) {
    return fail('artifact');
  }
  return Object.freeze({
    id: artifact.id,
    stagingArtifactId: artifact.stagingArtifactId,
    kind: artifact.kind,
    digest: artifact.digest,
    size: artifact.size,
    mediaType: artifact.mediaType,
  }) as VerificationAdapterStagedArtifactRef;
};

const publicResult = (
  operation: LifecycleOperation,
  requestDigest: CanonicalDigest,
  responseReceiptDigest: CanonicalDigest,
  responseProjection: unknown
): AgentEvaluationVerificationEvidencePublicResult =>
  decodeAgentEvaluationVerificationEvidencePublicResult(
    Object.freeze({
      format: 'prodivix.agent-evaluation-verification-evidence-public-result',
      version: AGENT_EVALUATION_OWNER_STATE_VERSION,
      operation,
      requestDigest,
      responseReceiptDigest,
      responseProjection,
      responseProjectionDigest: digestAgentCanonicalValue(responseProjection),
    }),
    { operation, requestDigest }
  );

const snapshot = (
  context: OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>,
  input: Omit<
    AgentEvaluationVerificationEvidenceOwnerStateSnapshot,
    | 'format'
    | 'version'
    | 'namespaceId'
    | 'planDigest'
    | 'repositoryCommit'
    | 'attemptId'
    | 'descriptorDigest'
    | 'generation'
    | 'authorityDigest'
    | 'sandboxRegistrationReceiptDigest'
    | 'revision'
    | 'snapshotDigest'
  >
): AgentEvaluationVerificationEvidenceOwnerStateSnapshot => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    namespaceId: context.identity.namespaceId,
    planDigest: context.identity.planDigest,
    repositoryCommit: context.identity.repositoryCommit,
    attemptId: context.identity.attemptId,
    descriptorDigest: context.identity.descriptorDigest,
    generation: context.identity.generation,
    authorityDigest: context.identity.grantOrAuthorityDigest,
    sandboxRegistrationReceiptDigest:
      context.request.sandboxRegistrationReceiptDigest!,
    revision: context.nextRevision,
    ...input,
  });
  return Object.freeze({
    ...base,
    snapshotDigest: digestAgentCanonicalValue(base),
  });
};

const createSnapshot = (
  context: OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>,
  authority: AgentEvaluationVerificationEvidenceBridgeAuthority,
  candidate: VerificationEvidenceCandidate,
  promotion: ReturnType<
    typeof decodeAgentEvaluationVerificationEvidencePromotionReceipt
  >
): AgentEvaluationVerificationEvidenceOwnerStateSnapshot => {
  const emptyArtifacts = Object.freeze([]);
  return snapshot(context, {
    state: 'active',
    promotionId: promotion.promotionId,
    evidenceId: promotion.evidenceId,
    projectId: authority.projectId,
    workspaceId: authority.workspaceId,
    workspaceRevision: authority.workspaceRevision,
    verificationPlanDigest: authority.verificationPlanDigest,
    adapterRegistryDigest: authority.adapterRegistryDigest,
    candidate,
    candidateDigest: candidate.candidateDigest as CanonicalDigest,
    createdAt: candidate.provenance.issuedAt,
    deadlineAt: candidate.promotion.deadline,
    uploadCapabilityDigest: digestAgentCanonicalValue(
      promotion.uploadCapability
    ),
    attestationNonceDigest: null,
    attestationStatement: null,
    attestationStatementDigest: null,
    uploadedArtifactManifests: emptyArtifacts,
    artifactManifestSetDigest: digestAgentCanonicalValue(emptyArtifacts),
    verifiedClaims: null,
    verifiedClaimSetDigest: null,
    finalManifest: null,
    finalManifestDigest: null,
    evidenceRecords: null,
    evidenceRecordSetDigest: null,
  });
};

const carrySnapshot = (
  context: OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>,
  previous: AgentEvaluationVerificationEvidenceOwnerStateSnapshot,
  overrides: Partial<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>
): AgentEvaluationVerificationEvidenceOwnerStateSnapshot => {
  const {
    format: _format,
    version: _version,
    namespaceId: _namespaceId,
    planDigest: _planDigest,
    repositoryCommit: _repositoryCommit,
    attemptId: _attemptId,
    descriptorDigest: _descriptorDigest,
    generation: _generation,
    authorityDigest: _authorityDigest,
    sandboxRegistrationReceiptDigest: _sandboxRegistrationReceiptDigest,
    revision: _revision,
    snapshotDigest: _snapshotDigest,
    ...body
  } = previous;
  return snapshot(context, { ...body, ...overrides });
};

const requirePrior = (
  context: OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>,
  expectedState: AgentEvaluationVerificationEvidenceOwnerStateSnapshot['state'],
  authority: AgentEvaluationVerificationEvidenceBridgeAuthority,
  value: Record<string, unknown>
): AgentEvaluationVerificationEvidenceOwnerStateSnapshot => {
  const previous = context.previousSnapshot;
  if (
    !previous ||
    previous.state !== expectedState ||
    previous.authorityDigest !== authority.authorityDigest ||
    previous.promotionId !== value.promotionId ||
    previous.sandboxRegistrationReceiptDigest !==
      context.request.sandboxRegistrationReceiptDigest
  ) {
    return fail('prior-state');
  }
  return previous;
};

const executeCreate = async (
  context: OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>,
  lifecycle: ProductionVerificationEvidenceLifecycleAuthority,
  decoded: DecodedPayload
): Promise<ProductionVerificationEvidenceOwnerExecution> => {
  if (context.previousSnapshot !== null || context.prior.revision !== 0) {
    return fail('create-prior');
  }
  const candidate = candidateFromWire(decoded.value.candidate);
  if (
    candidate.projectId !== decoded.authority.projectId ||
    candidate.workspaceId !== decoded.authority.workspaceId ||
    candidate.workspaceRevision !== decoded.authority.workspaceRevision ||
    candidate.planDigest !== decoded.authority.verificationPlanDigest ||
    candidate.cellId !== decoded.value.cellId ||
    candidate.attemptId !== decoded.authority.descriptor.attemptId ||
    candidate.promotion.idempotencyKey !== decoded.value.idempotencyKey
  ) {
    return fail('create-candidate-binding');
  }
  const response = decodeAgentEvaluationVerificationEvidencePromotionReceipt(
    await lifecycle.dispatch({
      request: context.request,
      authority: decoded.authority,
      previousSnapshot: null,
    }),
    context.request.requestDigest
  );
  const projection = Object.freeze({
    kind: response.kind,
    promotionId: response.promotionId,
    evidenceId: response.evidenceId,
    uploadCapabilityDigest: digestAgentCanonicalValue(
      response.uploadCapability
    ),
  });
  return Object.freeze({
    response,
    publicResult: publicResult(
      'promotion.create',
      context.request.requestDigest,
      response.receiptDigest,
      projection
    ),
    snapshot: createSnapshot(context, decoded.authority, candidate, response),
  });
};

const executeUpload = async (
  context: OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>,
  lifecycle: ProductionVerificationEvidenceLifecycleAuthority,
  decoded: DecodedPayload
): Promise<ProductionVerificationEvidenceOwnerExecution> => {
  const previous = requirePrior(
    context,
    'active',
    decoded.authority,
    decoded.value
  );
  const artifact = artifactFromPayload(decoded.value);
  const candidate = candidateFromSnapshot(previous);
  const expectedArtifact = candidate.artifacts.find(
    ({ id }) => id === artifact.id
  );
  if (
    !expectedArtifact ||
    expectedArtifact.stagingArtifactId !== artifact.stagingArtifactId ||
    expectedArtifact.kind !== artifact.kind ||
    expectedArtifact.expectedDigest !== artifact.digest ||
    expectedArtifact.expectedSize !== artifact.size ||
    expectedArtifact.expectedMediaType !== artifact.mediaType ||
    digestAgentCanonicalValue(decoded.value.uploadCapability) !==
      previous.uploadCapabilityDigest
  ) {
    return fail('upload-binding');
  }
  const response =
    decodeAgentEvaluationVerificationEvidenceArtifactUploadReceipt(
      await lifecycle.dispatch({
        request: context.request,
        authority: decoded.authority,
        previousSnapshot: previous,
      }),
      {
        requestDigest: context.request.requestDigest,
        promotionId: previous.promotionId!,
        artifact,
      }
    );
  const manifests = Object.freeze(
    [
      ...((previous.uploadedArtifactManifests ?? []) as readonly Record<
        string,
        unknown
      >[]),
      Object.freeze({
        artifactId: response.artifactId,
        artifactDigest: response.artifactDigest,
        artifactSize: response.artifactSize,
        mediaType: response.mediaType,
        uploadReceiptDigest: response.receiptDigest,
      }),
    ].sort((left, right) =>
      compareUnicodeCodePoints(
        String(left.artifactId),
        String(right.artifactId)
      )
    )
  );
  if (
    manifests.length > maximumArtifacts ||
    new Set(manifests.map(({ artifactId }) => artifactId)).size !==
      manifests.length
  ) {
    return fail('artifact-set');
  }
  return Object.freeze({
    response,
    publicResult: publicResult(
      'artifact.upload',
      context.request.requestDigest,
      response.receiptDigest,
      response
    ),
    snapshot: carrySnapshot(context, previous, {
      uploadedArtifactManifests: manifests,
      artifactManifestSetDigest: digestAgentCanonicalValue(manifests),
    }),
  });
};

const executePrepare = async (
  context: OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>,
  lifecycle: ProductionVerificationEvidenceLifecycleAuthority,
  decoded: DecodedPayload
): Promise<ProductionVerificationEvidenceOwnerExecution> => {
  const previous = requirePrior(
    context,
    'active',
    decoded.authority,
    decoded.value
  );
  const candidate = candidateFromSnapshot(previous);
  if (
    digestAgentCanonicalValue(decoded.value.uploadCapability) !==
    previous.uploadCapabilityDigest
  ) {
    return fail('prepare-capability-binding');
  }
  const uploaded = new Map(
    (previous.uploadedArtifactManifests ?? []).map((entry) => [
      (entry as Readonly<{ artifactId: string }>).artifactId,
      entry as Readonly<{ artifactDigest: CanonicalDigest }>,
    ])
  );
  if (
    candidate.artifacts.length !== uploaded.size ||
    candidate.artifacts.some(
      (artifact) =>
        uploaded.get(artifact.id)?.artifactDigest !== artifact.expectedDigest
    )
  ) {
    return fail('prepare-artifact-set');
  }
  const response = decodeAgentEvaluationVerificationEvidencePreparationReceipt(
    await lifecycle.dispatch({
      request: context.request,
      authority: decoded.authority,
      previousSnapshot: previous,
    }),
    {
      requestDigest: context.request.requestDigest,
      promotionId: previous.promotionId!,
      evidenceId: previous.evidenceId ?? fail('prepare-evidence-id'),
    }
  );
  const projection = Object.freeze({
    kind: response.kind,
    promotionId: response.promotionId,
    evidenceId: response.evidenceId,
    attestationNonceDigest: digestAgentCanonicalValue(
      response.attestationNonce
    ),
    attestationStatement: response.attestationStatement,
    attestationStatementDigest: response.attestationStatementDigest,
  });
  return Object.freeze({
    response,
    publicResult: publicResult(
      'promotion.prepare',
      context.request.requestDigest,
      response.receiptDigest,
      projection
    ),
    snapshot: carrySnapshot(context, previous, {
      state: 'prepared',
      attestationNonceDigest: projection.attestationNonceDigest,
      attestationStatement: projection.attestationStatement,
      attestationStatementDigest: projection.attestationStatementDigest,
    }),
  });
};

const executeFinalCommit = async (
  context: OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>,
  lifecycle: ProductionVerificationEvidenceLifecycleAuthority,
  decoded: DecodedPayload
): Promise<ProductionVerificationEvidenceOwnerExecution> => {
  const previous = requirePrior(
    context,
    'prepared',
    decoded.authority,
    decoded.value
  );
  const candidate = candidateFromSnapshot(previous);
  if (
    digestAgentCanonicalValue(decoded.value.uploadCapability) !==
      previous.uploadCapabilityDigest ||
    decoded.value.attestation === null ||
    decoded.value.attestation === undefined
  ) {
    return fail('final-commit-binding');
  }
  const evidenceId = previous.evidenceId ?? fail('final-evidence-id');
  const response = decodeAgentEvaluationVerificationEvidenceFinalizationReceipt(
    await lifecycle.dispatch({
      request: context.request,
      authority: decoded.authority,
      previousSnapshot: previous,
    }),
    {
      requestDigest: context.request.requestDigest,
      promotionId: previous.promotionId!,
      evidenceId,
      candidate,
    }
  );
  if (
    response.manifest.verifiedProvenance.kind !== 'attested' ||
    response.manifest.statementDigest !== previous.attestationStatementDigest ||
    response.manifest.candidateDigest !== candidate.candidateDigest ||
    response.manifest.verifiedProvenance.claims.statementDigest !==
      previous.attestationStatementDigest ||
    response.manifest.verifiedProvenance.claims.candidateDigest !==
      candidate.candidateDigest
  ) {
    return fail('final-attestation-binding');
  }
  const materializedEvidence = Object.freeze({
    ...response.manifest.evidence,
    manifestDigest: response.manifest.manifestDigest,
  });
  const evidenceRecords = Object.freeze([
    Object.freeze({
      evidenceId: response.evidenceId,
      manifestDigest: response.manifest.manifestDigest,
      materializedEvidenceDigest: digestVerificationValue(materializedEvidence),
    }),
  ]);
  const verifiedClaims = Object.freeze([
    Object.freeze({
      claimDigest: response.manifest.verifiedProvenance.claims.claimsDigest,
      claims: response.manifest.verifiedProvenance.claims,
    }),
  ]);
  return Object.freeze({
    response,
    publicResult: publicResult(
      'promotion.final-commit',
      context.request.requestDigest,
      response.receiptDigest,
      response
    ),
    snapshot: carrySnapshot(context, previous, {
      state: 'finalized',
      verifiedClaims,
      verifiedClaimSetDigest: digestAgentCanonicalValue(verifiedClaims),
      finalManifest: response.manifest,
      finalManifestDigest: digestAgentCanonicalValue(response.manifest),
      evidenceRecords,
      evidenceRecordSetDigest: digestAgentCanonicalValue(evidenceRecords),
    }),
  });
};

export const createProductionAgentEvaluationVerificationEvidenceLifecycleEngine =
  (
    input: CreateProductionVerificationEvidenceLifecycleEngineInput
  ): ProductionVerificationEvidenceOwnerEngine => {
    let closePromise: Promise<ProductionOwnerResourceRetirement> | undefined;
    const engine: ProductionVerificationEvidenceOwnerEngine = Object.freeze({
      read(request: AgentEvaluationOwnerAuthorityRequest) {
        return input.readAuthority.read(request);
      },
      async execute(
        context: OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>
      ) {
        const decoded = decodePayload(context.request);
        switch (context.request.operation) {
          case 'promotion.create':
            return executeCreate(context, input.lifecycleAuthority, decoded);
          case 'artifact.upload':
            return executeUpload(context, input.lifecycleAuthority, decoded);
          case 'promotion.prepare':
            return executePrepare(context, input.lifecycleAuthority, decoded);
          case 'promotion.final-commit':
            return executeFinalCommit(
              context,
              input.lifecycleAuthority,
              decoded
            );
          default:
            return fail('operation');
        }
      },
      async reconstructResponse({
        request,
        transition,
        snapshot: state,
      }: Readonly<{
        request: AgentEvaluationOwnerAuthorityRequest;
        transition: AgentEvaluationOwnerStateTransition;
        snapshot: AgentEvaluationVerificationEvidenceOwnerStateSnapshot;
      }>) {
        const result = decodeAgentEvaluationVerificationEvidencePublicResult(
          transition.publicResult,
          { operation: request.operation, requestDigest: request.requestDigest }
        );
        const response =
          result.operation === 'promotion.create' ||
          result.operation === 'promotion.prepare'
            ? await input.lifecycleAuthority.reconstruct({
                request,
                transition,
                snapshot: state,
              })
            : result.responseProjection;
        if (
          !matchAgentEvaluationVerificationEvidencePublicResponse(
            result,
            response
          )
        ) {
          return fail('reconstructed-response');
        }
        return response;
      },
      close() {
        closePromise ??= (async () => {
          const retirement = await input.lifecycleAuthority.close();
          exactClean(retirement);
          return retirement;
        })();
        return closePromise;
      },
    });
    return engine;
  };
