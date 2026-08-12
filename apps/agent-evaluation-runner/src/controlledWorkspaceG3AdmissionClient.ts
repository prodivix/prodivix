import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentModelEvaluationAttemptDescriptor,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  createVerificationAdapterRegistrySnapshot,
  digestVerificationValue,
  matchVerificationAdapterRegistryEntry,
  validateVerificationPlan,
  verificationAdapterRegistrationFromEntry,
  type VerificationAdapterRegistrySnapshot,
  type VerificationPlanCell,
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
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import type {
  AgentEvaluationControlledWorkspaceG3Admission,
  AgentEvaluationControlledWorkspaceG3AdmissionAuthority,
  AgentEvaluationControlledWorkspaceG3AdmissionInput,
} from './controlledWorkspaceRuntimeProduction';
import type { AgentEvaluationVerificationAttemptGrantRunIdentity } from './verificationAttemptGrantClient';
import type { AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource } from './controlledWorkspaceG3CellAdapter';

export const AGENT_EVALUATION_G3_CELL_ADMISSION_REQUEST_FORMAT =
  'prodivix.agent-evaluation-g3-cell-admission-request' as const;
export const AGENT_EVALUATION_G3_CELL_ADMISSION_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-g3-cell-admission-response' as const;
export const AGENT_EVALUATION_G3_CELL_ADMISSION_VERSION = 1 as const;
export const AGENT_EVALUATION_G3_CELL_ADMISSION_OPERATION_TIMEOUT_MS =
  30_000 as const;

const maximumRequestBytes = 8_388_608;
const maximumResponseBytes = 262_144;
const exactCommitPattern = /^[a-f0-9]{40}$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationControlledWorkspaceG3AdmissionRequest = Readonly<{
  format: typeof AGENT_EVALUATION_G3_CELL_ADMISSION_REQUEST_FORMAT;
  version: typeof AGENT_EVALUATION_G3_CELL_ADMISSION_VERSION;
  namespaceId: string;
  evaluationPlanDigest: CanonicalDigest;
  repositoryCommit: string;
  projectId: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  capabilityDescriptorDigest: CanonicalDigest;
  caseId: string;
  generation: number;
  fixtureDigest: CanonicalDigest;
  finalWorkspaceSnapshotDigest: CanonicalDigest;
  verificationPlanDigest: CanonicalDigest;
  verificationPlan: AgentEvaluationControlledWorkspaceG3AdmissionInput['plan'];
  registrySnapshotDigest: CanonicalDigest;
  registrySnapshot: VerificationAdapterRegistrySnapshot;
  cellId: string;
  cellDigest: CanonicalDigest;
  cell: VerificationPlanCell;
  requestDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceG3AdmissionResponse = Readonly<{
  format: typeof AGENT_EVALUATION_G3_CELL_ADMISSION_RESPONSE_FORMAT;
  version: typeof AGENT_EVALUATION_G3_CELL_ADMISSION_VERSION;
  requestDigest: CanonicalDigest;
  run: AgentEvaluationVerificationAttemptGrantRunIdentity;
  runtimeAuthorityDigest: CanonicalDigest;
  ownerImplementationDigest: CanonicalDigest;
  ownerAdmissionDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  admissionReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult =
  Readonly<{
    run: AgentEvaluationVerificationAttemptGrantRunIdentity;
    runtimeAuthorityDigest: CanonicalDigest;
    ownerImplementationDigest: CanonicalDigest;
    ownerAdmissionDigest: CanonicalDigest;
    stageDigest: CanonicalDigest;
    dispatchAckDigest: CanonicalDigest;
  }>;

export type CreateEnvironmentAgentEvaluationControlledWorkspaceG3AdmissionAuthorityInput =
  Readonly<{
    evaluationPlanDigest: CanonicalDigest;
    repositoryCommit: string;
    environment?: Environment;
    fetch?: typeof fetch;
    forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
    timeoutMs?: number;
  }>;

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable
  );
};

const responseInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
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

const readEnvironment = (environment: Environment) =>
  typeof environment === 'function'
    ? environment
    : (name: string): string | undefined => environment[name];

const canonicalPositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

export const createAgentEvaluationControlledWorkspaceG3AdmissionRequest = (
  input: AgentEvaluationControlledWorkspaceG3AdmissionInput
): AgentEvaluationControlledWorkspaceG3AdmissionRequest => {
  const registry = createVerificationAdapterRegistrySnapshot(
    input.registrySnapshot.entries.map(verificationAdapterRegistrationFromEntry)
  );
  const cell =
    input.plan.status === 'ready'
      ? input.plan.cells.find(({ id }) => id === input.cell.id)
      : undefined;
  const entry = matchVerificationAdapterRegistryEntry(
    registry,
    input.cell.adapter
  );
  if (
    !isAgentControlIdentity(input.namespaceId) ||
    !isAgentCanonicalDigest(input.evaluationPlanDigest) ||
    !exactCommitPattern.test(input.repositoryCommit) ||
    !isAgentControlIdentity(input.projectId) ||
    !isAgentModelEvaluationAttemptDescriptor(input.descriptor) ||
    input.descriptor.planDigest !== input.evaluationPlanDigest ||
    !canonicalPositive(input.generation) ||
    !isAgentCanonicalDigest(input.fixture.fixtureDigest) ||
    !isAgentCanonicalDigest(input.finalWorkspaceSnapshotDigest) ||
    input.plan.status !== 'ready' ||
    !cell ||
    input.plan.cells.filter(({ id }) => id === input.cell.id).length !== 1 ||
    !sameCanonicalJson(cell, input.cell) ||
    registry.snapshotDigest !== input.registrySnapshot.snapshotDigest ||
    !entry
  ) {
    return unavailable();
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_G3_CELL_ADMISSION_REQUEST_FORMAT,
    version: AGENT_EVALUATION_G3_CELL_ADMISSION_VERSION,
    namespaceId: input.namespaceId,
    evaluationPlanDigest: input.evaluationPlanDigest,
    repositoryCommit: input.repositoryCommit,
    projectId: input.projectId,
    attemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    capabilityDescriptorDigest: input.descriptor.capabilityDescriptorDigest,
    caseId: input.descriptor.caseId,
    generation: input.generation,
    fixtureDigest: input.fixture.fixtureDigest,
    finalWorkspaceSnapshotDigest: input.finalWorkspaceSnapshotDigest,
    verificationPlanDigest: input.plan.planDigest as CanonicalDigest,
    verificationPlan: input.plan,
    registrySnapshotDigest: registry.snapshotDigest as CanonicalDigest,
    registrySnapshot: registry,
    cellId: input.cell.id,
    cellDigest: digestVerificationValue(input.cell) as CanonicalDigest,
    cell: input.cell,
  });
  return Object.freeze({
    ...base,
    requestDigest: digestAgentCanonicalValue(base),
  });
};

export const decodeAgentEvaluationControlledWorkspaceG3AdmissionRequest = (
  value: unknown
): AgentEvaluationControlledWorkspaceG3AdmissionRequest => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'namespaceId',
      'evaluationPlanDigest',
      'repositoryCommit',
      'projectId',
      'attemptId',
      'descriptorDigest',
      'capabilityDescriptorDigest',
      'caseId',
      'generation',
      'fixtureDigest',
      'finalWorkspaceSnapshotDigest',
      'verificationPlanDigest',
      'verificationPlan',
      'registrySnapshotDigest',
      'registrySnapshot',
      'cellId',
      'cellDigest',
      'cell',
      'requestDigest',
    ])
  ) {
    return responseInvalid();
  }
  const request =
    value as unknown as AgentEvaluationControlledWorkspaceG3AdmissionRequest;
  let registry: VerificationAdapterRegistrySnapshot;
  try {
    registry = createVerificationAdapterRegistrySnapshot(
      request.registrySnapshot.entries.map(
        verificationAdapterRegistrationFromEntry
      )
    );
  } catch {
    return responseInvalid();
  }
  const decodedPlan = validateVerificationPlan(request.verificationPlan);
  const cell = decodedPlan.ok
    ? decodedPlan.value.cells.find(({ id }) => id === request.cellId)
    : undefined;
  const entry = matchVerificationAdapterRegistryEntry(
    registry,
    request.cell.adapter
  );
  const { requestDigest, ...base } = request;
  if (
    request.format !== AGENT_EVALUATION_G3_CELL_ADMISSION_REQUEST_FORMAT ||
    request.version !== AGENT_EVALUATION_G3_CELL_ADMISSION_VERSION ||
    !isAgentControlIdentity(request.namespaceId) ||
    !isAgentCanonicalDigest(request.evaluationPlanDigest) ||
    !exactCommitPattern.test(request.repositoryCommit) ||
    !isAgentControlIdentity(request.projectId) ||
    !isAgentControlIdentity(request.attemptId) ||
    !isAgentCanonicalDigest(request.descriptorDigest) ||
    !isAgentCanonicalDigest(request.capabilityDescriptorDigest) ||
    !isAgentControlIdentity(request.caseId) ||
    !canonicalPositive(request.generation) ||
    !isAgentCanonicalDigest(request.fixtureDigest) ||
    !isAgentCanonicalDigest(request.finalWorkspaceSnapshotDigest) ||
    !isAgentCanonicalDigest(request.verificationPlanDigest) ||
    !decodedPlan.ok ||
    decodedPlan.value.status !== 'ready' ||
    decodedPlan.value.planDigest !== request.verificationPlanDigest ||
    !sameCanonicalJson(decodedPlan.value, request.verificationPlan) ||
    !isAgentCanonicalDigest(request.registrySnapshotDigest) ||
    registry.snapshotDigest !== request.registrySnapshotDigest ||
    !sameCanonicalJson(registry, request.registrySnapshot) ||
    !isAgentControlIdentity(request.cellId) ||
    !isAgentCanonicalDigest(request.cellDigest) ||
    request.cell.id !== request.cellId ||
    request.cellDigest !== digestVerificationValue(request.cell) ||
    !cell ||
    decodedPlan.value.cells.filter(({ id }) => id === request.cellId).length !==
      1 ||
    !sameCanonicalJson(cell, request.cell) ||
    !entry ||
    !isAgentCanonicalDigest(requestDigest) ||
    requestDigest !== digestAgentCanonicalValue(base)
  ) {
    return responseInvalid();
  }
  return Object.freeze({ ...request });
};

export const isAgentEvaluationControlledWorkspaceG3AdmissionRun = (
  value: unknown,
  request: AgentEvaluationControlledWorkspaceG3AdmissionRequest
): value is AgentEvaluationVerificationAttemptGrantRunIdentity => {
  if (
    !exactRecord(
      value,
      [
        'runId',
        'providerId',
        'parentAttemptId',
        'surface',
        'frameworkTarget',
        'runtimeZone',
        'viewport',
        'devicePixelRatio',
        'colorScheme',
        'motion',
        'locale',
        'timezone',
        'fontSetDigest',
      ],
      [
        'jobId',
        'sessionId',
        'browserEngine',
        'operatingSystemIdentity',
        'sandboxImageDigest',
      ]
    ) ||
    !exactRecord(value.viewport, ['id', 'width', 'height'])
  ) {
    return false;
  }
  const run =
    value as unknown as AgentEvaluationVerificationAttemptGrantRunIdentity;
  return (
    isAgentControlIdentity(run.runId) &&
    isAgentControlIdentity(run.providerId) &&
    (run.jobId === undefined || isAgentControlIdentity(run.jobId)) &&
    (run.sessionId === undefined || isAgentControlIdentity(run.sessionId)) &&
    run.parentAttemptId === request.attemptId &&
    run.surface === request.cell.surface &&
    run.frameworkTarget === request.cell.frameworkTarget &&
    run.runtimeZone === 'sandbox' &&
    run.browserEngine === request.cell.browserEngine &&
    sameCanonicalJson(run.viewport, request.cell.viewport) &&
    canonicalPositive(run.devicePixelRatio) &&
    run.devicePixelRatio <= 16 &&
    run.colorScheme === request.cell.colorScheme &&
    run.motion === request.cell.motion &&
    run.locale === request.cell.locale &&
    isAgentControlIdentity(run.timezone) &&
    (run.operatingSystemIdentity === undefined ||
      (typeof run.operatingSystemIdentity === 'string' &&
        run.operatingSystemIdentity.length >= 1 &&
        run.operatingSystemIdentity.length <= 512 &&
        run.operatingSystemIdentity === run.operatingSystemIdentity.trim())) &&
    isAgentCanonicalDigest(run.fontSetDigest) &&
    (run.sandboxImageDigest === undefined ||
      isAgentCanonicalDigest(run.sandboxImageDigest))
  );
};

export const digestAgentEvaluationControlledWorkspaceG3AdmissionStage = (
  request: AgentEvaluationControlledWorkspaceG3AdmissionRequest,
  ownerImplementationDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-g3-cell-admission-dispatch-stage',
    version: 1,
    serviceKind: 'controlled-workspace',
    operation: 'verification.cell.admit',
    routeBinding: 'g3-cell-admission',
    namespaceId: request.namespaceId,
    evaluationPlanDigest: request.evaluationPlanDigest,
    repositoryCommit: request.repositoryCommit,
    attemptId: request.attemptId,
    descriptorDigest: request.descriptorDigest,
    generation: request.generation,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
  });

export const digestAgentEvaluationControlledWorkspaceG3OwnerAdmission = (
  request: AgentEvaluationControlledWorkspaceG3AdmissionRequest,
  response: Pick<
    AgentEvaluationControlledWorkspaceG3AdmissionResponse,
    | 'run'
    | 'runtimeAuthorityDigest'
    | 'ownerImplementationDigest'
    | 'stageDigest'
  >
): CanonicalDigest =>
  digestAgentCanonicalValue({
    requestDigest: request.requestDigest,
    run: response.run,
    runtimeAuthorityDigest: response.runtimeAuthorityDigest,
    ownerImplementationDigest: response.ownerImplementationDigest,
    stageDigest: response.stageDigest,
  });

export const digestAgentEvaluationControlledWorkspaceG3AdmissionDispatchAck = (
  request: AgentEvaluationControlledWorkspaceG3AdmissionRequest,
  response: Pick<
    AgentEvaluationControlledWorkspaceG3AdmissionResponse,
    | 'run'
    | 'runtimeAuthorityDigest'
    | 'ownerImplementationDigest'
    | 'ownerAdmissionDigest'
    | 'stageDigest'
  >
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-g3-cell-admission-dispatch-ack',
    version: 1,
    namespaceId: request.namespaceId,
    evaluationPlanDigest: request.evaluationPlanDigest,
    repositoryCommit: request.repositoryCommit,
    attemptId: request.attemptId,
    descriptorDigest: request.descriptorDigest,
    generation: request.generation,
    requestDigest: request.requestDigest,
    run: response.run,
    runtimeAuthorityDigest: response.runtimeAuthorityDigest,
    ownerImplementationDigest: response.ownerImplementationDigest,
    ownerAdmissionDigest: response.ownerAdmissionDigest,
    stageDigest: response.stageDigest,
  });

export const createAgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult =
  (
    request: AgentEvaluationControlledWorkspaceG3AdmissionRequest,
    input: Readonly<{
      run: AgentEvaluationVerificationAttemptGrantRunIdentity;
      runtimeAuthorityDigest: CanonicalDigest;
      ownerImplementationDigest: CanonicalDigest;
    }>
  ): AgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult => {
    decodeAgentEvaluationControlledWorkspaceG3AdmissionRequest(request);
    if (
      !isAgentEvaluationControlledWorkspaceG3AdmissionRun(input.run, request) ||
      !isAgentCanonicalDigest(input.runtimeAuthorityDigest) ||
      !isAgentCanonicalDigest(input.ownerImplementationDigest)
    ) {
      return responseInvalid();
    }
    const stageDigest =
      digestAgentEvaluationControlledWorkspaceG3AdmissionStage(
        request,
        input.ownerImplementationDigest
      );
    const ownerAdmissionDigest =
      digestAgentEvaluationControlledWorkspaceG3OwnerAdmission(request, {
        ...input,
        stageDigest,
      });
    const dispatchAckDigest =
      digestAgentEvaluationControlledWorkspaceG3AdmissionDispatchAck(request, {
        ...input,
        ownerAdmissionDigest,
        stageDigest,
      });
    return Object.freeze({
      run: Object.freeze({ ...input.run }),
      runtimeAuthorityDigest: input.runtimeAuthorityDigest,
      ownerImplementationDigest: input.ownerImplementationDigest,
      ownerAdmissionDigest,
      stageDigest,
      dispatchAckDigest,
    });
  };

export const decodeAgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult =
  (
    value: unknown,
    request: AgentEvaluationControlledWorkspaceG3AdmissionRequest,
    ownerImplementationDigest: CanonicalDigest
  ): AgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult => {
    if (
      !exactRecord(value, [
        'run',
        'runtimeAuthorityDigest',
        'ownerImplementationDigest',
        'ownerAdmissionDigest',
        'stageDigest',
        'dispatchAckDigest',
      ])
    ) {
      return responseInvalid();
    }
    const result =
      value as unknown as AgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult;
    const expected =
      createAgentEvaluationControlledWorkspaceG3AdmissionAuthorityResult(
        request,
        {
          run: result.run,
          runtimeAuthorityDigest: result.runtimeAuthorityDigest,
          ownerImplementationDigest,
        }
      );
    if (!sameCanonicalJson(result, expected)) return responseInvalid();
    return expected;
  };

const decodeResponse = (
  value: unknown,
  request: AgentEvaluationControlledWorkspaceG3AdmissionRequest
): AgentEvaluationControlledWorkspaceG3AdmissionResponse => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'requestDigest',
      'run',
      'runtimeAuthorityDigest',
      'ownerImplementationDigest',
      'ownerAdmissionDigest',
      'stageDigest',
      'dispatchAckDigest',
      'admissionReceiptDigest',
    ])
  ) {
    return responseInvalid();
  }
  const response =
    value as unknown as AgentEvaluationControlledWorkspaceG3AdmissionResponse;
  const { admissionReceiptDigest, ...base } = response;
  if (
    response.format !== AGENT_EVALUATION_G3_CELL_ADMISSION_RESPONSE_FORMAT ||
    response.version !== AGENT_EVALUATION_G3_CELL_ADMISSION_VERSION ||
    response.requestDigest !== request.requestDigest ||
    !isAgentEvaluationControlledWorkspaceG3AdmissionRun(
      response.run,
      request
    ) ||
    !isAgentCanonicalDigest(response.runtimeAuthorityDigest) ||
    !isAgentCanonicalDigest(response.ownerImplementationDigest) ||
    !isAgentCanonicalDigest(response.ownerAdmissionDigest) ||
    !isAgentCanonicalDigest(response.stageDigest) ||
    !isAgentCanonicalDigest(response.dispatchAckDigest) ||
    !isAgentCanonicalDigest(admissionReceiptDigest) ||
    response.stageDigest !==
      digestAgentEvaluationControlledWorkspaceG3AdmissionStage(
        request,
        response.ownerImplementationDigest
      ) ||
    response.ownerAdmissionDigest !==
      digestAgentEvaluationControlledWorkspaceG3OwnerAdmission(
        request,
        response
      ) ||
    response.dispatchAckDigest !==
      digestAgentEvaluationControlledWorkspaceG3AdmissionDispatchAck(
        request,
        response
      ) ||
    admissionReceiptDigest !== digestAgentCanonicalValue(base)
  ) {
    return responseInvalid();
  }
  return Object.freeze({
    ...base,
    run: Object.freeze({ ...response.run }),
    admissionReceiptDigest,
  });
};

const parseSafeJson = (source: string): unknown => {
  try {
    return JSON.parse(source, (key, value: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new TypeError('unsafe-key');
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
        return unavailable();
      }
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maximumResponseBytes) {
        await reader.cancel().catch(() => undefined);
        return responseInvalid();
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

/**
 * Resolves pre-dispatch cell identity from the Backend-sealed 8790 authority.
 * The runner never derives runtime image or font commitments from labels.
 */
export const createEnvironmentAgentEvaluationControlledWorkspaceG3AdmissionAuthority =
  (
    options: CreateEnvironmentAgentEvaluationControlledWorkspaceG3AdmissionAuthorityInput
  ): AgentEvaluationControlledWorkspaceG3AdmissionAuthority => {
    const environment = options.environment ?? process.env;
    const read = readEnvironment(environment);
    const baseUrl = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl);
    const namespaceId = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
    );
    const repositoryCommit = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
    );
    const timeoutMs =
      options.timeoutMs ??
      AGENT_EVALUATION_G3_CELL_ADMISSION_OPERATION_TIMEOUT_MS;
    if (
      baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      !isAgentControlIdentity(namespaceId) ||
      repositoryCommit !== options.repositoryCommit ||
      !exactCommitPattern.test(options.repositoryCommit) ||
      !isAgentCanonicalDigest(options.evaluationPlanDigest) ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > AGENT_EVALUATION_G3_CELL_ADMISSION_OPERATION_TIMEOUT_MS ||
      typeof options.forbiddenCanaries !== 'function'
    ) {
      return unavailable();
    }
    const endpoint = `${baseUrl}/v1/evaluations/${encodeURIComponent(namespaceId)}/${encodeURIComponent(options.evaluationPlanDigest)}/${encodeURIComponent(options.repositoryCommit)}/g3-cell-admission`;
    const fetchImplementation = options.fetch ?? fetch;
    return Object.freeze({
      async admit(
        input: AgentEvaluationControlledWorkspaceG3AdmissionInput
      ): Promise<AgentEvaluationControlledWorkspaceG3Admission> {
        if (
          input.namespaceId !== namespaceId ||
          input.evaluationPlanDigest !== options.evaluationPlanDigest ||
          input.repositoryCommit !== options.repositoryCommit
        ) {
          return unavailable();
        }
        const request =
          createAgentEvaluationControlledWorkspaceG3AdmissionRequest(input);
        const requestText = canonicalJsonText(request);
        if (textEncoder.encode(requestText).byteLength > maximumRequestBytes) {
          return unavailable();
        }
        let credentialSource: string | undefined = read(
          AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token
        );
        let credential: Uint8Array | undefined;
        try {
          if (!isAgentEvaluationServiceToken(credentialSource)) {
            return unavailable();
          }
          credential = textEncoder.encode(credentialSource);
          const signatures = createCredentialCanarySignatures(credential);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);
          const headers = new Headers({
            Accept: 'application/json',
            Authorization: `Bearer ${textDecoder.decode(credential)}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': request.requestDigest,
          });
          let response: Response | undefined;
          try {
            response = await fetchImplementation(endpoint, {
              method: 'POST',
              headers,
              body: requestText,
              signal: controller.signal,
              redirect: 'error',
              referrerPolicy: 'no-referrer',
              cache: 'no-store',
              credentials: 'omit',
            });
            headers.delete('Authorization');
            const mediaType = response.headers
              .get('Content-Type')
              ?.split(';', 1)[0]
              ?.trim()
              .toLowerCase();
            if (!response.ok || mediaType !== 'application/json') {
              return unavailable();
            }
            const bytes = await readBoundedBody(response, controller.signal);
            const responseText = textDecoder.decode(bytes);
            if (textContainsCredentialCanary(responseText, signatures)) {
              return responseInvalid();
            }
            const decoded = parseSafeJson(responseText);
            if (responseText !== canonicalJsonText(decoded)) {
              return responseInvalid();
            }
            if (
              valueContainsCredentialCanary(decoded, credential, signatures)
            ) {
              return responseInvalid();
            }
            assertProductionAgentEvaluationG3SandboxCanaryClean(
              decoded,
              options.forbiddenCanaries
            );
            const admission = decodeResponse(decoded, request);
            return Object.freeze({
              run: admission.run,
              admissionReceiptDigest: admission.admissionReceiptDigest,
            });
          } catch (caught) {
            if (caught instanceof AgentEvaluationRunnerError) throw caught;
            if (controller.signal.aborted) return unavailable();
            throw safeRunnerError(caught);
          } finally {
            clearTimeout(timeout);
            headers.delete('Authorization');
            response = undefined;
          }
        } finally {
          credential?.fill(0);
          credential = undefined;
          credentialSource = undefined;
        }
      },
    });
  };
