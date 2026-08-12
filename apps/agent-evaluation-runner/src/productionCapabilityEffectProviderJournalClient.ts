import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE_HEADER,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ROUTE_SEGMENT,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_ACK_DELAY_MS,
  createAgentEvaluationCapabilityEffectProviderJournalRoutes,
  doesAgentEvaluationCapabilityEffectProviderJournalCleanupReceiptMatchRequest,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt,
  isAgentEvaluationCapabilityEffectProviderJournalCleanupRequest,
  isAgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
  isAgentEvaluationCapabilityEffectProviderJournalExecutionWrite,
  isAgentEvaluationCapabilityEffectProviderJournalHealth,
  isAgentEvaluationCapabilityEffectProviderJournalResultRecord,
  isAgentEvaluationCapabilityEffectProviderJournalSnapshot,
  isAgentEvaluationCapabilityEffectProviderJournalStageRecord,
  isAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt,
  type AgentEvaluationCapabilityEffectProviderJournalCleanupReceipt,
  type AgentEvaluationCapabilityEffectProviderJournalCleanupRequest,
  type AgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
  type AgentEvaluationCapabilityEffectProviderJournalExecutionWrite,
  type AgentEvaluationCapabilityEffectProviderJournalHealth,
  type AgentEvaluationCapabilityEffectProviderJournalResultRecord,
  type AgentEvaluationCapabilityEffectProviderJournalSnapshot,
  type AgentEvaluationCapabilityEffectProviderJournalStageRecord,
  type AgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isUnsafeObjectKey } from '@prodivix/shared/safety';
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export const PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ID' as const;

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationProductionCapabilityEffectProviderJournalClient =
  Readonly<{
    readHealth(): Promise<
      AgentEvaluationCapabilityEffectProviderJournalHealth | undefined
    >;
    writeStage(
      stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord
    ): Promise<
      AgentEvaluationCapabilityEffectProviderJournalStageRecord | undefined
    >;
    claimStage(
      stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord
    ): Promise<
      | Readonly<{
          stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord;
          disposition: 'created' | 'reconciled';
        }>
      | undefined
    >;
    writeExecution(input: {
      write: AgentEvaluationCapabilityEffectProviderJournalExecutionWrite;
      stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord;
      priorExecutionRecord: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord | null;
    }): Promise<
      AgentEvaluationCapabilityEffectProviderJournalExecutionRecord | undefined
    >;
    writeResult(input: {
      resultRecord: AgentEvaluationCapabilityEffectProviderJournalResultRecord;
      stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord;
      executionRecords: readonly AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[];
    }): Promise<
      AgentEvaluationCapabilityEffectProviderJournalResultRecord | undefined
    >;
    readSnapshot(
      ownerRequestDigest: CanonicalDigest
    ): Promise<
      AgentEvaluationCapabilityEffectProviderJournalSnapshot | undefined
    >;
    cleanup(
      request: AgentEvaluationCapabilityEffectProviderJournalCleanupRequest
    ): Promise<
      AgentEvaluationCapabilityEffectProviderJournalCleanupReceipt | undefined
    >;
    readZeroResidual(
      attemptId: string
    ): Promise<
      | AgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt
      | undefined
    >;
  }>;

export type AgentEvaluationProductionCapabilityEffectProviderJournalHealthReader =
  Readonly<{
    readHealth(): Promise<
      AgentEvaluationCapabilityEffectProviderJournalHealth | undefined
    >;
  }>;

export type CreateEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalHealthReaderInput =
  Readonly<{
    environment?: Environment;
    fetch?: typeof fetch;
    clock?: () => Date;
    forbiddenCanaries?: () => readonly string[];
  }>;

export type CreateEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalClientInput =
  Readonly<{
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    environment?: Environment;
    fetch?: typeof fetch;
    clock?: () => Date;
    forbiddenCanaries?: () => readonly string[];
  }>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const commitPattern = /^[0-9a-f]{40}$/u;
const pathSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const readEnvironment = (
  environment: Environment
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const serialize = (value: unknown, maximumBytes: number): string => {
  try {
    const body = canonicalJsonText(value);
    if (textEncoder.encode(body).byteLength > maximumBytes) return invalid();
    return body;
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return invalid();
  }
};

const readBoundedResponse = async (
  response: Response,
  maximumBytes: number
): Promise<Uint8Array | undefined> => {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return undefined;
      }
      chunks.push(next.value);
    }
    if (byteLength === 0) return undefined;
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    await reader.cancel().catch(() => undefined);
    for (const chunk of chunks) chunk.fill(0);
  }
};

const hasEmptyResponseBody = async (response: Response): Promise<boolean> => {
  if (!response.body) return true;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return true;
      if (next.value.byteLength > 0) return false;
    }
  } catch {
    return false;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
};

const decodeCanonicalJson = (bytes: Uint8Array): unknown | undefined => {
  try {
    const text = textDecoder.decode(bytes);
    const value = JSON.parse(text, (key, entry: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new TypeError('unsafe-key');
      return entry;
    }) as unknown;
    return canonicalJsonText(value) === text ? value : undefined;
  } catch {
    return undefined;
  }
};

const recordMatchesScope = (
  record: Readonly<{
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
  }>,
  scope: Readonly<{
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
  }>
): boolean =>
  record.namespaceId === scope.namespaceId &&
  record.planDigest === scope.planDigest &&
  record.repositoryCommit === scope.repositoryCommit;

/** Namespace-scoped health for preplan registration; it opens no write route. */
export const createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalHealthReader =
  (
    input: CreateEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalHealthReaderInput = {}
  ): AgentEvaluationProductionCapabilityEffectProviderJournalHealthReader => {
    const environment = input.environment ?? process.env;
    const read = readEnvironment(environment);
    const namespaceId = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
    );
    const ownerInstanceId = read(
      PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME
    );
    if (
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl) !==
        AGENT_EVALUATION_LEDGER_BASE_URL ||
      typeof namespaceId !== 'string' ||
      !pathSegmentPattern.test(namespaceId) ||
      !isAgentControlIdentity(ownerInstanceId)
    ) {
      return invalid();
    }
    const fetchImplementation = input.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== 'function') return invalid();
    const clock = input.clock ?? (() => new Date());
    const path = `/v1/evaluations/${encodeURIComponent(namespaceId)}/${AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_ROUTE_SEGMENT}/health`;
    return Object.freeze({
      async readHealth() {
        let token: string | undefined;
        try {
          token = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token);
        } catch {
          return undefined;
        }
        if (!isAgentEvaluationServiceToken(token)) return undefined;
        const credential = token;
        const canaries = () =>
          Object.freeze([
            ...(input.forbiddenCanaries?.() ?? Object.freeze([])),
            credential,
          ]);
        const headers = new Headers({
          Accept: 'application/json',
          Authorization: `Bearer ${credential}`,
          [AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE_HEADER]:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE,
        });
        token = undefined;
        let response: Response;
        try {
          response = await fetchImplementation(
            `${AGENT_EVALUATION_LEDGER_BASE_URL}${path}`,
            {
              method: 'GET',
              headers,
              cache: 'no-store',
              credentials: 'omit',
              redirect: 'error',
              referrerPolicy: 'no-referrer',
              signal: AbortSignal.timeout(
                AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_ACK_DELAY_MS
              ),
            }
          );
        } catch {
          headers.delete('Authorization');
          return undefined;
        }
        headers.delete('Authorization');
        if (
          (response.status !== 200 && response.status !== 503) ||
          response.headers.get('cache-control') !== 'no-store' ||
          response.headers.get('content-type') !==
            'application/json; charset=utf-8' ||
          response.headers.get('content-encoding') !== null
        ) {
          return undefined;
        }
        const bytes = await readBoundedResponse(
          response,
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS.maximumHealthBytes
        );
        if (!bytes) return undefined;
        try {
          assertProductionAgentEvaluationG3SandboxCanaryClean(bytes, canaries);
          const value = decodeCanonicalJson(bytes);
          if (
            !isAgentEvaluationCapabilityEffectProviderJournalHealth(value) ||
            value.ownerInstanceId !== ownerInstanceId ||
            (response.status === 200) !== (value.status === 'healthy')
          ) {
            return undefined;
          }
          const now = clock().getTime();
          if (
            !Number.isFinite(now) ||
            Date.parse(value.checkedAt) > now + 30_000 ||
            now >= Date.parse(value.expiresAt)
          ) {
            return undefined;
          }
          return value.status === 'healthy' ? value : undefined;
        } finally {
          bytes.fill(0);
        }
      },
    });
  };

/**
 * Creates the authenticated 8791 view of the unique Backend journal owner.
 * Ciphertext is posted as an opaque execution sidecar and is never decoded by
 * this client. ACK loss is reconciled through the durable owner snapshot.
 */
export const createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalClient =
  (
    input: CreateEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalClientInput
  ): AgentEvaluationProductionCapabilityEffectProviderJournalClient => {
    const environment = input.environment ?? process.env;
    const read = readEnvironment(environment);
    const namespaceId = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
    );
    const ownerInstanceId = read(
      PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME
    );
    if (
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl) !==
        AGENT_EVALUATION_LEDGER_BASE_URL ||
      typeof namespaceId !== 'string' ||
      !pathSegmentPattern.test(namespaceId) ||
      !isAgentControlIdentity(ownerInstanceId) ||
      !isAgentCanonicalDigest(input.planDigest) ||
      !commitPattern.test(input.repositoryCommit) ||
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit) !==
        input.repositoryCommit
    ) {
      return invalid();
    }
    const fetchImplementation = input.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== 'function') return invalid();
    const clock = input.clock ?? (() => new Date());
    const scope = Object.freeze({
      namespaceId,
      planDigest: input.planDigest,
      repositoryCommit: input.repositoryCommit,
    });
    const routes =
      createAgentEvaluationCapabilityEffectProviderJournalRoutes(scope);

    const invoke = async (options: {
      method: 'GET' | 'POST';
      path: string;
      acceptedStatuses: readonly number[];
      maximumResponseBytes: number;
      body?: string;
      idempotencyKey?: CanonicalDigest;
      allowAbsent?: boolean;
    }): Promise<Readonly<{ status: number; value: unknown }> | undefined> => {
      let token: string | undefined;
      try {
        token = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token);
      } catch {
        return undefined;
      }
      if (!isAgentEvaluationServiceToken(token)) return undefined;
      const credential = token;
      const canaries = () =>
        Object.freeze([
          ...(input.forbiddenCanaries?.() ?? Object.freeze([])),
          credential,
        ]);
      if (options.body !== undefined) {
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          options.body,
          canaries
        );
      }
      const headers = new Headers({
        Accept: 'application/json',
        Authorization: `Bearer ${credential}`,
        [AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE_HEADER]:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_PURPOSE,
        ...(options.body === undefined
          ? {}
          : { 'Content-Type': 'application/json; charset=utf-8' }),
        ...(options.idempotencyKey === undefined
          ? {}
          : { 'Idempotency-Key': options.idempotencyKey }),
      });
      token = undefined;
      let response: Response;
      try {
        response = await fetchImplementation(
          `${AGENT_EVALUATION_LEDGER_BASE_URL}${options.path}`,
          {
            method: options.method,
            headers,
            ...(options.body === undefined ? {} : { body: options.body }),
            cache: 'no-store',
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.timeout(
              AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_ACK_DELAY_MS
            ),
          }
        );
      } catch {
        headers.delete('Authorization');
        return undefined;
      }
      headers.delete('Authorization');
      if (options.allowAbsent && response.status === 404) {
        const declaredLength = response.headers.get('content-length');
        const emptyBody = await hasEmptyResponseBody(response);
        return emptyBody &&
          response.headers.get('cache-control') === 'no-store' &&
          response.headers.get('content-type') === null &&
          response.headers.get('content-encoding') === null &&
          (declaredLength === null || declaredLength === '0')
          ? Object.freeze({ status: response.status, value: null })
          : undefined;
      }
      const declaredLength = response.headers.get('content-length');
      if (
        !options.acceptedStatuses.includes(response.status) ||
        response.headers.get('cache-control') !== 'no-store' ||
        response.headers.get('content-type') !==
          'application/json; charset=utf-8' ||
        response.headers.get('content-encoding') !== null ||
        (declaredLength !== null &&
          (!/^\d+$/u.test(declaredLength) ||
            Number(declaredLength) > options.maximumResponseBytes))
      ) {
        return undefined;
      }
      const bytes = await readBoundedResponse(
        response,
        options.maximumResponseBytes
      );
      if (bytes === undefined) return undefined;
      try {
        assertProductionAgentEvaluationG3SandboxCanaryClean(bytes, canaries);
        const value = decodeCanonicalJson(bytes);
        return value === undefined
          ? undefined
          : Object.freeze({ status: response.status, value });
      } finally {
        bytes.fill(0);
      }
    };

    const readSnapshot = async (
      ownerRequestDigest: CanonicalDigest
    ): Promise<
      AgentEvaluationCapabilityEffectProviderJournalSnapshot | undefined
    > => {
      if (!isAgentCanonicalDigest(ownerRequestDigest)) return invalid();
      const response = await invoke({
        method: 'GET',
        path: routes.ownerRequest(ownerRequestDigest),
        acceptedStatuses: Object.freeze([200]),
        maximumResponseBytes:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS.maximumSnapshotBytes,
        allowAbsent: true,
      });
      if (response === undefined || response.status === 404) return undefined;
      if (
        !isAgentEvaluationCapabilityEffectProviderJournalSnapshot(
          response.value
        ) ||
        response.value.ownerRequestDigest !== ownerRequestDigest ||
        !recordMatchesScope(response.value.stageRecord, scope)
      ) {
        return undefined;
      }
      const now = clock().getTime();
      const readAt = Date.parse(response.value.readAt);
      if (
        !Number.isFinite(now) ||
        readAt > now + 30_000 ||
        now - readAt > 30_000
      ) {
        return undefined;
      }
      return response.value;
    };

    const claimStage = async (
      stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord
    ): Promise<
      | Readonly<{
          stageRecord: AgentEvaluationCapabilityEffectProviderJournalStageRecord;
          disposition: 'created' | 'reconciled';
        }>
      | undefined
    > => {
      if (
        !isAgentEvaluationCapabilityEffectProviderJournalStageRecord(
          stageRecord
        ) ||
        !recordMatchesScope(stageRecord, scope)
      ) {
        return invalid();
      }
      const response = await invoke({
        method: 'POST',
        path: routes.stages,
        acceptedStatuses: Object.freeze([200, 201]),
        maximumResponseBytes:
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumStageRecordBytes,
        body: serialize(
          stageRecord,
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumStageRecordBytes
        ),
        idempotencyKey: stageRecord.recordDigest,
      });
      if (
        response !== undefined &&
        isAgentEvaluationCapabilityEffectProviderJournalStageRecord(
          response.value
        ) &&
        sameCanonicalJson(response.value, stageRecord)
      ) {
        return Object.freeze({
          stageRecord: response.value,
          disposition:
            response.status === 201
              ? ('created' as const)
              : ('reconciled' as const),
        });
      }
      const snapshot = await readSnapshot(stageRecord.ownerRequestDigest);
      return snapshot !== undefined &&
        sameCanonicalJson(snapshot.stageRecord, stageRecord)
        ? Object.freeze({
            stageRecord: snapshot.stageRecord,
            disposition: 'reconciled' as const,
          })
        : undefined;
    };

    return Object.freeze({
      async readHealth() {
        const response = await invoke({
          method: 'GET',
          path: routes.health,
          acceptedStatuses: Object.freeze([200, 503]),
          maximumResponseBytes:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS.maximumHealthBytes,
        });
        if (
          response === undefined ||
          !isAgentEvaluationCapabilityEffectProviderJournalHealth(
            response.value
          ) ||
          response.value.ownerInstanceId !== ownerInstanceId ||
          (response.status === 200) !== (response.value.status === 'healthy')
        ) {
          return undefined;
        }
        const now = clock().getTime();
        if (
          !Number.isFinite(now) ||
          Date.parse(response.value.checkedAt) > now + 30_000 ||
          now >= Date.parse(response.value.expiresAt)
        ) {
          return undefined;
        }
        return response.value.status === 'healthy' ? response.value : undefined;
      },
      async writeStage(stageRecord) {
        return (await claimStage(stageRecord))?.stageRecord;
      },
      claimStage,
      async writeExecution({ write, stageRecord, priorExecutionRecord }) {
        if (
          !recordMatchesScope(stageRecord, scope) ||
          !isAgentEvaluationCapabilityEffectProviderJournalExecutionWrite(
            write,
            stageRecord,
            priorExecutionRecord
          )
        ) {
          return invalid();
        }
        const response = await invoke({
          method: 'POST',
          path: routes.executions,
          acceptedStatuses: Object.freeze([200, 201]),
          maximumResponseBytes:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionRecordBytes,
          body: serialize(
            write,
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumExecutionWriteBytes
          ),
          idempotencyKey: write.writeDigest,
        });
        if (
          response !== undefined &&
          isAgentEvaluationCapabilityEffectProviderJournalExecutionRecord(
            response.value,
            stageRecord,
            priorExecutionRecord
          ) &&
          sameCanonicalJson(response.value, write.executionRecord)
        ) {
          return response.value;
        }
        const snapshot = await readSnapshot(stageRecord.ownerRequestDigest);
        const persisted = snapshot?.executionRecords.find(
          ({ recordDigest }) =>
            recordDigest === write.executionRecord.recordDigest
        );
        return persisted !== undefined &&
          sameCanonicalJson(persisted, write.executionRecord)
          ? persisted
          : undefined;
      },
      async writeResult({ resultRecord, stageRecord, executionRecords }) {
        if (
          !recordMatchesScope(stageRecord, scope) ||
          !isAgentEvaluationCapabilityEffectProviderJournalResultRecord(
            resultRecord,
            stageRecord,
            executionRecords
          )
        ) {
          return invalid();
        }
        const response = await invoke({
          method: 'POST',
          path: routes.results,
          acceptedStatuses: Object.freeze([200, 201]),
          maximumResponseBytes:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumResultRecordBytes,
          body: serialize(
            resultRecord,
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_LIMITS.maximumResultRecordBytes
          ),
          idempotencyKey: resultRecord.recordDigest,
        });
        if (
          response !== undefined &&
          isAgentEvaluationCapabilityEffectProviderJournalResultRecord(
            response.value,
            stageRecord,
            executionRecords
          ) &&
          sameCanonicalJson(response.value, resultRecord)
        ) {
          return response.value;
        }
        const snapshot = await readSnapshot(stageRecord.ownerRequestDigest);
        return snapshot?.resultRecord !== null &&
          snapshot?.resultRecord !== undefined &&
          sameCanonicalJson(snapshot.resultRecord, resultRecord)
          ? snapshot.resultRecord
          : undefined;
      },
      readSnapshot,
      async cleanup(request) {
        if (
          !isAgentEvaluationCapabilityEffectProviderJournalCleanupRequest(
            request
          ) ||
          !recordMatchesScope(request, scope)
        ) {
          return invalid();
        }
        const response = await invoke({
          method: 'POST',
          path: routes.cleanup,
          acceptedStatuses: Object.freeze([200, 201]),
          maximumResponseBytes:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS.maximumCleanupBytes,
          body: serialize(
            request,
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS.maximumCleanupBytes
          ),
          idempotencyKey: request.requestDigest,
        });
        return response !== undefined &&
          isAgentEvaluationCapabilityEffectProviderJournalCleanupReceipt(
            response.value
          ) &&
          doesAgentEvaluationCapabilityEffectProviderJournalCleanupReceiptMatchRequest(
            request,
            response.value
          )
          ? response.value
          : undefined;
      },
      async readZeroResidual(attemptId) {
        if (!isAgentControlIdentity(attemptId)) return invalid();
        const response = await invoke({
          method: 'GET',
          path: routes.zeroResidual(attemptId),
          acceptedStatuses: Object.freeze([200]),
          maximumResponseBytes:
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_TRANSPORT_LIMITS.maximumZeroResidualBytes,
        });
        if (
          response === undefined ||
          !isAgentEvaluationCapabilityEffectProviderJournalZeroResidualReceipt(
            response.value
          ) ||
          response.value.namespaceId !== namespaceId ||
          response.value.planDigest !== input.planDigest ||
          response.value.repositoryCommit !== input.repositoryCommit ||
          response.value.attemptId !== attemptId ||
          response.value.journalAuthorityDigest !==
            AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_AUTHORITY.authorityDigest
        ) {
          return undefined;
        }
        const now = clock().getTime();
        return Number.isFinite(now) &&
          Date.parse(response.value.checkedAt) <= now + 30_000 &&
          now < Date.parse(response.value.expiresAt)
          ? response.value
          : undefined;
      },
    });
  };
