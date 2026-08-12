import {
  AGENT_NATIVE_PROVIDER_STATE_VAULT_RETIREMENT_RECEIPT_FORMAT,
  AGENT_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_REQUEST_FORMAT,
  AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
  digestAgentCanonicalValue,
  digestAgentNativeProviderStateReference,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentNativeProviderStateVaultAuthority,
  isAgentNativeProviderStateVaultResolveReceipt,
  isAgentNativeProviderStateVaultRetireRequest,
  isAgentNativeProviderStateVaultSealReceipt,
  isAgentNativeProviderStateVaultSealRequest,
  type AgentNativeProviderStateVaultAuthority,
  type AgentNativeProviderStateVaultPort,
  type AgentNativeProviderStateVaultResolveReceipt,
  type AgentNativeProviderStateVaultRetireRequest,
  type AgentNativeProviderStateVaultRetirementReceipt,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
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

export const PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE =
  'native-provider-state-vault-owner' as const;
export const PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE_HEADER =
  'X-Prodivix-Native-Provider-State-Vault-Purpose' as const;
export const PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_SEAL_COMMAND_FORMAT =
  'prodivix.agent-evaluation-native-provider-state-vault-seal-command' as const;
export const PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_RESULT_FORMAT =
  'prodivix.agent-evaluation-native-provider-state-vault-resolve-result' as const;
export const PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_WIRE_VERSION =
  1 as const;
export const PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_COMPONENT_BYTES =
  16_384 as const;
export const PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_OUTER_BYTES =
  32_768 as const;
export const PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_HANDLE_BYTES =
  512 as const;

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type CreateEnvironmentProductionAgentEvaluationNativeProviderStateVaultClientInput =
  Readonly<{
    planDigest: string;
    repositoryCommit: string;
    expectedAuthority: AgentNativeProviderStateVaultAuthority;
    environment?: Environment;
    fetch?: typeof fetch;
    forbiddenCanaries?: () => readonly string[];
  }>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const commitPattern = /^[a-f0-9]{40}$/u;
const pathSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const retirementReceiptKeys = Object.freeze([
  'format',
  'version',
  'authorityDigest',
  'retireRequestDigest',
  'sealReceiptDigest',
  'opaqueProviderStateRef',
  'stateKeyCreationReceiptDigest',
  'resolveReceiptDigest',
  'disposition',
  'retirementTimeliness',
  'policyViolationDigest',
  'stateKeyDestructionReceiptDigest',
  'opaqueRecordDeletionReceiptDigest',
  'cryptographicExpiryReceiptDigest',
  'retiredAt',
  'receiptDigest',
] as const);
const resolveRequestKeys = Object.freeze([
  'format',
  'version',
  'authorityDigest',
  'opaqueProviderStateRef',
  'sealRequestDigest',
  'sealReceiptDigest',
  'purpose',
  'providerStateReferenceKind',
  'providerStateReferenceDigest',
  'sourceAttemptId',
  'sourceInvocationId',
  'sourceGeneration',
  'consumerAttemptId',
  'consumerInvocationId',
  'consumerGeneration',
  'taskId',
  'runId',
  'requestedAt',
  'expiresAt',
  'resolveRequestDigest',
] as const);

const fail = (
  code: (typeof AGENT_EVALUATION_RUNNER_ERROR_CODES)[keyof typeof AGENT_EVALUATION_RUNNER_ERROR_CODES],
  httpStatus?: number
): never => {
  throw new AgentEvaluationRunnerError(code, httpStatus);
};

const invalid = (): never =>
  fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);

const unavailable = (httpStatus?: number): never =>
  fail(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
    httpStatus
  );

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): value is Readonly<Record<string, unknown>> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && keys.includes(key)
  );

const readEnvironment = (
  environment: Environment
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const canonicalSegment = (value: string): string => {
  if (!pathSegmentPattern.test(value)) return invalid();
  return encodeURIComponent(value);
};

const decodeCanonicalJson = (bytes: Uint8Array): unknown => {
  try {
    const text = textDecoder.decode(bytes);
    const value = JSON.parse(text, (key, entry: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new TypeError('unsafe-key');
      return entry;
    }) as unknown;
    if (canonicalJsonText(value) !== text) return unavailable();
    return value;
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return unavailable();
  }
};

const readBoundedResponse = async (
  response: Response,
  maximumBytes: number
): Promise<Uint8Array> => {
  if (!response.body) return new Uint8Array();
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
        return unavailable(response.status);
      }
      chunks.push(next.value);
    }
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

const isSelfBoundResolveRequest = (
  value: unknown,
  authority: AgentNativeProviderStateVaultAuthority
): value is Parameters<
  AgentNativeProviderStateVaultPort['resolve']
>[0]['request'] => {
  if (!exactRecord(value, resolveRequestKeys)) return false;
  const request = value as Parameters<
    AgentNativeProviderStateVaultPort['resolve']
  >[0]['request'];
  if (
    request.format !==
      AGENT_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_REQUEST_FORMAT ||
    request.version !== AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION ||
    request.authorityDigest !== authority.authorityDigest ||
    ![
      request.sealRequestDigest,
      request.sealReceiptDigest,
      request.providerStateReferenceDigest,
      request.resolveRequestDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentControlIdentity(request.opaqueProviderStateRef) ||
    !['background-job-state', 'reasoning-continuation-state'].includes(
      request.purpose
    ) ||
    !['interaction-id', 'response-id'].includes(
      request.providerStateReferenceKind
    ) ||
    ![
      request.sourceAttemptId,
      request.sourceInvocationId,
      request.consumerAttemptId,
      request.consumerInvocationId,
      request.taskId,
      request.runId,
    ].every(isAgentControlIdentity) ||
    !Number.isSafeInteger(request.sourceGeneration) ||
    request.sourceGeneration < 0 ||
    request.consumerAttemptId !== request.sourceAttemptId ||
    request.consumerInvocationId === request.sourceInvocationId ||
    request.consumerGeneration !== request.sourceGeneration ||
    !isAgentControlInstant(request.requestedAt) ||
    !isAgentControlInstant(request.expiresAt) ||
    Date.parse(request.requestedAt) >= Date.parse(request.expiresAt)
  ) {
    return false;
  }
  const { resolveRequestDigest, ...base } = request;
  return resolveRequestDigest === digestAgentCanonicalValue(base);
};

const decodeRetirementReceipt = (
  value: unknown,
  authority: AgentNativeProviderStateVaultAuthority,
  retireRequestDigest: string,
  request?: AgentNativeProviderStateVaultRetireRequest
): AgentNativeProviderStateVaultRetirementReceipt => {
  if (!exactRecord(value, retirementReceiptKeys)) return unavailable();
  const receipt =
    value as unknown as AgentNativeProviderStateVaultRetirementReceipt;
  if (
    receipt.format !==
      AGENT_NATIVE_PROVIDER_STATE_VAULT_RETIREMENT_RECEIPT_FORMAT ||
    receipt.version !== AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION ||
    receipt.authorityDigest !== authority.authorityDigest ||
    receipt.retireRequestDigest !== retireRequestDigest ||
    ![
      receipt.sealReceiptDigest,
      receipt.stateKeyCreationReceiptDigest,
      receipt.stateKeyDestructionReceiptDigest,
      receipt.opaqueRecordDeletionReceiptDigest,
      receipt.cryptographicExpiryReceiptDigest,
      receipt.receiptDigest,
    ].every(isAgentCanonicalDigest) ||
    (receipt.resolveReceiptDigest !== null &&
      !isAgentCanonicalDigest(receipt.resolveReceiptDigest)) ||
    !isAgentControlIdentity(receipt.opaqueProviderStateRef) ||
    !['cancelled', 'consumed', 'expired', 'overdue-expired'].includes(
      receipt.disposition
    ) ||
    !['overdue-violation', 'within-policy'].includes(
      receipt.retirementTimeliness
    ) ||
    (receipt.policyViolationDigest !== null &&
      !isAgentCanonicalDigest(receipt.policyViolationDigest)) ||
    (receipt.disposition === 'overdue-expired') !==
      (receipt.retirementTimeliness === 'overdue-violation') ||
    (receipt.retirementTimeliness === 'within-policy') !==
      (receipt.policyViolationDigest === null) ||
    !isAgentControlInstant(receipt.retiredAt) ||
    (request !== undefined &&
      (receipt.sealReceiptDigest !== request.sealReceiptDigest ||
        receipt.opaqueProviderStateRef !== request.opaqueProviderStateRef ||
        receipt.resolveReceiptDigest !== request.resolveReceiptDigest ||
        receipt.disposition !== request.disposition ||
        Date.parse(receipt.retiredAt) < Date.parse(request.requestedAt) ||
        Date.parse(receipt.retiredAt) - Date.parse(request.requestedAt) >
          authority.maximumLifecycleAckDelayMs ||
        (request.disposition !== 'overdue-expired' &&
          Date.parse(receipt.retiredAt) >
            Date.parse(request.expiresAt) +
              authority.maximumLifecycleAckDelayMs)))
  ) {
    return unavailable();
  }
  const expectedCryptographicExpiryDigest = digestAgentCanonicalValue({
    format: 'prodivix.agent-native-provider-state-vault-cryptographic-expiry',
    version: AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
    authorityDigest: receipt.authorityDigest,
    opaqueProviderStateRef: receipt.opaqueProviderStateRef,
    stateKeyCreationReceiptDigest: receipt.stateKeyCreationReceiptDigest,
    stateKeyDestructionReceiptDigest: receipt.stateKeyDestructionReceiptDigest,
    opaqueRecordDeletionReceiptDigest:
      receipt.opaqueRecordDeletionReceiptDigest,
    retiredAt: receipt.retiredAt,
  });
  const { receiptDigest, ...base } = receipt;
  const expectedPolicyViolationDigest =
    request?.disposition === 'overdue-expired'
      ? digestAgentCanonicalValue({
          format:
            'prodivix.agent-native-provider-state-vault-retirement-policy-violation',
          version: AGENT_NATIVE_PROVIDER_STATE_VAULT_VERSION,
          authorityDigest: request.authorityDigest,
          retireRequestDigest: request.retireRequestDigest,
          sealReceiptDigest: request.sealReceiptDigest,
          opaqueProviderStateRef: request.opaqueProviderStateRef,
          expiresAt: request.expiresAt,
          requestedAt: request.requestedAt,
          retiredAt: receipt.retiredAt,
          stateKeyDestructionReceiptDigest:
            receipt.stateKeyDestructionReceiptDigest,
          opaqueRecordDeletionReceiptDigest:
            receipt.opaqueRecordDeletionReceiptDigest,
        })
      : null;
  if (
    receipt.cryptographicExpiryReceiptDigest !==
      expectedCryptographicExpiryDigest ||
    (request !== undefined &&
      receipt.policyViolationDigest !== expectedPolicyViolationDigest) ||
    receiptDigest !== digestAgentCanonicalValue(base)
  ) {
    return unavailable();
  }
  return Object.freeze({ ...receipt });
};

/**
 * Creates the callback-bound runner view of the Backend-owned durable vault.
 * The official Provider handle exists only inside one authenticated request or
 * response and is never retained by this adapter.
 */
export const createEnvironmentProductionAgentEvaluationNativeProviderStateVaultClient =
  (
    input: CreateEnvironmentProductionAgentEvaluationNativeProviderStateVaultClientInput
  ): AgentNativeProviderStateVaultPort => {
    const environment = input.environment ?? process.env;
    const read = readEnvironment(environment);
    const baseUrl = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl);
    const namespaceId = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
    );
    const repositoryCommit = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
    );
    if (
      baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      typeof namespaceId !== 'string' ||
      !pathSegmentPattern.test(namespaceId) ||
      repositoryCommit !== input.repositoryCommit ||
      !commitPattern.test(input.repositoryCommit) ||
      !isAgentCanonicalDigest(input.planDigest) ||
      !isAgentNativeProviderStateVaultAuthority(input.expectedAuthority)
    ) {
      return invalid();
    }
    const fetchImplementation = input.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== 'function') return invalid();
    const authority = input.expectedAuthority;
    const root = `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${canonicalSegment(namespaceId)}/${canonicalSegment(input.planDigest)}/${canonicalSegment(input.repositoryCommit)}/native-provider-state-vault`;

    const invoke = async (options: {
      method: 'GET' | 'POST';
      path: string;
      acceptedStatuses: readonly number[];
      maximumResponseBytes: number;
      body?: string;
      idempotencyKey?: string;
      allowAbsent?: boolean;
    }): Promise<unknown | null> => {
      let token: string | undefined;
      try {
        token = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token);
      } catch {
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable);
      }
      if (!isAgentEvaluationServiceToken(token)) {
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable);
      }
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
        [PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE_HEADER]:
          PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE,
        ...(options.body === undefined
          ? {}
          : { 'Content-Type': 'application/json; charset=utf-8' }),
        ...(options.idempotencyKey
          ? { 'Idempotency-Key': options.idempotencyKey }
          : {}),
      });
      token = undefined;
      let response: Response;
      try {
        response = await fetchImplementation(`${root}${options.path}`, {
          method: options.method,
          headers,
          ...(options.body === undefined ? {} : { body: options.body }),
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
          signal: AbortSignal.timeout(authority.maximumLifecycleAckDelayMs),
        });
      } catch {
        headers.delete('Authorization');
        return unavailable();
      }
      headers.delete('Authorization');
      if (options.allowAbsent && response.status === 404) {
        if (response.headers.get('cache-control') !== 'no-store') {
          return unavailable(response.status);
        }
        const absentBytes = await readBoundedResponse(response, 1);
        try {
          if (absentBytes.byteLength !== 0) return unavailable(response.status);
          return null;
        } finally {
          absentBytes.fill(0);
        }
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
        return unavailable(response.status);
      }
      const bytes = await readBoundedResponse(
        response,
        options.maximumResponseBytes
      );
      try {
        if (bytes.byteLength < 2) return unavailable(response.status);
        assertProductionAgentEvaluationG3SandboxCanaryClean(bytes, canaries);
        return decodeCanonicalJson(bytes);
      } finally {
        bytes.fill(0);
      }
    };

    return Object.freeze({
      authority,
      async seal({ request, callbackLocalProviderStateHandle }) {
        if (
          !isAgentNativeProviderStateVaultSealRequest(request) ||
          request.authorityDigest !== authority.authorityDigest ||
          !isAgentControlIdentity(callbackLocalProviderStateHandle) ||
          textEncoder.encode(callbackLocalProviderStateHandle).byteLength >
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_HANDLE_BYTES ||
          digestAgentNativeProviderStateReference(
            request.providerStateReferenceKind,
            callbackLocalProviderStateHandle
          ) !== request.providerStateReferenceDigest
        ) {
          return invalid();
        }
        const command = Object.freeze({
          format:
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_SEAL_COMMAND_FORMAT,
          version:
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_WIRE_VERSION,
          request,
          callbackLocalProviderStateHandle,
        });
        const value = await invoke({
          method: 'POST',
          path: '/seal',
          acceptedStatuses: Object.freeze([200, 201]),
          maximumResponseBytes:
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_COMPONENT_BYTES,
          body: serialize(
            command,
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_OUTER_BYTES
          ),
          idempotencyKey: request.sealRequestDigest,
        });
        if (!isAgentNativeProviderStateVaultSealReceipt(value, request)) {
          return unavailable();
        }
        return value.status === 'sealed'
          ? Object.freeze({
              status: 'sealed' as const,
              opaqueProviderStateRef: value.opaqueProviderStateRef!,
              stateKeyCreationReceiptDigest:
                value.stateKeyCreationReceiptDigest!,
              sealedAt: value.sealedAt,
            })
          : Object.freeze({
              status: value.status,
              opaqueProviderStateRef: null,
              stateKeyCreationReceiptDigest: null,
              sealedAt: value.sealedAt,
            });
      },
      async resolve({ request }) {
        if (!isSelfBoundResolveRequest(request, authority)) {
          return invalid();
        }
        const value = await invoke({
          method: 'POST',
          path: '/resolve',
          acceptedStatuses: Object.freeze([200, 201]),
          maximumResponseBytes:
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_OUTER_BYTES,
          body: serialize(
            request,
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_COMPONENT_BYTES
          ),
          idempotencyKey: request.resolveRequestDigest,
        });
        if (
          !exactRecord(value, [
            'format',
            'version',
            'receipt',
            'callbackLocalProviderStateHandle',
          ]) ||
          value.format !==
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_RESULT_FORMAT ||
          value.version !==
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_WIRE_VERSION ||
          !isAgentNativeProviderStateVaultResolveReceipt(value.receipt, request)
        ) {
          return unavailable();
        }
        const receipt =
          value.receipt as AgentNativeProviderStateVaultResolveReceipt;
        const handle = value.callbackLocalProviderStateHandle;
        if (receipt.status === 'resolved') {
          if (
            !isAgentControlIdentity(handle) ||
            textEncoder.encode(handle).byteLength >
              PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_HANDLE_BYTES ||
            digestAgentNativeProviderStateReference(
              request.providerStateReferenceKind,
              handle
            ) !== request.providerStateReferenceDigest
          ) {
            return unavailable();
          }
          return Object.freeze({
            status: 'resolved' as const,
            callbackLocalProviderStateHandle: handle,
            resolvedAt: receipt.resolvedAt,
          });
        }
        if (handle !== null) return unavailable();
        return Object.freeze({
          status: receipt.status,
          callbackLocalProviderStateHandle: null,
          resolvedAt: receipt.resolvedAt,
        });
      },
      async retire({ request }) {
        if (
          !isAgentNativeProviderStateVaultRetireRequest(request) ||
          request.authorityDigest !== authority.authorityDigest
        ) {
          return invalid();
        }
        const value = await invoke({
          method: 'POST',
          path: '/retire',
          acceptedStatuses: Object.freeze([200, 201]),
          maximumResponseBytes:
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_COMPONENT_BYTES,
          body: serialize(
            request,
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_COMPONENT_BYTES
          ),
          idempotencyKey: request.retireRequestDigest,
        });
        const receipt = decodeRetirementReceipt(
          value,
          authority,
          request.retireRequestDigest,
          request
        );
        return Object.freeze({
          status: 'retired' as const,
          stateKeyDestructionReceiptDigest:
            receipt.stateKeyDestructionReceiptDigest,
          opaqueRecordDeletionReceiptDigest:
            receipt.opaqueRecordDeletionReceiptDigest,
          retiredAt: receipt.retiredAt,
        });
      },
      async lookupRetirementReceipt(retireRequestDigest) {
        if (!isAgentCanonicalDigest(retireRequestDigest)) return invalid();
        const value = await invoke({
          method: 'GET',
          path: `/retirements/${encodeURIComponent(retireRequestDigest)}`,
          acceptedStatuses: Object.freeze([200]),
          maximumResponseBytes:
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_COMPONENT_BYTES,
          allowAbsent: true,
        });
        if (value === null) return null;
        return decodeRetirementReceipt(value, authority, retireRequestDigest);
      },
    });
  };
