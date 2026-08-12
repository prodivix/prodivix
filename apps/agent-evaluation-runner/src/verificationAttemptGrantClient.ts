import {
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT,
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION,
  canonicalAgentEvaluationVerificationAttemptGrantReceipts,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentEvaluationVerificationAttemptGrantReceipt as isSharedAgentEvaluationVerificationAttemptGrantReceipt,
  isAgentModelEvaluationAttemptDescriptor,
  type AgentEvaluationVerificationAttemptGrant,
  type AgentEvaluationVerificationAttemptGrantReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type CanonicalDigest,
} from '@prodivix/ai';
export {
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT,
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION,
  type AgentEvaluationVerificationAttemptGrant,
  type AgentEvaluationVerificationAttemptGrantReceipt,
} from '@prodivix/ai';
import {
  digestVerificationValue,
  encodeVerificationPlan,
  type VerificationEvidenceCandidate,
  type VerificationEvidenceTrust,
  type VerificationPlan,
} from '@prodivix/verification';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
} from './errors';
import {
  createCredentialCanarySignatures,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';
import {
  AGENT_EVALUATION_AUTHORITY_SHORT_TRANSPORT_TIMEOUT_MS,
  deriveAgentEvaluationAuthorityTransportTimeoutMs,
} from './authorityTransportDeadline';

export const AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_ISSUE_FORMAT =
  'prodivix.agent-evaluation-verification-attempt-grant-issue' as const;

const maximumRequestBytes = 8_388_608;
const maximumResponseBytes = 262_144;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export type AgentEvaluationVerificationAttemptGrantRunIdentity =
  VerificationEvidenceCandidate['run'];

export type AgentEvaluationVerificationAttemptGrantIssueInput = Readonly<{
  namespaceId: string;
  evaluationPlanDigest: CanonicalDigest;
  repositoryCommit: string;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  generation: number;
  projectId: string;
  verificationPlan: VerificationPlan;
  cellId: string;
  run: AgentEvaluationVerificationAttemptGrantRunIdentity;
  trustCeiling: Exclude<VerificationEvidenceTrust, 'imported-untrusted'>;
  expiresAt: string;
}>;

export interface AgentEvaluationVerificationAttemptGrantIssuer {
  /** Must complete before any adapter or provider dispatch for the attempt. */
  issue(
    input: AgentEvaluationVerificationAttemptGrantIssueInput
  ): Promise<AgentEvaluationVerificationAttemptGrantReceipt>;
  /**
   * Recovers already sealed per-cell receipts after a worker restart. The
   * implementation returns only the exact attempt/generation/G3 Plan binding.
   */
  list(
    input: AgentEvaluationVerificationAttemptGrantListInput
  ): Promise<readonly AgentEvaluationVerificationAttemptGrantReceipt[]>;
}

export type AgentEvaluationVerificationAttemptGrantListInput = Readonly<{
  descriptor: AgentModelEvaluationAttemptDescriptor;
  generation: number;
  verificationPlanDigest: CanonicalDigest;
}>;

export type CreateEnvironmentAgentEvaluationVerificationAttemptGrantIssuerInput =
  Readonly<{
    evaluationPlanDigest: CanonicalDigest;
    repositoryCommit: string;
    environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
    fetch?: typeof fetch;
    operationTimeoutMs: number;
  }>;

type IssueBase = Readonly<{
  format: typeof AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_ISSUE_FORMAT;
  version: typeof AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION;
  namespaceId: string;
  evaluationPlanDigest: CanonicalDigest;
  repositoryCommit: string;
  evaluationAttemptId: string;
  descriptorDigest: CanonicalDigest;
  capabilityDescriptorDigest: CanonicalDigest;
  caseId: string;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  generation: number;
  workspaceId: string;
  workspaceRevision: number;
  projectId: string;
  verificationPlanDigest: CanonicalDigest;
  verificationPlan: ReturnType<typeof encodeVerificationPlan>;
  cellId: string;
  run: AgentEvaluationVerificationAttemptGrantRunIdentity;
  trustCeiling: Exclude<VerificationEvidenceTrust, 'imported-untrusted'>;
  expiresAt: string;
}>;

const runnerError = (
  code: (typeof AGENT_EVALUATION_RUNNER_ERROR_CODES)[keyof typeof AGENT_EVALUATION_RUNNER_ERROR_CODES],
  httpStatus?: number
): AgentEvaluationRunnerError =>
  new AgentEvaluationRunnerError(code, httpStatus);

const invalid = (): never => {
  throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
};

const responseInvalid = (status?: number): never => {
  throw runnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    status
  );
};

const exactCommit = (value: string): boolean => /^[a-f0-9]{40}$/u.test(value);

const safePositive = (
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER
): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= maximum;

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

const readEnvironment = (
  environment: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const useServiceCredential = async <T>(
  environment: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader,
  consumer: (credential: Uint8Array) => Promise<T>
): Promise<T> => {
  const read = readEnvironment(environment);
  let source: string | undefined = read(
    AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token
  );
  let material: Uint8Array | undefined;
  try {
    if (!isAgentEvaluationServiceToken(source)) {
      throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable);
    }
    material = textEncoder.encode(source);
    return await consumer(material);
  } finally {
    material?.fill(0);
    material = undefined;
    source = undefined;
  }
};

const parseSafeJson = (source: string): unknown => {
  try {
    return JSON.parse(source, (key, value: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new Error('unsafe-key');
      return value;
    }) as unknown;
  } catch {
    return responseInvalid();
  }
};

const readBoundedBody = async (
  response: Response,
  signal: AbortSignal
): Promise<Uint8Array> => {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      if (signal.aborted) {
        await reader.cancel().catch(() => undefined);
        throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted);
      }
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maximumResponseBytes) {
        await reader.cancel().catch(() => undefined);
        throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};

const issueBase = (
  input: AgentEvaluationVerificationAttemptGrantIssueInput
): IssueBase => {
  const plan = input.verificationPlan;
  const cell = plan.cells.find(({ id }) => id === input.cellId);
  if (
    !isAgentControlIdentity(input.namespaceId) ||
    plan.status !== 'ready' ||
    !cell ||
    plan.cells.filter(({ id }) => id === input.cellId).length !== 1 ||
    cell.preflight.status !== 'supported' ||
    !isAgentCanonicalDigest(input.evaluationPlanDigest) ||
    !exactCommit(input.repositoryCommit) ||
    !isAgentModelEvaluationAttemptDescriptor(input.descriptor) ||
    input.descriptor.planDigest !== input.evaluationPlanDigest ||
    !safePositive(input.generation) ||
    !isAgentControlIdentity(input.projectId) ||
    !isAgentControlInstant(input.expiresAt) ||
    !['local-unattested', 'remote-attested', 'ci-attested'].includes(
      input.trustCeiling
    ) ||
    !isAgentControlIdentity(input.run.runId) ||
    !isAgentControlIdentity(input.run.providerId) ||
    (input.run.jobId !== undefined &&
      !isAgentControlIdentity(input.run.jobId)) ||
    (input.run.sessionId !== undefined &&
      !isAgentControlIdentity(input.run.sessionId)) ||
    input.run.parentAttemptId !== input.descriptor.attemptId ||
    input.run.surface !== cell.surface ||
    input.run.frameworkTarget !== cell.frameworkTarget ||
    input.run.browserEngine !== cell.browserEngine ||
    !sameCanonicalJson(input.run.viewport, cell.viewport) ||
    input.run.colorScheme !== cell.colorScheme ||
    input.run.motion !== cell.motion ||
    input.run.locale !== cell.locale ||
    input.run.runtimeZone !== 'sandbox' ||
    !safePositive(input.run.devicePixelRatio, 16) ||
    !isAgentControlIdentity(input.run.timezone) ||
    !isAgentCanonicalDigest(input.run.fontSetDigest) ||
    plan.workspaceId.length === 0 ||
    !isAgentControlIdentity(plan.workspaceId) ||
    !safePositive(plan.targetRevision) ||
    !isAgentCanonicalDigest(plan.planDigest)
  ) {
    return invalid();
  }
  const verificationPlan = encodeVerificationPlan(plan);
  return Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_ISSUE_FORMAT,
    version: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION,
    namespaceId: input.namespaceId,
    evaluationPlanDigest: input.evaluationPlanDigest,
    repositoryCommit: input.repositoryCommit,
    evaluationAttemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    capabilityDescriptorDigest: input.descriptor.capabilityDescriptorDigest,
    caseId: input.descriptor.caseId,
    descriptor: Object.freeze({ ...input.descriptor }),
    generation: input.generation,
    workspaceId: plan.workspaceId,
    workspaceRevision: plan.targetRevision,
    projectId: input.projectId,
    verificationPlanDigest: plan.planDigest,
    verificationPlan,
    cellId: input.cellId,
    run: input.run,
    trustCeiling: input.trustCeiling,
    expiresAt: input.expiresAt,
  });
};

const bindingBase = (base: IssueBase) =>
  Object.freeze({
    namespaceId: base.namespaceId,
    evaluationPlanDigest: base.evaluationPlanDigest,
    repositoryCommit: base.repositoryCommit,
    evaluationAttemptId: base.evaluationAttemptId,
    descriptorDigest: base.descriptorDigest,
    capabilityDescriptorDigest: base.capabilityDescriptorDigest,
    caseId: base.caseId,
    generation: base.generation,
    workspaceId: base.workspaceId,
    workspaceRevision: base.workspaceRevision,
    projectId: base.projectId,
    verificationPlanDigest: base.verificationPlanDigest,
    cellId: base.cellId,
  });

const grantDigestBase = (grant: AgentEvaluationVerificationAttemptGrant) =>
  Object.freeze({
    format: 'prodivix.verification-attempt-grant',
    version: 1,
    workspaceId: grant.workspaceId,
    projectId: grant.projectId,
    workspaceRevision: grant.workspaceRevision,
    partitionRevisionsDigest: grant.partitionRevisionsDigest,
    policyRevision: grant.policyRevision,
    policyDigest: grant.policyDigest,
    policyEvaluationInstant: grant.policyEvaluationInstant,
    impactDigest: grant.impactDigest,
    planDigest: grant.verificationPlanDigest,
    cellId: grant.cellId,
    checkId: grant.checkId,
    checkKind: grant.checkKind,
    targetId: grant.targetId,
    attemptId: grant.attemptId,
    runId: grant.runId,
    providerId: grant.providerId,
    ...(grant.jobId ? { jobId: grant.jobId } : {}),
    ...(grant.sessionId ? { sessionId: grant.sessionId } : {}),
    producerId: grant.producerId,
    trustCeiling: grant.trustCeiling,
    retentionRequest: grant.retentionRequest,
    maximumClosureEvidenceRecords: grant.maximumClosureEvidenceRecords,
    issuedBy: grant.issuedBy,
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
  });

const decodeReceipt = (
  value: unknown,
  base: IssueBase
): AgentEvaluationVerificationAttemptGrantReceipt => {
  if (
    !isSharedAgentEvaluationVerificationAttemptGrantReceipt(value) ||
    !exactRecord(value, [
      'format',
      'version',
      'namespaceId',
      'evaluationPlanDigest',
      'repositoryCommit',
      'evaluationAttemptId',
      'descriptorDigest',
      'capabilityDescriptorDigest',
      'caseId',
      'generation',
      'verificationPlanDigest',
      'cellId',
      'requestDigest',
      'issuanceBindingDigest',
      'grant',
      'receiptDigest',
    ]) ||
    value.format !==
      AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT ||
    value.version !== AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION ||
    !isAgentCanonicalDigest(value.requestDigest) ||
    !isAgentCanonicalDigest(value.issuanceBindingDigest) ||
    !isAgentCanonicalDigest(value.receiptDigest)
  ) {
    return responseInvalid();
  }
  const rawGrant = value.grant;
  if (
    !exactRecord(
      rawGrant,
      [
        'grantId',
        'grantDigest',
        'workspaceId',
        'projectId',
        'workspaceRevision',
        'partitionRevisionsDigest',
        'policyRevision',
        'policyDigest',
        'policyEvaluationInstant',
        'impactDigest',
        'verificationPlanDigest',
        'cellId',
        'checkId',
        'checkKind',
        'targetId',
        'attemptId',
        'runId',
        'providerId',
        'producerId',
        'trustCeiling',
        'retentionRequest',
        'maximumClosureEvidenceRecords',
        'issuedBy',
        'issuedAt',
        'expiresAt',
      ],
      ['jobId', 'sessionId']
    ) ||
    !exactRecord(rawGrant.retentionRequest, [
      'successful',
      'failed',
      'protectReleaseEvidence',
    ])
  ) {
    return responseInvalid();
  }
  const retention = rawGrant.retentionRequest;
  const grant = rawGrant as unknown as AgentEvaluationVerificationAttemptGrant;
  const cell = base.verificationPlan.cells.find(({ id }) => id === base.cellId);
  const expectedBindingDigest = digestAgentCanonicalValue(bindingBase(base));
  const expectedIssuedBy = `g4-evaluation.${expectedBindingDigest.slice(7)}`;
  if (
    value.requestDigest !== digestAgentCanonicalValue(base) ||
    value.issuanceBindingDigest !== expectedBindingDigest ||
    value.namespaceId !== base.namespaceId ||
    value.evaluationPlanDigest !== base.evaluationPlanDigest ||
    value.repositoryCommit !== base.repositoryCommit ||
    value.evaluationAttemptId !== base.evaluationAttemptId ||
    value.descriptorDigest !== base.descriptorDigest ||
    value.capabilityDescriptorDigest !== base.capabilityDescriptorDigest ||
    value.caseId !== base.caseId ||
    value.generation !== base.generation ||
    value.verificationPlanDigest !== base.verificationPlanDigest ||
    value.cellId !== base.cellId ||
    !isAgentControlIdentity(grant.grantId) ||
    !isAgentCanonicalDigest(grant.grantDigest) ||
    grant.grantId !== `attempt-grant-${grant.grantDigest.slice(7)}` ||
    grant.workspaceId !== base.workspaceId ||
    grant.projectId !== base.projectId ||
    grant.workspaceRevision !== base.workspaceRevision ||
    !isAgentCanonicalDigest(grant.partitionRevisionsDigest) ||
    grant.partitionRevisionsDigest !==
      digestVerificationValue(base.verificationPlan.targetPartitionRevisions) ||
    grant.policyRevision !== base.verificationPlan.policyRevision ||
    grant.policyDigest !== base.verificationPlan.policyDigest ||
    grant.policyEvaluationInstant !==
      base.verificationPlan.policyEvaluationInstant ||
    grant.impactDigest !== base.verificationPlan.impactDigest ||
    grant.verificationPlanDigest !== base.verificationPlanDigest ||
    grant.cellId !== base.cellId ||
    grant.checkId !== cell?.checkId ||
    grant.checkKind !== cell.checkKind ||
    grant.targetId !== cell.targetId ||
    grant.attemptId !== base.evaluationAttemptId ||
    grant.runId !== base.run.runId ||
    grant.providerId !== base.run.providerId ||
    grant.jobId !== base.run.jobId ||
    grant.sessionId !== base.run.sessionId ||
    grant.producerId !==
      AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID ||
    grant.trustCeiling !== base.trustCeiling ||
    !sameCanonicalJson(
      grant.retentionRequest,
      base.verificationPlan.retentionRequest
    ) ||
    !['session', 'change', 'release'].includes(
      retention.successful as string
    ) ||
    !['session', 'change', 'release'].includes(retention.failed as string) ||
    typeof retention.protectReleaseEvidence !== 'boolean' ||
    !safePositive(grant.maximumClosureEvidenceRecords, 1_000) ||
    grant.maximumClosureEvidenceRecords <
      base.verificationPlan.budget.closureEvidenceRecords ||
    grant.issuedBy !== expectedIssuedBy ||
    !isAgentControlInstant(grant.issuedAt) ||
    grant.expiresAt !== base.expiresAt ||
    grant.grantDigest !== digestAgentCanonicalValue(grantDigestBase(grant))
  ) {
    return responseInvalid();
  }
  const receipt = Object.freeze({
    format: value.format,
    version: value.version,
    namespaceId: value.namespaceId,
    evaluationPlanDigest: value.evaluationPlanDigest,
    repositoryCommit: value.repositoryCommit,
    evaluationAttemptId: value.evaluationAttemptId,
    descriptorDigest: value.descriptorDigest,
    capabilityDescriptorDigest: value.capabilityDescriptorDigest,
    caseId: value.caseId,
    generation: value.generation,
    verificationPlanDigest: value.verificationPlanDigest,
    cellId: value.cellId,
    requestDigest: value.requestDigest,
    issuanceBindingDigest: value.issuanceBindingDigest,
    grant: Object.freeze({
      ...grant,
      retentionRequest: Object.freeze({ ...grant.retentionRequest }),
    }),
    receiptDigest: value.receiptDigest,
  }) satisfies AgentEvaluationVerificationAttemptGrantReceipt;
  const { receiptDigest, ...receiptBase } = receipt;
  if (receiptDigest !== digestAgentCanonicalValue(receiptBase)) {
    return responseInvalid();
  }
  return receipt;
};

/**
 * Reconstructs every issuance and grant digest from public immutable inputs so
 * durable runners can reject a drifted issuer ACK without duplicating rules.
 */
export const decodeAgentEvaluationVerificationAttemptGrantReceipt = (
  value: unknown,
  issueInput: AgentEvaluationVerificationAttemptGrantIssueInput
): AgentEvaluationVerificationAttemptGrantReceipt =>
  decodeReceipt(value, issueBase(issueInput));

export const isAgentEvaluationVerificationAttemptGrantReceiptBoundToIssue = (
  value: unknown,
  issueInput: AgentEvaluationVerificationAttemptGrantIssueInput
): value is AgentEvaluationVerificationAttemptGrantReceipt => {
  try {
    decodeAgentEvaluationVerificationAttemptGrantReceipt(value, issueInput);
    return true;
  } catch {
    return false;
  }
};

export const createEnvironmentAgentEvaluationVerificationAttemptGrantIssuer = (
  input: CreateEnvironmentAgentEvaluationVerificationAttemptGrantIssuerInput
): AgentEvaluationVerificationAttemptGrantIssuer => {
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
    return invalid();
  }
  if (
    baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
    typeof namespaceId !== 'string' ||
    !isAgentControlIdentity(namespaceId) ||
    repositoryCommit !== input.repositoryCommit ||
    !exactCommit(input.repositoryCommit) ||
    !isAgentCanonicalDigest(input.evaluationPlanDigest)
  ) {
    return invalid();
  }
  const fetchImplementation = input.fetch ?? fetch;
  const endpoint = `${baseUrl}/v1/evaluations/${encodeURIComponent(namespaceId)}/${encodeURIComponent(input.evaluationPlanDigest)}/${encodeURIComponent(input.repositoryCommit)}/verification-attempt-grants`;
  return Object.freeze({
    async list(listInput: AgentEvaluationVerificationAttemptGrantListInput) {
      if (
        !isAgentModelEvaluationAttemptDescriptor(listInput.descriptor) ||
        listInput.descriptor.planDigest !== input.evaluationPlanDigest ||
        !safePositive(listInput.generation) ||
        !isAgentCanonicalDigest(listInput.verificationPlanDigest)
      ) {
        return invalid();
      }
      return useServiceCredential(environment, async (credential) => {
        const credentialSignatures =
          createCredentialCanarySignatures(credential);
        const authorization = `Bearer ${textDecoder.decode(credential)}`;
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          AGENT_EVALUATION_AUTHORITY_SHORT_TRANSPORT_TIMEOUT_MS
        );
        const headers = new Headers({
          Accept: 'application/json',
          Authorization: authorization,
        });
        let response: Response | undefined;
        try {
          response = await fetchImplementation(endpoint, {
            method: 'GET',
            headers,
            signal: controller.signal,
            redirect: 'error',
            referrerPolicy: 'no-referrer',
          });
          headers.delete('Authorization');
          const bytes = await readBoundedBody(response, controller.signal);
          const text = textDecoder.decode(bytes);
          if (
            textContainsCredentialCanary(text, credentialSignatures) ||
            !response.ok ||
            !response.headers
              .get('content-type')
              ?.toLowerCase()
              .startsWith('application/json')
          ) {
            if (textContainsCredentialCanary(text, credentialSignatures)) {
              throw runnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
                response.status
              );
            }
            return responseInvalid(response.status);
          }
          const decoded = parseSafeJson(text);
          if (
            valueContainsCredentialCanary(
              decoded,
              credential,
              credentialSignatures
            ) ||
            !exactRecord(decoded, ['facts']) ||
            !Array.isArray(decoded.facts) ||
            decoded.facts.length > 128 ||
            decoded.facts.some(
              (fact) =>
                !isSharedAgentEvaluationVerificationAttemptGrantReceipt(fact) ||
                fact.namespaceId !== namespaceId ||
                fact.evaluationPlanDigest !== input.evaluationPlanDigest ||
                fact.repositoryCommit !== input.repositoryCommit
            )
          ) {
            return responseInvalid(response.status);
          }
          const matching = decoded.facts.filter(
            (fact): fact is AgentEvaluationVerificationAttemptGrantReceipt =>
              isSharedAgentEvaluationVerificationAttemptGrantReceipt(fact) &&
              fact.namespaceId === namespaceId &&
              fact.evaluationPlanDigest === input.evaluationPlanDigest &&
              fact.repositoryCommit === input.repositoryCommit &&
              fact.evaluationAttemptId === listInput.descriptor.attemptId &&
              fact.descriptorDigest === listInput.descriptor.descriptorDigest &&
              fact.capabilityDescriptorDigest ===
                listInput.descriptor.capabilityDescriptorDigest &&
              fact.caseId === listInput.descriptor.caseId &&
              fact.generation === listInput.generation &&
              fact.verificationPlanDigest === listInput.verificationPlanDigest
          );
          return canonicalAgentEvaluationVerificationAttemptGrantReceipts(
            matching
          );
        } catch (caught) {
          if (caught instanceof AgentEvaluationRunnerError) throw caught;
          if (controller.signal.aborted) {
            throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted);
          }
          throw safeRunnerError(caught);
        } finally {
          clearTimeout(timeout);
          headers.delete('Authorization');
          response = undefined;
        }
      });
    },
    async issue(issueInput: AgentEvaluationVerificationAttemptGrantIssueInput) {
      if (
        issueInput.namespaceId !== namespaceId ||
        issueInput.evaluationPlanDigest !== input.evaluationPlanDigest ||
        issueInput.repositoryCommit !== input.repositoryCommit
      ) {
        return invalid();
      }
      const base = issueBase(issueInput);
      const requestDigest = digestAgentCanonicalValue(base);
      const body = canonicalJsonText(Object.freeze({ ...base, requestDigest }));
      if (textEncoder.encode(body).byteLength > maximumRequestBytes) {
        throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge);
      }
      return useServiceCredential(environment, async (credential) => {
        const credentialSignatures =
          createCredentialCanarySignatures(credential);
        const authorization = `Bearer ${textDecoder.decode(credential)}`;
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          operationTransportTimeoutMs
        );
        const headers = new Headers({
          Accept: 'application/json',
          Authorization: authorization,
          'Content-Type': 'application/json',
        });
        let response: Response | undefined;
        try {
          response = await fetchImplementation(endpoint, {
            method: 'POST',
            headers,
            body,
            signal: controller.signal,
            redirect: 'error',
            referrerPolicy: 'no-referrer',
          });
          headers.delete('Authorization');
          const bytes = await readBoundedBody(response, controller.signal);
          const text = textDecoder.decode(bytes);
          if (
            textContainsCredentialCanary(text, credentialSignatures) ||
            !response.ok ||
            !response.headers
              .get('content-type')
              ?.toLowerCase()
              .startsWith('application/json')
          ) {
            if (textContainsCredentialCanary(text, credentialSignatures)) {
              throw runnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
                response.status
              );
            }
            return responseInvalid(response.status);
          }
          const decoded = parseSafeJson(text);
          if (
            valueContainsCredentialCanary(
              decoded,
              credential,
              credentialSignatures
            )
          ) {
            throw runnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
              response.status
            );
          }
          return decodeReceipt(decoded, base);
        } catch (caught) {
          if (caught instanceof AgentEvaluationRunnerError) throw caught;
          if (controller.signal.aborted) {
            throw runnerError(AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted);
          }
          throw safeRunnerError(caught);
        } finally {
          clearTimeout(timeout);
          headers.delete('Authorization');
          response = undefined;
        }
      });
    },
  });
};
