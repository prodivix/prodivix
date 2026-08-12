import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type AgentEvaluationCaseMaterial,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  createAgentEvaluationControlledWorkspaceGrant,
  type AgentEvaluationControlledWorkspaceAuthorizer,
  type AgentEvaluationControlledWorkspaceCheckpoint,
  type AgentEvaluationControlledWorkspaceCleanupReceipt,
  type AgentEvaluationControlledWorkspaceEffect,
  type AgentEvaluationControlledWorkspaceFinalAuthority,
  type AgentEvaluationControlledWorkspaceGrant,
  type AgentEvaluationControlledWorkspaceOperationLedger,
  type AgentEvaluationControlledWorkspaceOrphanSession,
  type AgentEvaluationControlledWorkspacePreflightReceipt,
  type AgentEvaluationControlledWorkspaceSession,
  type AgentEvaluationControlledWorkspaceSessionAttachment,
  type AgentEvaluationControlledWorkspaceSessionLoader,
} from './controlledWorkspaceRuntime';
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

export const AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT =
  'prodivix.agent-evaluation-controlled-workspace-service' as const;
export const AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION = 1 as const;
export const AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_ROUTE =
  'controlled-workspace' as const;

const maximumRequestBytes = 25_296_896;
const maximumResponseBytes = 33_554_432;
const maximumFacts = 128;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationControlledWorkspaceServiceOperation =
  | 'grant.issue'
  | 'session.load-or-reattach'
  | 'session.orphans.list'
  | 'session.orphan.destroy'
  | 'session.preflight'
  | 'session.restore-checkpoint'
  | 'session.execute'
  | 'session.reconcile-dispatched'
  | 'session.artifact.resolve'
  | 'session.assess-final'
  | 'session.destroy'
  | 'operation.attempt-state.load'
  | 'operation.claim'
  | 'operation.dispatch'
  | 'operation.seal-rejected'
  | 'operation.seal-atomic'
  | 'operation.reconcile-dispatched'
  | 'operation.sealed.load'
  | 'operation.sealed.list'
  | 'operation.cleanup.claim'
  | 'operation.cleanup.dispatch'
  | 'operation.cleanup.seal'
  | 'operation.cleanup.reconcile';

export type AgentEvaluationControlledWorkspaceServiceRequest = Readonly<{
  format: typeof AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT;
  version: typeof AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION;
  operation: AgentEvaluationControlledWorkspaceServiceOperation;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  payload: unknown;
  requestDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceServiceAcknowledgement =
  Readonly<{
    format: typeof AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT;
    version: typeof AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION;
    operation: AgentEvaluationControlledWorkspaceServiceOperation;
    requestDigest: CanonicalDigest;
    facts: readonly unknown[];
    receiptDigest: CanonicalDigest;
  }>;

export type CreateEnvironmentAgentEvaluationControlledWorkspaceServiceInput =
  Readonly<{
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    environment?: Environment;
    fetch?: typeof fetch;
    operationTimeoutMs: number;
  }>;

export type AgentEvaluationControlledWorkspaceService = Readonly<{
  authorizer: AgentEvaluationControlledWorkspaceAuthorizer;
  loader: AgentEvaluationControlledWorkspaceSessionLoader;
  operations: AgentEvaluationControlledWorkspaceOperationLedger;
}>;

type SessionWire = Readonly<{
  sessionId: string;
  planDigest: CanonicalDigest;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  fixtureDigest: CanonicalDigest;
  baseSnapshotDigest: CanonicalDigest;
  grantDigest: CanonicalDigest;
  toolRegistryDigest: CanonicalDigest;
  actionRegistryDigest: CanonicalDigest;
  generation: number;
  isolationPolicyDigest: CanonicalDigest;
  initialCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  currentCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
}>;

type AttachmentWire = Omit<
  AgentEvaluationControlledWorkspaceSessionAttachment,
  'session'
> &
  Readonly<{ session: SessionWire }>;

const servicePaths: Readonly<
  Record<AgentEvaluationControlledWorkspaceServiceOperation, string>
> = Object.freeze({
  'grant.issue': 'grants/issue',
  'session.load-or-reattach': 'sessions/load-or-reattach',
  'session.orphans.list': 'sessions/orphans/list',
  'session.orphan.destroy': 'sessions/orphans/destroy',
  'session.preflight': 'sessions/{sessionId}/preflight',
  'session.restore-checkpoint': 'sessions/{sessionId}/restore-checkpoint',
  'session.execute': 'sessions/{sessionId}/execute',
  'session.reconcile-dispatched': 'sessions/{sessionId}/reconcile-dispatched',
  'session.artifact.resolve': 'sessions/{sessionId}/artifacts/resolve',
  'session.assess-final': 'sessions/{sessionId}/assess-final',
  'session.destroy': 'sessions/{sessionId}/destroy',
  'operation.attempt-state.load': 'operations/attempt-state/load',
  'operation.claim': 'operations/claim',
  'operation.dispatch': 'operations/dispatch',
  'operation.seal-rejected': 'operations/seal-rejected',
  'operation.seal-atomic': 'operations/seal-atomic',
  'operation.reconcile-dispatched': 'operations/reconcile-dispatched',
  'operation.sealed.load': 'operations/sealed/load',
  'operation.sealed.list': 'operations/sealed/list',
  'operation.cleanup.claim': 'operations/cleanup/claim',
  'operation.cleanup.dispatch': 'operations/cleanup/dispatch',
  'operation.cleanup.seal': 'operations/cleanup/seal',
  'operation.cleanup.reconcile': 'operations/cleanup/reconcile',
});

const fail = (
  code: (typeof AGENT_EVALUATION_RUNNER_ERROR_CODES)[keyof typeof AGENT_EVALUATION_RUNNER_ERROR_CODES],
  status?: number
): never => {
  throw new AgentEvaluationRunnerError(code, status);
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

const parseSafeJson = (source: string): unknown => {
  try {
    return JSON.parse(source, (key, value: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new TypeError('unsafe-key');
      return value;
    }) as unknown;
  } catch {
    return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid);
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
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted);
      }
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maximumResponseBytes) {
        await reader.cancel().catch(() => undefined);
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge);
      }
      chunks.push(next.value);
    }
    const body = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
      chunk.fill(0);
    }
    return body;
  } finally {
    await reader.cancel().catch(() => undefined);
    for (const chunk of chunks) chunk.fill(0);
  }
};

const checkpointBase = (
  checkpoint: AgentEvaluationControlledWorkspaceCheckpoint
) =>
  Object.freeze({
    checkpointRef: checkpoint.checkpointRef,
    attemptId: checkpoint.attemptId,
    grantDigest: checkpoint.grantDigest,
    generation: checkpoint.generation,
    ...(checkpoint.predecessorCheckpointDigest
      ? {
          predecessorCheckpointDigest: checkpoint.predecessorCheckpointDigest,
        }
      : {}),
    snapshotDigest: checkpoint.snapshotDigest,
    securePersistenceReceiptDigest: checkpoint.securePersistenceReceiptDigest,
  });

const isCheckpoint = (
  value: unknown
): value is AgentEvaluationControlledWorkspaceCheckpoint => {
  if (
    !exactRecord(
      value,
      [
        'checkpointRef',
        'attemptId',
        'grantDigest',
        'generation',
        'checkpointDigest',
        'snapshotDigest',
        'securePersistenceReceiptDigest',
      ],
      ['predecessorCheckpointDigest']
    )
  ) {
    return false;
  }
  const checkpoint =
    value as unknown as AgentEvaluationControlledWorkspaceCheckpoint;
  return (
    isAgentControlIdentity(checkpoint.checkpointRef) &&
    isAgentControlIdentity(checkpoint.attemptId) &&
    isAgentCanonicalDigest(checkpoint.grantDigest) &&
    Number.isSafeInteger(checkpoint.generation) &&
    checkpoint.generation >= 1 &&
    (checkpoint.predecessorCheckpointDigest === undefined ||
      isAgentCanonicalDigest(checkpoint.predecessorCheckpointDigest)) &&
    isAgentCanonicalDigest(checkpoint.snapshotDigest) &&
    isAgentCanonicalDigest(checkpoint.securePersistenceReceiptDigest) &&
    checkpoint.checkpointDigest ===
      digestAgentCanonicalValue(checkpointBase(checkpoint))
  );
};

const isSessionWire = (value: unknown): value is SessionWire => {
  if (
    !exactRecord(value, [
      'sessionId',
      'planDigest',
      'attemptId',
      'descriptorDigest',
      'caseId',
      'materialDigest',
      'fixtureDigest',
      'baseSnapshotDigest',
      'grantDigest',
      'toolRegistryDigest',
      'actionRegistryDigest',
      'generation',
      'isolationPolicyDigest',
      'initialCheckpoint',
      'currentCheckpoint',
    ])
  ) {
    return false;
  }
  const session = value as unknown as SessionWire;
  return (
    isAgentControlIdentity(session.sessionId) &&
    isAgentCanonicalDigest(session.planDigest) &&
    isAgentControlIdentity(session.attemptId) &&
    isAgentCanonicalDigest(session.descriptorDigest) &&
    isAgentControlIdentity(session.caseId) &&
    isAgentCanonicalDigest(session.materialDigest) &&
    isAgentCanonicalDigest(session.fixtureDigest) &&
    isAgentCanonicalDigest(session.baseSnapshotDigest) &&
    isAgentCanonicalDigest(session.grantDigest) &&
    isAgentCanonicalDigest(session.toolRegistryDigest) &&
    isAgentCanonicalDigest(session.actionRegistryDigest) &&
    Number.isSafeInteger(session.generation) &&
    session.generation >= 1 &&
    isAgentCanonicalDigest(session.isolationPolicyDigest) &&
    isCheckpoint(session.initialCheckpoint) &&
    isCheckpoint(session.currentCheckpoint)
  );
};

const isAttachmentWire = (value: unknown): value is AttachmentWire =>
  exactRecord(value, [
    'status',
    'session',
    'sessionId',
    'attemptId',
    'grantDigest',
    'generation',
    'currentCheckpointDigest',
    'attachmentReceiptDigest',
  ]) &&
  (value.status === 'loaded' || value.status === 'reattached') &&
  isSessionWire(value.session) &&
  value.sessionId === value.session.sessionId &&
  value.attemptId === value.session.attemptId &&
  value.grantDigest === value.session.grantDigest &&
  value.generation === value.session.generation &&
  value.currentCheckpointDigest ===
    value.session.currentCheckpoint.checkpointDigest &&
  isAgentCanonicalDigest(value.attachmentReceiptDigest);

const isGrant = (
  value: unknown
): value is AgentEvaluationControlledWorkspaceGrant => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'grantId',
      'authorityId',
      'planDigest',
      'attemptId',
      'descriptorDigest',
      'caseId',
      'materialDigest',
      'fixtureDigest',
      'baseSnapshotDigest',
      'toolRegistryDigest',
      'actionRegistryDigest',
      'allowedToolIds',
      'allowedActionIds',
      'allowedTargetRefs',
      'generation',
      'maximumUses',
      'issuedAt',
      'expiresAt',
      'grantDigest',
    ])
  ) {
    return false;
  }
  try {
    const grant = value as unknown as AgentEvaluationControlledWorkspaceGrant;
    const recreated = createAgentEvaluationControlledWorkspaceGrant({
      grantId: grant.grantId,
      authorityId: grant.authorityId,
      planDigest: grant.planDigest,
      attemptId: grant.attemptId,
      descriptorDigest: grant.descriptorDigest,
      caseId: grant.caseId,
      materialDigest: grant.materialDigest,
      fixtureDigest: grant.fixtureDigest,
      baseSnapshotDigest: grant.baseSnapshotDigest,
      toolRegistryDigest: grant.toolRegistryDigest,
      actionRegistryDigest: grant.actionRegistryDigest,
      allowedToolIds: grant.allowedToolIds,
      allowedActionIds: grant.allowedActionIds,
      allowedTargetRefs: grant.allowedTargetRefs,
      generation: grant.generation,
      maximumUses: grant.maximumUses,
      issuedAt: grant.issuedAt,
      expiresAt: grant.expiresAt,
    });
    return sameCanonicalJson(recreated, grant);
  } catch {
    return false;
  }
};

const one = <T>(
  facts: readonly unknown[],
  guard?: (value: unknown) => value is T
): T => {
  if (facts.length !== 1 || (guard && !guard(facts[0]))) {
    return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid);
  }
  return facts[0] as T;
};

const zeroOrOne = <T>(facts: readonly unknown[]): T | undefined => {
  if (facts.length > 1) {
    return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid);
  }
  return facts[0] as T | undefined;
};

class RemoteControlledWorkspaceSession implements AgentEvaluationControlledWorkspaceSession {
  readonly sessionId: string;
  readonly planDigest: CanonicalDigest;
  readonly attemptId: string;
  readonly descriptorDigest: CanonicalDigest;
  readonly caseId: string;
  readonly materialDigest: CanonicalDigest;
  readonly fixtureDigest: CanonicalDigest;
  readonly baseSnapshotDigest: CanonicalDigest;
  readonly grantDigest: CanonicalDigest;
  readonly toolRegistryDigest: CanonicalDigest;
  readonly actionRegistryDigest: CanonicalDigest;
  readonly generation: number;
  readonly isolationPolicyDigest: CanonicalDigest;
  readonly initialCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  #currentCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  readonly #request: RequestFacts;

  constructor(wire: SessionWire, request: RequestFacts) {
    this.sessionId = wire.sessionId;
    this.planDigest = wire.planDigest;
    this.attemptId = wire.attemptId;
    this.descriptorDigest = wire.descriptorDigest;
    this.caseId = wire.caseId;
    this.materialDigest = wire.materialDigest;
    this.fixtureDigest = wire.fixtureDigest;
    this.baseSnapshotDigest = wire.baseSnapshotDigest;
    this.grantDigest = wire.grantDigest;
    this.toolRegistryDigest = wire.toolRegistryDigest;
    this.actionRegistryDigest = wire.actionRegistryDigest;
    this.generation = wire.generation;
    this.isolationPolicyDigest = wire.isolationPolicyDigest;
    this.initialCheckpoint = wire.initialCheckpoint;
    this.#currentCheckpoint = wire.currentCheckpoint;
    this.#request = request;
  }

  get currentCheckpoint(): AgentEvaluationControlledWorkspaceCheckpoint {
    return this.#currentCheckpoint;
  }

  #payload(value: unknown) {
    return Object.freeze({
      sessionId: this.sessionId,
      attemptId: this.attemptId,
      grantDigest: this.grantDigest,
      generation: this.generation,
      value,
    });
  }

  async preflight(
    input: Parameters<AgentEvaluationControlledWorkspaceSession['preflight']>[0]
  ): Promise<AgentEvaluationControlledWorkspacePreflightReceipt> {
    return one(
      await this.#request(
        'session.preflight',
        this.#payload(input),
        this.sessionId
      )
    );
  }

  async restoreCheckpoint(
    checkpoint: AgentEvaluationControlledWorkspaceCheckpoint
  ): Promise<void> {
    const receipt = one<Record<string, unknown>>(
      await this.#request(
        'session.restore-checkpoint',
        this.#payload(checkpoint),
        this.sessionId,
        'operation'
      ),
      (value): value is Record<string, unknown> =>
        exactRecord(value, [
          'status',
          'checkpointDigest',
          'restorationReceiptDigest',
        ])
    );
    if (
      receipt.status !== 'restored' ||
      receipt.checkpointDigest !== checkpoint.checkpointDigest ||
      !isAgentCanonicalDigest(receipt.restorationReceiptDigest)
    ) {
      return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid);
    }
    this.#currentCheckpoint = checkpoint;
  }

  async execute(
    input: Parameters<AgentEvaluationControlledWorkspaceSession['execute']>[0]
  ): Promise<AgentEvaluationControlledWorkspaceEffect> {
    const effect = one<AgentEvaluationControlledWorkspaceEffect>(
      await this.#request(
        'session.execute',
        this.#payload(input),
        this.sessionId,
        'operation'
      )
    );
    if (isCheckpoint(effect?.checkpoint)) {
      this.#currentCheckpoint = effect.checkpoint;
    }
    return effect;
  }

  async reconcileDispatched(
    input: Parameters<
      AgentEvaluationControlledWorkspaceSession['reconcileDispatched']
    >[0]
  ): ReturnType<
    AgentEvaluationControlledWorkspaceSession['reconcileDispatched']
  > {
    const result = one<
      Awaited<
        ReturnType<
          AgentEvaluationControlledWorkspaceSession['reconcileDispatched']
        >
      >
    >(
      await this.#request(
        'session.reconcile-dispatched',
        this.#payload(input),
        this.sessionId,
        'operation'
      )
    );
    if (
      result.status === 'completed' &&
      isCheckpoint(result.effect.checkpoint)
    ) {
      this.#currentCheckpoint = result.effect.checkpoint;
    }
    return result;
  }

  async resolveArtifact(
    input: Parameters<
      AgentEvaluationControlledWorkspaceSession['resolveArtifact']
    >[0]
  ): ReturnType<AgentEvaluationControlledWorkspaceSession['resolveArtifact']> {
    return one(
      await this.#request(
        'session.artifact.resolve',
        this.#payload(input),
        this.sessionId,
        'build'
      )
    );
  }

  async assessFinal(
    input: Parameters<
      AgentEvaluationControlledWorkspaceSession['assessFinal']
    >[0]
  ): Promise<AgentEvaluationControlledWorkspaceFinalAuthority> {
    return one(
      await this.#request(
        'session.assess-final',
        this.#payload(input),
        this.sessionId,
        'operation'
      )
    );
  }

  async destroy(
    input: Parameters<AgentEvaluationControlledWorkspaceSession['destroy']>[0]
  ): Promise<AgentEvaluationControlledWorkspaceCleanupReceipt> {
    return one(
      await this.#request(
        'session.destroy',
        this.#payload(input),
        this.sessionId,
        'operation'
      )
    );
  }
}

type RequestFacts = (
  operation: AgentEvaluationControlledWorkspaceServiceOperation,
  payload: unknown,
  sessionId?: string,
  transportClass?: AgentEvaluationAuthorityTransportClass
) => Promise<readonly unknown[]>;

export const createEnvironmentAgentEvaluationControlledWorkspaceService = (
  input: CreateEnvironmentAgentEvaluationControlledWorkspaceServiceInput
): AgentEvaluationControlledWorkspaceService => {
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
    typeof namespaceId !== 'string' ||
    !isAgentControlIdentity(namespaceId) ||
    repositoryCommit !== input.repositoryCommit ||
    !/^[a-f0-9]{40}$/u.test(input.repositoryCommit) ||
    !isAgentCanonicalDigest(input.planDigest)
  ) {
    return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
  }
  const fetchImplementation = input.fetch ?? fetch;
  const root = `${baseUrl}/v1/evaluations/${encodeURIComponent(namespaceId)}/${encodeURIComponent(input.planDigest)}/${encodeURIComponent(input.repositoryCommit)}/${AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_ROUTE}`;

  const request: RequestFacts = async (
    operation,
    payload,
    sessionId,
    transportClass = 'short'
  ) => {
    if (sessionId !== undefined && !isAgentControlIdentity(sessionId)) {
      return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
    }
    const requestBase = Object.freeze({
      format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
      version: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
      operation,
      namespaceId,
      planDigest: input.planDigest,
      repositoryCommit: input.repositoryCommit,
      payload,
    });
    const requestValue: AgentEvaluationControlledWorkspaceServiceRequest =
      Object.freeze({
        ...requestBase,
        requestDigest: digestAgentCanonicalValue(requestBase),
      });
    const body = canonicalJsonText(requestValue);
    if (textEncoder.encode(body).byteLength > maximumRequestBytes) {
      return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge);
    }
    const source = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token);
    let credential: Uint8Array | undefined;
    try {
      if (!isAgentEvaluationServiceToken(source)) {
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable);
      }
      credential = textEncoder.encode(source);
      const signatures = createCredentialCanarySignatures(credential);
      if (textContainsCredentialCanary(body, signatures)) {
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied);
      }
      const route = servicePaths[operation];
      if (route.includes('{sessionId}') !== (sessionId !== undefined)) {
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
      }
      const path = route.replace(
        '{sessionId}',
        sessionId ? encodeURIComponent(sessionId) : ''
      );
      const controller = new AbortController();
      const timeoutMs =
        transportClass === 'operation'
          ? operationTransportTimeoutMs
          : resolveAgentEvaluationAuthorityTransportTimeoutMs(
              transportClass,
              input.operationTimeoutMs
            );
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const headers = new Headers({
        Accept: 'application/json',
        Authorization: `Bearer ${textDecoder.decode(credential)}`,
        'Content-Type': 'application/json; charset=utf-8',
        'Idempotency-Key': requestValue.requestDigest,
      });
      let response: Response | undefined;
      try {
        response = await fetchImplementation(`${root}/${path}`, {
          method: 'POST',
          headers,
          body,
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: controller.signal,
        });
        headers.delete('Authorization');
        const bytes = await readBoundedBody(response, controller.signal);
        let text: string;
        try {
          text = textDecoder.decode(bytes);
        } finally {
          bytes.fill(0);
        }
        if (
          textContainsCredentialCanary(text, signatures) ||
          !response.ok ||
          !response.headers
            .get('content-type')
            ?.toLowerCase()
            .startsWith('application/json')
        ) {
          return fail(
            textContainsCredentialCanary(text, signatures)
              ? AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
              : AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
            response.status
          );
        }
        const decoded = parseSafeJson(text);
        if (
          valueContainsCredentialCanary(decoded, credential, signatures) ||
          !exactRecord(decoded, [
            'format',
            'version',
            'operation',
            'requestDigest',
            'facts',
            'receiptDigest',
          ])
        ) {
          return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid);
        }
        const acknowledgement =
          decoded as unknown as AgentEvaluationControlledWorkspaceServiceAcknowledgement;
        const { receiptDigest, ...receiptBase } = acknowledgement;
        if (
          acknowledgement.format !==
            AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT ||
          acknowledgement.version !==
            AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION ||
          acknowledgement.operation !== operation ||
          acknowledgement.requestDigest !== requestValue.requestDigest ||
          !Array.isArray(acknowledgement.facts) ||
          acknowledgement.facts.length > maximumFacts ||
          !isAgentCanonicalDigest(receiptDigest) ||
          receiptDigest !== digestAgentCanonicalValue(receiptBase)
        ) {
          return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid);
        }
        return Object.freeze([...acknowledgement.facts]);
      } catch (caught) {
        if (caught instanceof AgentEvaluationRunnerError) throw caught;
        if (controller.signal.aborted) {
          return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted);
        }
        throw safeRunnerError(caught);
      } finally {
        clearTimeout(timeout);
        headers.delete('Authorization');
        response = undefined;
      }
    } finally {
      credential?.fill(0);
      credential = undefined;
    }
  };

  const authorizer: AgentEvaluationControlledWorkspaceAuthorizer = {
    async issue(authorizationInput) {
      return one(
        await request(
          'grant.issue',
          authorizationInput,
          undefined,
          'operation'
        ),
        isGrant
      );
    },
  };

  const loader: AgentEvaluationControlledWorkspaceSessionLoader = {
    async loadOrReattach(loadInput) {
      const attachment = one(
        await request(
          'session.load-or-reattach',
          loadInput,
          undefined,
          'operation'
        ),
        isAttachmentWire
      );
      return Object.freeze({
        ...attachment,
        session: new RemoteControlledWorkspaceSession(
          attachment.session,
          request
        ),
      });
    },
    async listOrphanedSessions() {
      return (await request(
        'session.orphans.list',
        Object.freeze({})
      )) as readonly AgentEvaluationControlledWorkspaceOrphanSession[];
    },
    async destroyOrphanedSession(destroyInput) {
      return one<AgentEvaluationControlledWorkspaceCleanupReceipt>(
        await request(
          'session.orphan.destroy',
          destroyInput,
          undefined,
          'operation'
        )
      );
    },
  };

  const operations: AgentEvaluationControlledWorkspaceOperationLedger = {
    async loadAttemptState(value) {
      return zeroOrOne(await request('operation.attempt-state.load', value));
    },
    async claim(value) {
      return one(await request('operation.claim', value));
    },
    async markDispatched(value) {
      return one(await request('operation.dispatch', value));
    },
    async sealRejected(value) {
      return one(await request('operation.seal-rejected', value));
    },
    async sealAtomic(value) {
      return one(await request('operation.seal-atomic', value));
    },
    async reconcileDispatched(value) {
      return one(await request('operation.reconcile-dispatched', value));
    },
    async loadSealedToolExecution(value) {
      return zeroOrOne(await request('operation.sealed.load', value));
    },
    async listSealedToolExecutions(value) {
      return (await request('operation.sealed.list', value)) as Awaited<
        ReturnType<
          AgentEvaluationControlledWorkspaceOperationLedger['listSealedToolExecutions']
        >
      >;
    },
    async claimCleanup(value) {
      return one(await request('operation.cleanup.claim', value));
    },
    async markCleanupDispatched(value) {
      return one(await request('operation.cleanup.dispatch', value));
    },
    async sealCleanup(value) {
      return one(await request('operation.cleanup.seal', value));
    },
    async reconcileCleanup(value) {
      return one(await request('operation.cleanup.reconcile', value));
    },
  };

  return Object.freeze({
    authorizer: Object.freeze(authorizer),
    loader: Object.freeze(loader),
    operations: Object.freeze(operations),
  });
};

export const createAgentEvaluationControlledWorkspaceServiceAcknowledgement = (
  input: Omit<
    AgentEvaluationControlledWorkspaceServiceAcknowledgement,
    'receiptDigest'
  >
): AgentEvaluationControlledWorkspaceServiceAcknowledgement => {
  if (
    input.format !== AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT ||
    input.version !== AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION ||
    !Object.hasOwn(servicePaths, input.operation) ||
    !isAgentCanonicalDigest(input.requestDigest) ||
    !Array.isArray(input.facts) ||
    input.facts.length > maximumFacts
  ) {
    return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid);
  }
  return Object.freeze({
    ...input,
    facts: Object.freeze([...input.facts]),
    receiptDigest: digestAgentCanonicalValue(input),
  });
};

export const digestAgentEvaluationControlledWorkspaceServiceRequest = (
  input: Omit<AgentEvaluationControlledWorkspaceServiceRequest, 'requestDigest'>
): CanonicalDigest => digestAgentCanonicalValue(input);

export type AgentEvaluationControlledWorkspaceServiceMaterialPayload =
  Readonly<{
    material: AgentEvaluationCaseMaterial;
    materialDigest: CanonicalDigest;
  }>;
