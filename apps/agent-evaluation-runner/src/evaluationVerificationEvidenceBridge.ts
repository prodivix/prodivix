import {
  canonicalAgentEvaluationVerificationAttemptGrantReceipts,
  digestAgentCanonicalValue,
  digestAgentEvaluationVerificationAttemptGrantReceiptDigestSet,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentModelEvaluationAttemptDescriptor,
  type AgentEvaluationVerificationAttemptGrantReceipt,
  type AgentJsonValue,
  type AgentModelEvaluationAttemptDescriptor,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  computeVerificationArtifactContentDigest,
  createVerificationEvidenceStatementDigest,
  decodeVerificationEvidenceManifest,
  decodeVerificationEvidenceVerifiedView,
  encodeVerificationEvidenceCandidate,
  type VerificationAdapterStagedArtifactRef,
  type VerificationEvidence,
  type VerificationEvidenceCandidate,
  type VerificationEvidenceManifest,
  type VerificationEvidenceStatement,
  type VerificationEvidenceVerifiedView,
} from '@prodivix/verification';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
  type AgentEvaluationRunnerErrorCode,
} from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  createCredentialCanarySignatures,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';
import {
  deriveAgentEvaluationAuthorityTransportTimeoutMs,
  resolveAgentEvaluationAuthorityTransportTimeoutMs,
  type AgentEvaluationAuthorityTransportClass,
} from './authorityTransportDeadline';

export const AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT =
  'prodivix.agent-evaluation-verification-evidence-bridge' as const;
export const AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION = 1 as const;
export const AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_ROUTE =
  'verification-evidence' as const;

const maximumRequestBytes = 25_296_896;
const maximumResponseBytes = 8_388_608;
const maximumArtifactBytes = 8_388_608;
const maximumReceiptCount = 128;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const exactCommitPattern = /^[a-f0-9]{40}$/u;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

const statementDigestMatches = (
  statement: unknown,
  expectedDigest: unknown
): boolean => {
  if (!isAgentCanonicalDigest(expectedDigest)) return false;
  try {
    return (
      createVerificationEvidenceStatementDigest(
        statement as VerificationEvidenceStatement
      ) === expectedDigest
    );
  } catch {
    return false;
  }
};

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationVerificationEvidenceBridgeAuthorityInput = Readonly<{
  namespaceId: string;
  evaluationPlanDigest: CanonicalDigest;
  repositoryCommit: string;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  generation: number;
  controlledWorkspaceGrantDigest: CanonicalDigest;
  projectId: string;
  workspaceId: string;
  workspaceRevision: number;
  verificationPlanDigest: CanonicalDigest;
  sandboxPolicyDigest: CanonicalDigest;
  adapterRegistryDigest: CanonicalDigest;
  baseSnapshotDigest: CanonicalDigest;
  finalSnapshotDigest: CanonicalDigest;
  verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
}>;

export type AgentEvaluationVerificationEvidenceBridgeAuthority =
  AgentEvaluationVerificationEvidenceBridgeAuthorityInput &
    Readonly<{
      verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
      authorityDigest: CanonicalDigest;
    }>;

export type AgentEvaluationVerificationEvidenceSandboxRegistrationReceipt =
  Readonly<{
    format: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT;
    version: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION;
    kind: 'sandbox-registration';
    requestDigest: CanonicalDigest;
    idempotencyKey: string;
    registrationId: string;
    registrationDigest: CanonicalDigest;
    receiptDigest: CanonicalDigest;
  }>;

export type AgentEvaluationVerificationEvidencePromotionReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT;
  version: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION;
  kind: 'promotion-created';
  requestDigest: CanonicalDigest;
  promotionId: string;
  evidenceId: string;
  uploadCapability: string;
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationVerificationEvidencePreparationReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT;
  version: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION;
  kind: 'promotion-prepared';
  requestDigest: CanonicalDigest;
  promotionId: string;
  evidenceId: string;
  attestationNonce: string;
  attestationStatement: AgentJsonValue;
  attestationStatementDigest: CanonicalDigest;
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationVerificationEvidenceArtifactUploadReceipt =
  Readonly<{
    format: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT;
    version: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION;
    kind: 'artifact-uploaded';
    requestDigest: CanonicalDigest;
    promotionId: string;
    artifactId: string;
    artifactDigest: CanonicalDigest;
    artifactSize: number;
    mediaType: string;
    receiptDigest: CanonicalDigest;
  }>;

export type AgentEvaluationVerificationEvidenceFinalizationReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT;
  version: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION;
  kind: 'promotion-finalized';
  requestDigest: CanonicalDigest;
  promotionId: string;
  evidenceId: string;
  manifest: VerificationEvidenceManifest;
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationVerificationEvidenceVerifiedViewReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT;
  version: typeof AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION;
  kind: 'verified-view-resolved';
  requestDigest: CanonicalDigest;
  verifiedEvidenceView: VerificationEvidenceVerifiedView;
  revokedEvidenceIds: readonly string[];
  receiptDigest: CanonicalDigest;
}>;

export interface AgentEvaluationVerificationEvidenceAttestationAuthority {
  sign(
    input: Readonly<{
      authorityDigest: CanonicalDigest;
      verificationAttemptGrantReceiptDigest: CanonicalDigest;
      candidateDigest: CanonicalDigest;
      attestationNonce: string;
      attestationStatement: AgentJsonValue;
      attestationStatementDigest: CanonicalDigest;
    }>
  ): Promise<AgentJsonValue>;
}

export interface AgentEvaluationVerificationEvidenceArtifactSource {
  read(artifact: VerificationAdapterStagedArtifactRef): Promise<Uint8Array>;
}

export type AgentEvaluationVerificationEvidencePromotionResult = Readonly<{
  evidence: VerificationEvidence;
  manifest: VerificationEvidenceManifest;
  authorityReceiptDigests: readonly CanonicalDigest[];
}>;

export interface AgentEvaluationVerificationEvidenceBridge {
  registerSandbox(input: {
    authority: AgentEvaluationVerificationEvidenceBridgeAuthority;
    idempotencyKey: string;
  }): Promise<AgentEvaluationVerificationEvidenceSandboxRegistrationReceipt>;
  promoteCell(input: {
    authority: AgentEvaluationVerificationEvidenceBridgeAuthority;
    registration: AgentEvaluationVerificationEvidenceSandboxRegistrationReceipt;
    cellId: string;
    candidate: VerificationEvidenceCandidate;
    stagedArtifacts: readonly VerificationAdapterStagedArtifactRef[];
    artifactSource: AgentEvaluationVerificationEvidenceArtifactSource;
    attestationAuthority: AgentEvaluationVerificationEvidenceAttestationAuthority;
    idempotencyKey: string;
  }): Promise<AgentEvaluationVerificationEvidencePromotionResult>;
  resolveVerifiedView(input: {
    authority: AgentEvaluationVerificationEvidenceBridgeAuthority;
    registration: AgentEvaluationVerificationEvidenceSandboxRegistrationReceipt;
    evidenceIds: readonly string[];
    idempotencyKey: string;
  }): Promise<AgentEvaluationVerificationEvidenceVerifiedViewReceipt>;
}

export type CreateEnvironmentAgentEvaluationVerificationEvidenceBridgeInput =
  Readonly<{
    evaluationPlanDigest: CanonicalDigest;
    repositoryCommit: string;
    environment?: Environment;
    fetch?: typeof fetch;
    operationTimeoutMs: number;
  }>;

const fail = (
  code: AgentEvaluationRunnerErrorCode = AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
): never =>
  (() => {
    throw new AgentEvaluationRunnerError(code);
  })();

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

const canonicalId = (value: unknown): value is string =>
  typeof value === 'string' && identityPattern.test(value);

const canonicalIdempotencyKey = (value: unknown): value is string =>
  canonicalId(value) && value.length >= 16;

const positiveSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

const canonicalMediaType = (value: unknown): value is string =>
  typeof value === 'string' &&
  value === value.toLowerCase() &&
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(value);

const authorityBase = (
  input: AgentEvaluationVerificationEvidenceBridgeAuthorityInput
) => {
  const receipts = canonicalAgentEvaluationVerificationAttemptGrantReceipts(
    input.verificationAttemptGrantReceipts
  );
  const verificationAttemptGrantReceiptDigests = receipts.map(
    ({ receiptDigest }) => receiptDigest
  );
  return Object.freeze({
    namespaceId: input.namespaceId,
    evaluationPlanDigest: input.evaluationPlanDigest,
    repositoryCommit: input.repositoryCommit,
    descriptor: input.descriptor,
    generation: input.generation,
    controlledWorkspaceGrantDigest: input.controlledWorkspaceGrantDigest,
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    workspaceRevision: input.workspaceRevision,
    verificationPlanDigest: input.verificationPlanDigest,
    sandboxPolicyDigest: input.sandboxPolicyDigest,
    adapterRegistryDigest: input.adapterRegistryDigest,
    baseSnapshotDigest: input.baseSnapshotDigest,
    finalSnapshotDigest: input.finalSnapshotDigest,
    verificationAttemptGrantReceiptDigests: Object.freeze(
      verificationAttemptGrantReceiptDigests
    ),
    verificationAttemptGrantReceiptSetDigest:
      digestAgentEvaluationVerificationAttemptGrantReceiptDigestSet(
        verificationAttemptGrantReceiptDigests
      ),
  });
};

export const createAgentEvaluationVerificationEvidenceBridgeAuthority = (
  input: AgentEvaluationVerificationEvidenceBridgeAuthorityInput
): AgentEvaluationVerificationEvidenceBridgeAuthority => {
  if (
    !isAgentControlIdentity(input.namespaceId) ||
    !isAgentCanonicalDigest(input.evaluationPlanDigest) ||
    !exactCommitPattern.test(input.repositoryCommit) ||
    !isAgentModelEvaluationAttemptDescriptor(input.descriptor) ||
    input.descriptor.planDigest !== input.evaluationPlanDigest ||
    !positiveSafeInteger(input.generation) ||
    !isAgentCanonicalDigest(input.controlledWorkspaceGrantDigest) ||
    !isAgentControlIdentity(input.projectId) ||
    !isAgentControlIdentity(input.workspaceId) ||
    !positiveSafeInteger(input.workspaceRevision) ||
    !isAgentCanonicalDigest(input.verificationPlanDigest) ||
    !isAgentCanonicalDigest(input.sandboxPolicyDigest) ||
    !isAgentCanonicalDigest(input.adapterRegistryDigest) ||
    !isAgentCanonicalDigest(input.baseSnapshotDigest) ||
    !isAgentCanonicalDigest(input.finalSnapshotDigest)
  ) {
    return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
  }
  let receipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
  try {
    receipts = canonicalAgentEvaluationVerificationAttemptGrantReceipts(
      input.verificationAttemptGrantReceipts
    );
  } catch {
    return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
  }
  if (
    receipts.length === 0 ||
    receipts.length > maximumReceiptCount ||
    receipts.some(
      (receipt) =>
        receipt.namespaceId !== input.namespaceId ||
        receipt.evaluationPlanDigest !== input.evaluationPlanDigest ||
        receipt.repositoryCommit !== input.repositoryCommit ||
        receipt.evaluationAttemptId !== input.descriptor.attemptId ||
        receipt.descriptorDigest !== input.descriptor.descriptorDigest ||
        receipt.capabilityDescriptorDigest !==
          input.descriptor.capabilityDescriptorDigest ||
        receipt.caseId !== input.descriptor.caseId ||
        receipt.generation !== input.generation ||
        receipt.verificationPlanDigest !== input.verificationPlanDigest ||
        receipt.grant.projectId !== input.projectId ||
        receipt.grant.workspaceId !== input.workspaceId ||
        receipt.grant.workspaceRevision !== input.workspaceRevision
    )
  ) {
    return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
  }
  const base = authorityBase({
    ...input,
    verificationAttemptGrantReceipts: receipts,
  });
  return Object.freeze({
    ...input,
    descriptor: Object.freeze({ ...input.descriptor }),
    verificationAttemptGrantReceipts: receipts,
    verificationAttemptGrantReceiptSetDigest:
      base.verificationAttemptGrantReceiptSetDigest,
    authorityDigest: digestAgentCanonicalValue(base),
  });
};

const requestAuthority = (
  authority: AgentEvaluationVerificationEvidenceBridgeAuthority
) => {
  const expected =
    createAgentEvaluationVerificationEvidenceBridgeAuthority(authority);
  if (expected.authorityDigest !== authority.authorityDigest) {
    return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
  }
  return Object.freeze({
    ...authorityBase(authority),
    verificationAttemptGrantReceipts:
      authority.verificationAttemptGrantReceipts,
    authorityDigest: authority.authorityDigest,
  });
};

const receiptDigestMatches = (value: Record<string, unknown>): boolean => {
  const { receiptDigest, ...base } = value;
  return (
    isAgentCanonicalDigest(receiptDigest) &&
    receiptDigest === digestAgentCanonicalValue(base)
  );
};

const parseSafeJson = (source: string): unknown => {
  try {
    return JSON.parse(source, (key, value: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new Error('unsafe-key');
      return value;
    }) as unknown;
  } catch {
    return fail();
  }
};

const readEnvironment = (
  environment: Environment
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const useServiceCredential = async <T>(
  environment: Environment,
  consumer: (credential: Uint8Array) => Promise<T>
): Promise<T> => {
  const read = readEnvironment(environment);
  let source = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token);
  let material: Uint8Array | undefined;
  try {
    if (!isAgentEvaluationServiceToken(source)) {
      return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable);
    }
    material = textEncoder.encode(source);
    return await consumer(material);
  } finally {
    material?.fill(0);
    material = undefined;
    source = undefined;
  }
};

const readBoundedResponse = async (
  response: Response,
  signal: AbortSignal
): Promise<string> => {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) {
        await reader.cancel().catch(() => undefined);
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted);
      }
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maximumResponseBytes) {
        await reader.cancel().catch(() => undefined);
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return textDecoder.decode(bytes);
};

const encodeRequest = (base: Readonly<Record<string, unknown>>) => {
  const requestDigest = digestAgentCanonicalValue(base as AgentJsonValue);
  const request = Object.freeze({ ...base, requestDigest });
  const body = canonicalJsonText(request);
  if (textEncoder.encode(body).byteLength > maximumRequestBytes) {
    return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge);
  }
  return Object.freeze({ request, requestDigest, body });
};

type HttpRequest = (
  method: 'POST' | 'PUT',
  path: string,
  base: Readonly<Record<string, unknown>>,
  transportClass?: AgentEvaluationAuthorityTransportClass
) => Promise<unknown>;

const createHttpRequest =
  (input: {
    environment: Environment;
    fetch: typeof fetch;
    endpoint: string;
    operationTransportTimeoutMs: number;
  }): HttpRequest =>
  async (method, path, base, transportClass = 'short') => {
    const encoded = encodeRequest(base);
    return useServiceCredential(input.environment, async (credential) => {
      const signatures = createCredentialCanarySignatures(credential);
      const authorization = `Bearer ${textDecoder.decode(credential)}`;
      const controller = new AbortController();
      const timeoutMs =
        transportClass === 'operation'
          ? input.operationTransportTimeoutMs
          : resolveAgentEvaluationAuthorityTransportTimeoutMs(
              transportClass,
              input.operationTransportTimeoutMs
            );
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const headers = new Headers({
        Accept: 'application/json',
        Authorization: authorization,
        'Content-Type': 'application/json',
      });
      try {
        const response = await input.fetch(`${input.endpoint}${path}`, {
          method,
          headers,
          body: encoded.body,
          signal: controller.signal,
          redirect: 'error',
          referrerPolicy: 'no-referrer',
        });
        headers.delete('Authorization');
        const text = await readBoundedResponse(response, controller.signal);
        if (
          textContainsCredentialCanary(text, signatures) ||
          !response.ok ||
          !response.headers
            .get('content-type')
            ?.toLowerCase()
            .startsWith('application/json')
        ) {
          if (textContainsCredentialCanary(text, signatures)) {
            return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak);
          }
          return fail();
        }
        const decoded = parseSafeJson(text);
        if (valueContainsCredentialCanary(decoded, credential, signatures)) {
          return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak);
        }
        return decoded;
      } catch (caught) {
        if (caught instanceof AgentEvaluationRunnerError) throw caught;
        if (controller.signal.aborted) {
          return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted);
        }
        throw safeRunnerError(caught);
      } finally {
        clearTimeout(timeout);
        headers.delete('Authorization');
      }
    });
  };

const decodeSandboxRegistration = (
  value: unknown,
  requestDigest: CanonicalDigest,
  idempotencyKey: string
): AgentEvaluationVerificationEvidenceSandboxRegistrationReceipt => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'kind',
      'requestDigest',
      'idempotencyKey',
      'registrationId',
      'registrationDigest',
      'receiptDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT ||
    value.version !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION ||
    value.kind !== 'sandbox-registration' ||
    value.requestDigest !== requestDigest ||
    value.idempotencyKey !== idempotencyKey ||
    !canonicalId(value.registrationId) ||
    !isAgentCanonicalDigest(value.registrationDigest) ||
    !receiptDigestMatches(value)
  ) {
    return fail();
  }
  return Object.freeze(
    value
  ) as AgentEvaluationVerificationEvidenceSandboxRegistrationReceipt;
};

const decodePromotion = (
  value: unknown,
  requestDigest: CanonicalDigest
): AgentEvaluationVerificationEvidencePromotionReceipt => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'kind',
      'requestDigest',
      'promotionId',
      'evidenceId',
      'uploadCapability',
      'receiptDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT ||
    value.version !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION ||
    value.kind !== 'promotion-created' ||
    value.requestDigest !== requestDigest ||
    !canonicalId(value.promotionId) ||
    !canonicalId(value.evidenceId) ||
    typeof value.uploadCapability !== 'string' ||
    value.uploadCapability.length < 32 ||
    value.uploadCapability.length > 4_096 ||
    !receiptDigestMatches(value)
  ) {
    return fail();
  }
  return Object.freeze(
    value
  ) as AgentEvaluationVerificationEvidencePromotionReceipt;
};

const decodePreparation = (
  value: unknown,
  expected: Readonly<{
    requestDigest: CanonicalDigest;
    promotionId: string;
    evidenceId: string;
  }>
): AgentEvaluationVerificationEvidencePreparationReceipt => {
  if (
    !exactRecord(value, [
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
    value.format !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT ||
    value.version !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION ||
    value.kind !== 'promotion-prepared' ||
    value.requestDigest !== expected.requestDigest ||
    value.promotionId !== expected.promotionId ||
    value.evidenceId !== expected.evidenceId ||
    typeof value.attestationNonce !== 'string' ||
    value.attestationNonce.length < 16 ||
    value.attestationNonce.length > 4_096 ||
    !statementDigestMatches(
      value.attestationStatement,
      value.attestationStatementDigest
    ) ||
    !receiptDigestMatches(value)
  ) {
    return fail();
  }
  return Object.freeze(
    value
  ) as AgentEvaluationVerificationEvidencePreparationReceipt;
};

const decodeUpload = (
  value: unknown,
  expected: Readonly<{
    requestDigest: CanonicalDigest;
    promotionId: string;
    artifact: VerificationAdapterStagedArtifactRef;
  }>
): AgentEvaluationVerificationEvidenceArtifactUploadReceipt => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'kind',
      'requestDigest',
      'promotionId',
      'artifactId',
      'artifactDigest',
      'artifactSize',
      'mediaType',
      'receiptDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT ||
    value.version !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION ||
    value.kind !== 'artifact-uploaded' ||
    value.requestDigest !== expected.requestDigest ||
    value.promotionId !== expected.promotionId ||
    value.artifactId !== expected.artifact.id ||
    value.artifactDigest !== expected.artifact.digest ||
    value.artifactSize !== expected.artifact.size ||
    value.mediaType !== expected.artifact.mediaType ||
    !receiptDigestMatches(value)
  ) {
    return fail();
  }
  return Object.freeze(
    value
  ) as AgentEvaluationVerificationEvidenceArtifactUploadReceipt;
};

const decodeFinalization = (
  value: unknown,
  expected: Readonly<{
    requestDigest: CanonicalDigest;
    promotionId: string;
    evidenceId: string;
    candidate: VerificationEvidenceCandidate;
  }>
): AgentEvaluationVerificationEvidenceFinalizationReceipt => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'kind',
      'requestDigest',
      'promotionId',
      'evidenceId',
      'manifest',
      'receiptDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT ||
    value.version !== AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION ||
    value.kind !== 'promotion-finalized' ||
    value.requestDigest !== expected.requestDigest ||
    value.promotionId !== expected.promotionId ||
    value.evidenceId !== expected.evidenceId ||
    !receiptDigestMatches(value)
  ) {
    return fail();
  }
  const decoded = decodeVerificationEvidenceManifest(value.manifest);
  if (
    !decoded.ok ||
    decoded.value.evidence.id !== expected.evidenceId ||
    decoded.value.evidence.workspaceId !== expected.candidate.workspaceId ||
    decoded.value.evidence.workspaceRevision !==
      expected.candidate.workspaceRevision ||
    decoded.value.evidence.planDigest !== expected.candidate.planDigest ||
    decoded.value.evidence.cellId !== expected.candidate.cellId ||
    decoded.value.evidence.attemptId !== expected.candidate.attemptId ||
    decoded.value.candidateDigest !== expected.candidate.candidateDigest
  ) {
    return fail();
  }
  return Object.freeze({
    ...value,
    manifest: decoded.value,
  }) as AgentEvaluationVerificationEvidenceFinalizationReceipt;
};

/** Exact owner-side response decoders shared by the production sidecar engine. */
export const decodeAgentEvaluationVerificationEvidencePromotionReceipt =
  decodePromotion;
export const decodeAgentEvaluationVerificationEvidencePreparationReceipt =
  decodePreparation;
export const decodeAgentEvaluationVerificationEvidenceArtifactUploadReceipt =
  decodeUpload;
export const decodeAgentEvaluationVerificationEvidenceFinalizationReceipt =
  decodeFinalization;

const decodeVerifiedView = (
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
    !Array.isArray(value.revokedEvidenceIds) ||
    value.revokedEvidenceIds.length > maximumReceiptCount ||
    value.revokedEvidenceIds.some((id) => !canonicalId(id)) ||
    new Set(value.revokedEvidenceIds).size !==
      value.revokedEvidenceIds.length ||
    !receiptDigestMatches(value)
  ) {
    return fail();
  }
  const decoded = decodeVerificationEvidenceVerifiedView(
    value.verifiedEvidenceView
  );
  const expectedIds = [...evidenceIds].sort(compareUnicodeCodePoints);
  const actualIds = decoded.ok
    ? decoded.value.records
        .map(({ evidenceId }) => evidenceId)
        .sort(compareUnicodeCodePoints)
    : [];
  if (
    !decoded.ok ||
    expectedIds.length !== actualIds.length ||
    expectedIds.some((id, index) => id !== actualIds[index])
  ) {
    return fail();
  }
  return Object.freeze({
    ...value,
    verifiedEvidenceView: decoded.value,
    revokedEvidenceIds: Object.freeze([...value.revokedEvidenceIds]),
  }) as AgentEvaluationVerificationEvidenceVerifiedViewReceipt;
};

export const createEnvironmentAgentEvaluationVerificationEvidenceBridge = (
  input: CreateEnvironmentAgentEvaluationVerificationEvidenceBridgeInput
): AgentEvaluationVerificationEvidenceBridge => {
  const environment = input.environment ?? process.env;
  const read = readEnvironment(environment);
  const baseUrl = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl);
  const namespaceId = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace);
  const repositoryCommit = read(
    AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
  );
  let operationTransportTimeoutMs: number;
  try {
    operationTransportTimeoutMs =
      deriveAgentEvaluationAuthorityTransportTimeoutMs(
        input.operationTimeoutMs
      );
  } catch {
    return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
  }
  if (
    baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
    !canonicalId(namespaceId) ||
    namespaceId === undefined ||
    repositoryCommit !== input.repositoryCommit ||
    !exactCommitPattern.test(input.repositoryCommit) ||
    !isAgentCanonicalDigest(input.evaluationPlanDigest)
  ) {
    return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
  }
  const endpoint = `${baseUrl}/v1/evaluations/${encodeURIComponent(namespaceId)}/${encodeURIComponent(input.evaluationPlanDigest)}/${encodeURIComponent(input.repositoryCommit)}/${AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_ROUTE}`;
  const request = createHttpRequest({
    environment,
    fetch: input.fetch ?? fetch,
    endpoint,
    operationTransportTimeoutMs,
  });
  const assertAuthority = (
    authority: AgentEvaluationVerificationEvidenceBridgeAuthority
  ) => {
    if (
      authority.namespaceId !== namespaceId ||
      authority.evaluationPlanDigest !== input.evaluationPlanDigest ||
      authority.repositoryCommit !== input.repositoryCommit
    ) {
      return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
    }
    return requestAuthority(authority);
  };

  const bridge: AgentEvaluationVerificationEvidenceBridge = {
    async registerSandbox(registrationInput) {
      const { authority, idempotencyKey } = registrationInput;
      if (!canonicalIdempotencyKey(idempotencyKey)) {
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
      }
      const base = Object.freeze({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'sandbox-registration-request' as const,
        authority: assertAuthority(authority),
        idempotencyKey,
      });
      const encoded = encodeRequest(base);
      return decodeSandboxRegistration(
        await request(
          'PUT',
          `/sandboxes/${encodeURIComponent(authority.descriptor.attemptId)}`,
          base,
          'operation'
        ),
        encoded.requestDigest,
        idempotencyKey
      );
    },

    async promoteCell(promotionInput) {
      const {
        authority,
        registration,
        candidate,
        cellId,
        stagedArtifacts,
        artifactSource,
        attestationAuthority,
        idempotencyKey,
      } = promotionInput;
      if (
        !canonicalIdempotencyKey(idempotencyKey) ||
        !canonicalId(cellId) ||
        candidate.cellId !== cellId ||
        candidate.attemptId !== authority.descriptor.attemptId ||
        candidate.planDigest !== authority.verificationPlanDigest ||
        candidate.projectId !== authority.projectId ||
        candidate.workspaceId !== authority.workspaceId ||
        candidate.workspaceRevision !== authority.workspaceRevision ||
        !authority.verificationAttemptGrantReceipts.some(
          (receipt) => receipt.cellId === cellId
        ) ||
        registration.kind !== 'sandbox-registration'
      ) {
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
      }
      const createBase = Object.freeze({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'promotion-create-request' as const,
        authority: assertAuthority(authority),
        sandboxRegistrationReceiptDigest: registration.receiptDigest,
        cellId,
        candidate: encodeVerificationEvidenceCandidate(candidate),
        idempotencyKey,
      });
      const createEncoded = encodeRequest(createBase);
      let promotion = decodePromotion(
        await request('POST', '/promotions', createBase, 'operation'),
        createEncoded.requestDigest
      );
      const uploadReceipts: AgentEvaluationVerificationEvidenceArtifactUploadReceipt[] =
        [];
      let preparation:
        AgentEvaluationVerificationEvidencePreparationReceipt | undefined;
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
              !canonicalMediaType(artifact.mediaType)
            ) {
              return fail();
            }
            const uploadBase = Object.freeze({
              format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
              version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
              kind: 'artifact-upload-request' as const,
              authority: assertAuthority(authority),
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
            const uploadEncoded = encodeRequest(uploadBase);
            uploadReceipts.push(
              decodeUpload(
                await request(
                  'PUT',
                  `/promotions/${encodeURIComponent(promotion.promotionId)}/artifacts/${encodeURIComponent(artifact.id)}`,
                  uploadBase,
                  'operation'
                ),
                {
                  requestDigest: uploadEncoded.requestDigest,
                  promotionId: promotion.promotionId,
                  artifact,
                }
              )
            );
          } finally {
            bytes.fill(0);
          }
        }
        const prepareBase = Object.freeze({
          format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
          version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
          kind: 'promotion-prepare-request' as const,
          authority: assertAuthority(authority),
          sandboxRegistrationReceiptDigest: registration.receiptDigest,
          promotionId: promotion.promotionId,
          cellId,
          uploadCapability: promotion.uploadCapability,
          idempotencyKey: `${idempotencyKey}.prepare`,
        });
        const prepareEncoded = encodeRequest(prepareBase);
        preparation = decodePreparation(
          await request(
            'POST',
            `/promotions/${encodeURIComponent(promotion.promotionId)}/prepare`,
            prepareBase,
            'operation'
          ),
          {
            requestDigest: prepareEncoded.requestDigest,
            promotionId: promotion.promotionId,
            evidenceId: promotion.evidenceId,
          }
        );
        const grantReceipt = authority.verificationAttemptGrantReceipts.find(
          (receipt) => receipt.cellId === cellId
        )!;
        attestation = await attestationAuthority.sign({
          authorityDigest: authority.authorityDigest,
          verificationAttemptGrantReceiptDigest: grantReceipt.receiptDigest,
          candidateDigest: candidate.candidateDigest as CanonicalDigest,
          attestationNonce: preparation.attestationNonce,
          attestationStatement: preparation.attestationStatement,
          attestationStatementDigest: preparation.attestationStatementDigest,
        });
        const finalizeBase = Object.freeze({
          format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
          version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
          kind: 'promotion-final-commit-request' as const,
          authority: assertAuthority(authority),
          sandboxRegistrationReceiptDigest: registration.receiptDigest,
          promotionId: promotion.promotionId,
          cellId,
          uploadCapability: promotion.uploadCapability,
          attestation,
          idempotencyKey: `${idempotencyKey}.final-commit`,
        });
        const finalizeEncoded = encodeRequest(finalizeBase);
        const finalized = decodeFinalization(
          await request(
            'POST',
            `/promotions/${encodeURIComponent(promotion.promotionId)}/final-commit`,
            finalizeBase,
            'operation'
          ),
          {
            requestDigest: finalizeEncoded.requestDigest,
            promotionId: promotion.promotionId,
            evidenceId: promotion.evidenceId,
            candidate,
          }
        );
        return Object.freeze({
          evidence: Object.freeze({
            ...finalized.manifest.evidence,
            manifestDigest: finalized.manifest.manifestDigest,
          }),
          manifest: finalized.manifest,
          authorityReceiptDigests: Object.freeze([
            registration.receiptDigest,
            promotion.receiptDigest,
            ...uploadReceipts.map(({ receiptDigest }) => receiptDigest),
            preparation.receiptDigest,
            finalized.receiptDigest,
          ]),
        });
      } finally {
        promotion = Object.freeze({
          ...promotion,
          uploadCapability: '',
        });
        if (preparation) {
          preparation = Object.freeze({
            ...preparation,
            attestationNonce: '',
            attestationStatement: null,
          });
        }
        attestation = undefined;
      }
    },

    async resolveVerifiedView(viewInput) {
      const { authority, registration, evidenceIds, idempotencyKey } =
        viewInput;
      const normalizedEvidenceIds = [...evidenceIds].sort(
        compareUnicodeCodePoints
      );
      if (
        !canonicalIdempotencyKey(idempotencyKey) ||
        normalizedEvidenceIds.length === 0 ||
        normalizedEvidenceIds.length > maximumReceiptCount ||
        normalizedEvidenceIds.some((id) => !canonicalId(id)) ||
        new Set(normalizedEvidenceIds).size !== normalizedEvidenceIds.length
      ) {
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
      }
      const base = Object.freeze({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'verified-view-resolve-request' as const,
        authority: assertAuthority(authority),
        sandboxRegistrationReceiptDigest: registration.receiptDigest,
        evidenceIds: Object.freeze(normalizedEvidenceIds),
        workspaceRevision: authority.workspaceRevision,
        verificationPlanDigest: authority.verificationPlanDigest,
        idempotencyKey,
      });
      const encoded = encodeRequest(base);
      return decodeVerifiedView(
        await request('POST', '/verified-view/resolve', base),
        encoded.requestDigest,
        normalizedEvidenceIds
      );
    },
  };
  return Object.freeze(bridge);
};
