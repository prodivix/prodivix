import { createHash } from 'node:crypto';

import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
} from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACT_BYTES,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  AGENT_EVALUATION_SEALED_OWNER_OPERATION_FORMAT,
  decodeAgentEvaluationOwnerStateBundle,
  decodeAgentEvaluationOwnerStateCASDescriptor,
  decodeAgentEvaluationOwnerStateTransition,
  digestAgentEvaluationOwnerStateDispatchAck,
  digestAgentEvaluationOwnerStateStage,
  type AgentEvaluationOwnerStateBundle,
  type AgentEvaluationOwnerStateCASDescriptor,
  type AgentEvaluationOwnerStateIdentityInput,
  type AgentEvaluationOwnerStateTransition,
} from './ownerState';
import {
  createCredentialCanarySignatures,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export const AGENT_EVALUATION_OWNER_STATE_CAS_ARTIFACT_IDENTITY_FORMAT =
  'prodivix.agent-evaluation-owner-state-cas-artifact-identity' as const;
export const AGENT_EVALUATION_OWNER_STATE_CAS_INGRESS_FORMAT =
  'prodivix.agent-evaluation-owner-state-cas-ingress' as const;
export const AGENT_EVALUATION_OWNER_STATE_CAS_INGRESS_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-owner-state-cas-ingress-response' as const;
export const AGENT_EVALUATION_OWNER_STATE_CAS_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-owner-state-cas-receipt' as const;
export const AGENT_EVALUATION_OWNER_STATE_RESULT_INGRESS_FORMAT =
  'prodivix.agent-evaluation-owner-state-result-ingress' as const;
export const AGENT_EVALUATION_OWNER_STATE_RESULT_INGRESS_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-owner-state-result-ingress-response' as const;
export const AGENT_EVALUATION_OWNER_STATE_INGRESS_TIMEOUT_MS = 180_000 as const;

const maximumIngressBytes = 33_619_968;
const maximumIngressResponseBytes = 262_144;
const exactCommitPattern = /^[a-f0-9]{40}$/u;
const exactMediaTypePattern =
  /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[\x20-\x7e]+)?$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationOwnerStateCASArtifactInput = Readonly<{
  serviceKind: AgentEvaluationOwnerStateIdentityInput['serviceKind'];
  requestDigest: CanonicalDigest;
  ownerImplementationDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  ownerStateId: CanonicalDigest;
  artifactRef: string;
  artifactKind: string;
  mediaType: string;
  content: Uint8Array;
}>;

export type AgentEvaluationOwnerStateCommitTransitionInput = Readonly<{
  identity: AgentEvaluationOwnerStateIdentityInput;
  operation: string;
  routeBinding: string;
  requestDigest: CanonicalDigest;
  ownerImplementationDigest: CanonicalDigest;
  priorOwnerStateRevision: number;
  priorOwnerStateRootDigest: CanonicalDigest | null;
  stageDigest: CanonicalDigest;
  publicResult: unknown;
  ownerStateBundle: AgentEvaluationOwnerStateBundle;
}>;

export interface AgentEvaluationOwnerStateIngressClient {
  uploadArtifact(
    input: AgentEvaluationOwnerStateCASArtifactInput
  ): Promise<AgentEvaluationOwnerStateCASDescriptor>;
  commitTransition(
    input: AgentEvaluationOwnerStateCommitTransitionInput
  ): Promise<AgentEvaluationOwnerStateTransition>;
}

export type CreateEnvironmentAgentEvaluationOwnerStateIngressClientInput =
  Readonly<{
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    forbiddenCanaries: () => readonly string[];
    environment?: Environment;
    fetch?: typeof fetch;
    timeoutMs?: number;
  }>;

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionCompositionUnavailable
  );
};

const responseInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
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

const readEnvironment = (environment: Environment) =>
  typeof environment === 'function'
    ? environment
    : (name: string): string | undefined => environment[name];

const sha256Digest = (value: Uint8Array): CanonicalDigest =>
  `sha256-${createHash('sha256').update(value).digest('hex')}` as CanonicalDigest;

const parseSafeJson = (source: string): unknown => {
  try {
    return JSON.parse(source, (key, value: unknown) => {
      if (key && isUnsafeObjectKey(key)) return responseInvalid();
      return value;
    }) as unknown;
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return responseInvalid();
  }
};

const exactJsonMediaType = (value: string | null): boolean =>
  value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';

const readBoundedBody = async (
  response: Response,
  signal: AbortSignal
): Promise<Uint8Array> => {
  const reader = response.body?.getReader();
  if (!reader) return responseInvalid();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw signal.reason;
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumIngressResponseBytes) {
        await reader.cancel().catch(() => undefined);
        return responseInvalid();
      }
      chunks.push(next.value);
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    reader.releaseLock();
  }
};

const createCASIngress = (input: AgentEvaluationOwnerStateCASArtifactInput) => {
  if (
    (input.serviceKind !== 'controlled-workspace' &&
      input.serviceKind !== 'verification-evidence') ||
    !isAgentCanonicalDigest(input.requestDigest) ||
    !isAgentCanonicalDigest(input.ownerImplementationDigest) ||
    !isAgentCanonicalDigest(input.stageDigest) ||
    !isAgentCanonicalDigest(input.ownerStateId) ||
    !isAgentControlIdentity(input.artifactRef) ||
    !isAgentControlIdentity(input.artifactKind) ||
    !exactMediaTypePattern.test(input.mediaType) ||
    !(input.content instanceof Uint8Array) ||
    input.content.byteLength >
      AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACT_BYTES
  ) {
    return responseInvalid();
  }
  const artifactDigest = sha256Digest(input.content);
  const artifactIdentity = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_CAS_ARTIFACT_IDENTITY_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    artifactRef: input.artifactRef,
    artifactKind: input.artifactKind,
    mediaType: input.mediaType,
    artifactDigest,
    byteLength: input.content.byteLength,
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_CAS_INGRESS_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: input.serviceKind,
    requestDigest: input.requestDigest,
    ownerImplementationDigest: input.ownerImplementationDigest,
    stageDigest: input.stageDigest,
    ownerStateId: input.ownerStateId,
    artifactRef: input.artifactRef,
    artifactKind: input.artifactKind,
    mediaType: input.mediaType,
    artifactDigest,
    byteLength: input.content.byteLength,
    contentBase64: Buffer.from(input.content).toString('base64'),
    artifactIdentityDigest: digestAgentCanonicalValue(artifactIdentity),
  });
  return Object.freeze({
    ...base,
    uploadDigest: digestAgentCanonicalValue(base),
  });
};

const decodeCASResponse = (
  value: unknown,
  request: ReturnType<typeof createCASIngress>
): AgentEvaluationOwnerStateCASDescriptor => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'uploadDigest',
      'descriptor',
      'replayed',
    ]) ||
    value.format !== AGENT_EVALUATION_OWNER_STATE_CAS_INGRESS_RESPONSE_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_STATE_VERSION ||
    value.uploadDigest !== request.uploadDigest ||
    typeof value.replayed !== 'boolean'
  ) {
    return responseInvalid();
  }
  const descriptor = decodeAgentEvaluationOwnerStateCASDescriptor(
    value.descriptor
  );
  const casReceiptDigest = digestAgentCanonicalValue({
    format: AGENT_EVALUATION_OWNER_STATE_CAS_RECEIPT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: request.serviceKind,
    requestDigest: request.requestDigest,
    ownerImplementationDigest: request.ownerImplementationDigest,
    stageDigest: request.stageDigest,
    ownerStateId: request.ownerStateId,
    artifactIdentityDigest: request.artifactIdentityDigest,
    uploadDigest: request.uploadDigest,
  });
  if (
    descriptor.artifactRef !== request.artifactRef ||
    descriptor.artifactKind !== request.artifactKind ||
    descriptor.mediaType !== request.mediaType ||
    descriptor.artifactDigest !== request.artifactDigest ||
    descriptor.byteLength !== request.byteLength ||
    descriptor.casReceiptDigest !== casReceiptDigest
  ) {
    return responseInvalid();
  }
  return descriptor;
};

const createResultIngress = (
  input: AgentEvaluationOwnerStateCommitTransitionInput
) => {
  const expectedStageDigest = digestAgentEvaluationOwnerStateStage({
    serviceKind: input.identity.serviceKind,
    operation: input.operation,
    routeBinding: input.routeBinding,
    requestDigest: input.requestDigest,
    ownerImplementationDigest: input.ownerImplementationDigest,
    ownerStateId: input.ownerStateBundle.ownerStateId,
    priorOwnerStateRevision: input.priorOwnerStateRevision,
    priorOwnerStateRootDigest: input.priorOwnerStateRootDigest,
  });
  if (input.stageDigest !== expectedStageDigest) return responseInvalid();
  const bundle = decodeAgentEvaluationOwnerStateBundle(input.ownerStateBundle, {
    ...input.identity,
    revision: input.priorOwnerStateRevision + 1,
    previousOwnerStateRootDigest: input.priorOwnerStateRootDigest,
  });
  const responseDigest = digestAgentCanonicalValue(input.publicResult);
  const currentOperation = bundle.recentOperations.at(-1);
  if (
    !currentOperation ||
    currentOperation.operation !== input.operation ||
    currentOperation.routeBinding !== input.routeBinding ||
    currentOperation.requestDigest !== input.requestDigest ||
    currentOperation.stageDigest !== input.stageDigest ||
    currentOperation.responseDigest !== responseDigest
  ) {
    return responseInvalid();
  }
  const ownerStateRootDigest = digestAgentCanonicalValue(bundle);
  const dispatchAckDigest = digestAgentEvaluationOwnerStateDispatchAck({
    serviceKind: input.identity.serviceKind,
    operation: input.operation,
    routeBinding: input.routeBinding,
    requestDigest: input.requestDigest,
    ownerImplementationDigest: input.ownerImplementationDigest,
    ownerStateId: bundle.ownerStateId,
    priorOwnerStateRevision: input.priorOwnerStateRevision,
    priorOwnerStateRootDigest: input.priorOwnerStateRootDigest,
    stageDigest: input.stageDigest,
    responseDigest,
    ownerStateRevision: bundle.revision,
    ownerStateRootDigest,
  });
  const sealedBase = Object.freeze({
    format: AGENT_EVALUATION_SEALED_OWNER_OPERATION_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: input.identity.serviceKind,
    operation: input.operation,
    routeBinding: input.routeBinding,
    requestDigest: input.requestDigest,
    ownerImplementationDigest: input.ownerImplementationDigest,
    ownerStateId: bundle.ownerStateId,
    priorOwnerStateRevision: input.priorOwnerStateRevision,
    priorOwnerStateRootDigest: input.priorOwnerStateRootDigest,
    stageDigest: input.stageDigest,
    publicResult: input.publicResult,
    responseDigest,
    ownerStateRevision: bundle.revision,
    ownerStateRootDigest,
    dispatchAckDigest,
  });
  const resultReceiptDigest = digestAgentCanonicalValue(sealedBase);
  const transition = Object.freeze({
    ...sealedBase,
    resultReceiptDigest,
    ownerStateBundle: bundle,
  });
  const ingressBase = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_RESULT_INGRESS_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: input.identity.serviceKind,
    operation: input.operation,
    routeBinding: input.routeBinding,
    requestDigest: input.requestDigest,
    ownerImplementationDigest: input.ownerImplementationDigest,
    stageDigest: input.stageDigest,
    priorOwnerStateRevision: input.priorOwnerStateRevision,
    priorOwnerStateRootDigest: input.priorOwnerStateRootDigest,
    responseDigest,
    publicResult: input.publicResult,
    ownerStateRevision: bundle.revision,
    ownerStateBundle: bundle,
    ownerStateRootDigest,
    dispatchAckDigest,
  });
  return Object.freeze({
    transition,
    ingress: Object.freeze({
      ...ingressBase,
      ingressDigest: digestAgentCanonicalValue(ingressBase),
    }),
  });
};

const decodeResultResponse = (
  value: unknown,
  expected: ReturnType<typeof createResultIngress>
): AgentEvaluationOwnerStateTransition => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'ingressDigest',
      'resultReceiptDigest',
      'ownerStateRevision',
      'ownerStateRootDigest',
      'replayed',
    ]) ||
    value.format !==
      AGENT_EVALUATION_OWNER_STATE_RESULT_INGRESS_RESPONSE_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_STATE_VERSION ||
    value.ingressDigest !== expected.ingress.ingressDigest ||
    value.resultReceiptDigest !== expected.transition.resultReceiptDigest ||
    value.ownerStateRevision !== expected.transition.ownerStateRevision ||
    value.ownerStateRootDigest !== expected.transition.ownerStateRootDigest ||
    typeof value.replayed !== 'boolean'
  ) {
    return responseInvalid();
  }
  return expected.transition;
};

export const createEnvironmentAgentEvaluationOwnerStateIngressClient = (
  options: CreateEnvironmentAgentEvaluationOwnerStateIngressClientInput
): AgentEvaluationOwnerStateIngressClient => {
  const environment = options.environment ?? process.env;
  const read = readEnvironment(environment);
  const baseUrl = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl);
  const namespaceId = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace);
  const repositoryCommit = read(
    AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
  );
  const timeoutMs =
    options.timeoutMs ?? AGENT_EVALUATION_OWNER_STATE_INGRESS_TIMEOUT_MS;
  if (
    baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
    namespaceId !== options.namespaceId ||
    repositoryCommit !== options.repositoryCommit ||
    !isAgentControlIdentity(options.namespaceId) ||
    !isAgentCanonicalDigest(options.planDigest) ||
    !exactCommitPattern.test(options.repositoryCommit) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > AGENT_EVALUATION_OWNER_STATE_INGRESS_TIMEOUT_MS ||
    typeof options.forbiddenCanaries !== 'function'
  ) {
    return unavailable();
  }
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== 'function') return unavailable();
  const basePath = `${baseUrl}/v1/evaluations/${encodeURIComponent(options.namespaceId)}/${encodeURIComponent(options.planDigest)}/${encodeURIComponent(options.repositoryCommit)}`;

  const post = async (
    path: string,
    bodyValue: unknown,
    idempotencyKey: CanonicalDigest
  ): Promise<unknown> => {
    const body = canonicalJsonText(bodyValue);
    if (
      textEncoder.encode(body).byteLength > maximumIngressBytes ||
      !isAgentCanonicalDigest(idempotencyKey)
    ) {
      return responseInvalid();
    }
    assertProductionAgentEvaluationG3SandboxCanaryClean(
      bodyValue,
      options.forbiddenCanaries
    );
    let tokenSource: string | undefined;
    let tokenBytes: Uint8Array | undefined;
    let headers: Headers | undefined;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      tokenSource = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token);
      if (!isAgentEvaluationServiceToken(tokenSource)) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
        );
      }
      tokenBytes = textEncoder.encode(tokenSource);
      tokenSource = undefined;
      const credentialSignatures = createCredentialCanarySignatures(tokenBytes);
      const url = `${basePath}${path}`;
      if (
        textContainsCredentialCanary(body, credentialSignatures) ||
        textContainsCredentialCanary(url, credentialSignatures)
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
        );
      }
      headers = new Headers({
        Accept: 'application/json',
        Authorization: `Bearer ${textDecoder.decode(tokenBytes)}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      });
      let response: Response | undefined;
      for (
        let attempt = 0;
        attempt < 2 && !controller.signal.aborted;
        attempt += 1
      ) {
        try {
          response = await fetchImplementation(url, {
            method: 'POST',
            headers,
            body,
            signal: controller.signal,
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
            credentials: 'omit',
          });
          if (response.ok || response.status < 500 || attempt === 1) break;
          await response.body?.cancel().catch(() => undefined);
          response = undefined;
        } catch (caught) {
          if (attempt === 1 || controller.signal.aborted) {
            throw safeRunnerError(caught);
          }
        }
      }
      if (!response) return unavailable();
      const responseBytes = await readBoundedBody(response, controller.signal);
      let responseText = '';
      try {
        responseText = textDecoder.decode(responseBytes);
      } finally {
        responseBytes.fill(0);
      }
      if (textContainsCredentialCanary(responseText, credentialSignatures)) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
          response.status
        );
      }
      if (!response.ok) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
          response.status
        );
      }
      if (!exactJsonMediaType(response.headers.get('content-type'))) {
        return responseInvalid();
      }
      const decoded = parseSafeJson(responseText);
      if (
        valueContainsCredentialCanary(decoded, tokenBytes, credentialSignatures)
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
          response.status
        );
      }
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        decoded,
        options.forbiddenCanaries
      );
      return decoded;
    } catch (caught) {
      throw safeRunnerError(caught);
    } finally {
      clearTimeout(timeout);
      headers?.delete('Authorization');
      tokenSource = undefined;
      tokenBytes?.fill(0);
    }
  };

  const client: AgentEvaluationOwnerStateIngressClient = {
    async uploadArtifact(input) {
      const request = createCASIngress(input);
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        input.content,
        options.forbiddenCanaries
      );
      const response = await post(
        '/owner-state-cas',
        request,
        request.uploadDigest
      );
      return decodeCASResponse(response, request);
    },
    async commitTransition(input) {
      const expected = createResultIngress(input);
      const response = await post(
        '/owner-state-results',
        expected.ingress,
        expected.ingress.ingressDigest
      );
      const transition = decodeResultResponse(response, expected);
      return decodeAgentEvaluationOwnerStateTransition(transition, {
        ...input.identity,
        operation: input.operation,
        routeBinding: input.routeBinding,
        requestDigest: input.requestDigest,
        ownerImplementationDigest: input.ownerImplementationDigest,
        priorOwnerStateRevision: input.priorOwnerStateRevision,
        priorOwnerStateRootDigest: input.priorOwnerStateRootDigest,
      });
    },
  };
  return Object.freeze(client);
};
