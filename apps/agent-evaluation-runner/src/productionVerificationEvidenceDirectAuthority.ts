import { createHash } from 'node:crypto';

import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type AgentJsonValue,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  decodeVerificationEvidenceCandidate,
  decodeVerificationEvidenceManifest,
  decodeVerificationEvidenceVerifiedView,
  createVerificationEvidenceStatementDigest,
  digestVerificationValue,
  encodeVerificationEvidenceManifest,
  encodeVerificationEvidenceVerifiedView,
  type VerificationEvidenceManifest,
  type VerificationEvidenceStatement,
  type VerificationEvidenceVerifiedView,
} from '@prodivix/verification';
import {
  canonicalJsonText,
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
  type AgentEvaluationVerificationEvidenceArtifactUploadReceipt,
  type AgentEvaluationVerificationEvidenceFinalizationReceipt,
  type AgentEvaluationVerificationEvidencePreparationReceipt,
  type AgentEvaluationVerificationEvidencePromotionReceipt,
  type AgentEvaluationVerificationEvidenceVerifiedViewReceipt,
} from './evaluationVerificationEvidenceBridge';
import {
  createProductionAgentEvaluationVerificationEvidenceLifecycleEngine,
  type ProductionVerificationEvidenceLifecycleAuthority,
  type ProductionVerificationEvidenceLifecycleDispatchInput,
} from './productionVerificationEvidenceLifecycleEngine';
import {
  createProductionAgentEvaluationVerificationEvidenceOwnerReadAuthority,
  type ProductionAgentEvaluationVerifiedViewAuthority,
  type ProductionAgentEvaluationVerifiedViewAuthorityInput,
} from './productionVerificationEvidenceOwnerRead';
import type {
  ProductionOwnerResourceRetirement,
  ProductionVerificationEvidenceOwnerEngine,
} from './productionWorkspaceVerificationOwnerAuthorityPorts';
import { createEnvironmentAgentEvaluationOwnerStateQueryClient } from './ownerStateQueryClient';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';

export const PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE =
  'agent-evaluation-verification-owner' as const;
export const PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_BASE_PATH =
  '/api/internal/verification/agent-evaluation-owner/v1' as const;
export const PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST =
  'sha256-dd90cc626e7b1ea7d0ccc65a93ca01759654242a75579297db7cacda7a8a79e7' as CanonicalDigest;
export const PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_MAXIMUM_JSON_REQUEST_BYTES = 2_097_152;
export const PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_MAXIMUM_ARTIFACT_BYTES = 16_777_216;
export const PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_MAXIMUM_RESPONSE_BYTES = 33_554_432;
export const PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_READ_TIMEOUT_MS = 30_000;
export const PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_WRITE_TIMEOUT_MS = 180_000;

export const PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_ENVIRONMENT_NAMES =
  Object.freeze({
    baseUrl: 'PRODIVIX_G4_MODEL_EVAL_VERIFICATION_OWNER_BASE_URL',
    token: 'PRODIVIX_G4_MODEL_EVAL_VERIFICATION_OWNER_TOKEN',
  } as const);

const directRequestFormat =
  'prodivix.verification-agent-evaluation-owner-request' as const;
const directResponseFormat =
  'prodivix.verification-agent-evaluation-owner-response' as const;
const directHealthFormat =
  'prodivix.verification-agent-evaluation-owner-health' as const;
const directVersion = 1 as const;
const maximumEvidenceIds = 128;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const visibleAsciiTokenPattern = /^[\x21-\x7e]{32,4096}$/u;
const visibleAsciiCapabilityPattern = /^[\x21-\x7e]{32,512}$/u;
const parameterFreeMediaTypePattern =
  /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

const statementDigestMatches = (
  statement: unknown,
  expectedDigest: unknown
): boolean => {
  if (!isAgentJsonValue(statement) || !isAgentCanonicalDigest(expectedDigest)) {
    return false;
  }
  try {
    return (
      createVerificationEvidenceStatementDigest(
        statement as unknown as VerificationEvidenceStatement
      ) === expectedDigest
    );
  } catch {
    return false;
  }
};

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type ProductionVerificationEvidenceDirectAuthority =
  ProductionVerificationEvidenceLifecycleAuthority &
    ProductionAgentEvaluationVerifiedViewAuthority &
    Readonly<{
      resolveDirect(input: {
        request: ProductionAgentEvaluationVerifiedViewAuthorityInput['request'];
        authority: ProductionAgentEvaluationVerifiedViewAuthorityInput['authority'];
        evidenceIds: ProductionAgentEvaluationVerifiedViewAuthorityInput['evidenceIds'];
      }): Promise<AgentEvaluationVerificationEvidenceVerifiedViewReceipt>;
    }>;

export type CreateProductionVerificationEvidenceDirectAuthorityInput =
  Readonly<{
    baseUrl: string;
    readToken: AgentEvaluationEnvironmentReader;
    forbiddenCanaries: () => readonly string[];
    fetch?: typeof fetch;
    readTimeoutMs?: number;
    writeTimeoutMs?: number;
  }>;

export type CreateEnvironmentProductionVerificationEvidenceDirectAuthorityInput =
  Readonly<{
    environment?: Environment;
    forbiddenCanaries: () => readonly string[];
    fetch?: typeof fetch;
    readTimeoutMs?: number;
    writeTimeoutMs?: number;
  }>;

export type CreateEnvironmentProductionVerificationEvidenceOwnerEngineInput =
  CreateEnvironmentProductionVerificationEvidenceDirectAuthorityInput;

const fail = (code: string): never => {
  throw new TypeError(
    `G4_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_INVALID: ${code}`
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

const exactRecordWithOptional = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) =>
      !isUnsafeObjectKey(key) &&
      (required.includes(key) || optional.includes(key))
  );

const isAgentJsonValue = (value: unknown): value is AgentJsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isAgentJsonValue);
  return (
    isPlainObject(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    Object.entries(value).every(
      ([key, entry]) => !isUnsafeObjectKey(key) && isAgentJsonValue(entry)
    )
  );
};

const canonicalOrigin = (value: unknown): string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_048) {
    return fail('base-url');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail('base-url');
  }
  const localHttp =
    url.protocol === 'http:' &&
    (url.hostname === '127.0.0.1' || url.hostname === '[::1]');
  if (
    (url.protocol !== 'https:' && !localHttp) ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== '' ||
    value !== url.origin
  ) {
    return fail('base-url');
  }
  return url.origin;
};

const boundedTimeout = (
  value: number | undefined,
  fallback: number,
  maximum: number
): number => {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > maximum) {
    return fail('timeout');
  }
  return selected;
};

const canonicalSegment = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || !identityPattern.test(value)) {
    return fail(code);
  }
  return encodeURIComponent(value);
};

const sha256Bytes = (value: Uint8Array): CanonicalDigest =>
  `sha256-${createHash('sha256').update(value).digest('hex')}` as CanonicalDigest;

const withoutField = (
  value: Record<string, unknown>,
  field: string
): Readonly<Record<string, unknown>> =>
  Object.freeze(
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== field))
  );

const assertDirectResponseBase = (
  value: unknown,
  keys: readonly string[],
  operation: string,
  requestDigest: CanonicalDigest
): Record<string, unknown> => {
  if (
    !exactRecord(value, keys) ||
    value.format !== directResponseFormat ||
    value.version !== directVersion ||
    value.purpose !==
      PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE ||
    value.operation !== operation ||
    value.requestDigest !== requestDigest ||
    !isAgentCanonicalDigest(value.responseDigest) ||
    value.responseDigest !==
      digestAgentCanonicalValue(withoutField(value, 'responseDigest'))
  ) {
    return fail('response-binding');
  }
  return value;
};

const bridgeReceipt = <T extends Record<string, unknown>>(
  value: T
): Readonly<T & { receiptDigest: CanonicalDigest }> =>
  Object.freeze({
    ...value,
    receiptDigest: digestAgentCanonicalValue(value),
  });

const jsonReviver = (key: string, value: unknown): unknown => {
  if (key !== '' && isUnsafeObjectKey(key)) throw new TypeError('unsafe-key');
  return value;
};

const decodeCanonicalJson = (bytes: Uint8Array): unknown => {
  let text: string;
  let value: unknown;
  try {
    text = textDecoder.decode(bytes);
    value = JSON.parse(text, jsonReviver) as unknown;
    if (canonicalJsonText(value) !== text) return fail('response-canonical');
  } catch {
    return fail('response-json');
  }
  return value;
};

const readBoundedResponse = async (
  response: Response,
  maximumBytes: number
): Promise<Uint8Array> => {
  if (!response.body) return fail('response-body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        return fail('response-size');
      }
      chunks.push(result.value);
    }
  } catch {
    return fail('response-body');
  }
  if (total < 2) return fail('response-size');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const strictBase64 = (value: unknown, expectedSize: number): Uint8Array => {
  if (
    typeof value !== 'string' ||
    value.length >
      Math.ceil(
        (PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_MAXIMUM_ARTIFACT_BYTES *
          4) /
          3
      ) +
        4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value
    )
  ) {
    return fail('artifact-base64');
  }
  const bytes = Uint8Array.from(Buffer.from(value, 'base64'));
  if (
    bytes.byteLength !== expectedSize ||
    Buffer.from(bytes).toString('base64') !== value
  ) {
    bytes.fill(0);
    return fail('artifact-base64');
  }
  return bytes;
};

const frozenEvidenceIds = (value: unknown): readonly string[] => {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > maximumEvidenceIds ||
    value.some((entry) => !isAgentControlIdentity(entry)) ||
    new Set(value).size !== value.length
  ) {
    return fail('evidence-ids');
  }
  const sorted = Object.freeze(
    [...value].sort(compareUnicodeCodePoints) as string[]
  );
  if (!sameCanonicalJson(sorted, value)) return fail('evidence-id-order');
  return sorted;
};

const responseManifest = (value: unknown): VerificationEvidenceManifest => {
  if (!isPlainObject(value) || value.wireVersion !== directVersion) {
    return fail('manifest-wire-version');
  }
  const decoded = decodeVerificationEvidenceManifest(value);
  if (!decoded.ok) return fail('manifest');
  return decoded.value;
};

const responseView = (value: unknown): VerificationEvidenceVerifiedView => {
  if (!isPlainObject(value) || value.wireVersion !== directVersion) {
    return fail('verified-view-wire-version');
  }
  const decoded = decodeVerificationEvidenceVerifiedView(value);
  if (!decoded.ok) return fail('verified-view');
  return decoded.value;
};

const authorityFromRequest = (
  request: ProductionVerificationEvidenceLifecycleDispatchInput['request']
): AgentEvaluationVerificationEvidenceBridgeAuthority => {
  if (
    !isPlainObject(request.payload) ||
    !isPlainObject(request.payload.authority)
  ) {
    return fail('authority');
  }
  let authority: AgentEvaluationVerificationEvidenceBridgeAuthority;
  try {
    authority = createAgentEvaluationVerificationEvidenceBridgeAuthority(
      request.payload.authority as Parameters<
        typeof createAgentEvaluationVerificationEvidenceBridgeAuthority
      >[0]
    );
  } catch {
    return fail('authority');
  }
  if (!sameCanonicalJson(authority, request.payload.authority)) {
    return fail('authority');
  }
  return authority;
};

const retired = Object.freeze({
  status: 'clean' as const,
  residualResourceIds: Object.freeze([]) as readonly [],
  residualCanaryIds: Object.freeze([]) as readonly [],
});

export const createProductionAgentEvaluationVerificationEvidenceDirectAuthority =
  (
    input: CreateProductionVerificationEvidenceDirectAuthorityInput
  ): Readonly<{
    authority: ProductionVerificationEvidenceDirectAuthority;
    probe(): Promise<void>;
  }> => {
    const baseUrl = canonicalOrigin(input.baseUrl);
    const fetchImplementation = input.fetch ?? globalThis.fetch;
    if (
      typeof input.readToken !== 'function' ||
      typeof input.forbiddenCanaries !== 'function' ||
      typeof fetchImplementation !== 'function'
    ) {
      return fail('factory');
    }
    const readTimeoutMs = boundedTimeout(
      input.readTimeoutMs,
      PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_READ_TIMEOUT_MS,
      PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_READ_TIMEOUT_MS
    );
    const writeTimeoutMs = boundedTimeout(
      input.writeTimeoutMs,
      PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_WRITE_TIMEOUT_MS,
      PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_WRITE_TIMEOUT_MS
    );
    let closed = false;
    let closePromise: Promise<ProductionOwnerResourceRetirement> | undefined;

    const request = async (options: {
      method: 'GET' | 'POST' | 'PUT';
      path: string;
      timeoutMs: number;
      body?: string | Uint8Array;
      contentType?: string;
      headers?: Readonly<Record<string, string>>;
      maximumResponseBytes?: number;
    }): Promise<unknown> => {
      if (closed) return fail('closed');
      let token: string | undefined;
      try {
        token = input.readToken(
          PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_ENVIRONMENT_NAMES.token
        );
      } catch {
        return fail('credential-unavailable');
      }
      if (typeof token !== 'string' || !visibleAsciiTokenPattern.test(token)) {
        return fail('credential-unavailable');
      }
      const credential = token;
      const canaries = (): readonly string[] =>
        Object.freeze([...input.forbiddenCanaries(), credential]);
      const url = `${baseUrl}${PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_BASE_PATH}${options.path}`;
      if (options.body !== undefined) {
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          options.body,
          canaries
        );
      }
      const headers = new Headers({
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Prodivix-Verification-Authority-Purpose':
          PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
        ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
        ...(options.headers ?? {}),
      });
      token = undefined;
      let response: Response;
      try {
        const body: BodyInit | undefined =
          options.body === undefined
            ? undefined
            : typeof options.body === 'string'
              ? options.body
              : new Uint8Array(options.body).buffer;
        response = await fetchImplementation(url, {
          method: options.method,
          headers,
          ...(body === undefined ? {} : { body }),
          signal: AbortSignal.timeout(options.timeoutMs),
        });
      } catch {
        return fail('transport');
      }
      const maximumResponseBytes =
        options.maximumResponseBytes ??
        PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_MAXIMUM_RESPONSE_BYTES;
      const declaredLength = response.headers.get('content-length');
      if (
        response.status !== 200 ||
        response.headers.get('cache-control') !== 'no-store' ||
        response.headers.get('content-type') !== 'application/json' ||
        response.headers.get('content-encoding') !== null ||
        (declaredLength !== null &&
          (!/^\d+$/u.test(declaredLength) ||
            Number(declaredLength) > maximumResponseBytes))
      ) {
        return fail('http-response');
      }
      let bytes: Uint8Array;
      try {
        bytes = await readBoundedResponse(response, maximumResponseBytes);
      } catch {
        return fail('response-body');
      }
      assertProductionAgentEvaluationG3SandboxCanaryClean(bytes, canaries);
      return decodeCanonicalJson(bytes);
    };

    const jsonRequest = async (
      path: string,
      value: Readonly<Record<string, unknown>>,
      timeoutMs: number,
      idempotencyKey?: string
    ): Promise<unknown> => {
      const body = canonicalJsonText(value);
      if (
        textEncoder.encode(body).byteLength >
        PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_MAXIMUM_JSON_REQUEST_BYTES
      ) {
        return fail('request-size');
      }
      return request({
        method: 'POST',
        path,
        timeoutMs,
        body,
        contentType: 'application/json',
        ...(idempotencyKey
          ? { headers: { 'Idempotency-Key': idempotencyKey } }
          : {}),
      });
    };

    const create = async (
      dispatch: ProductionVerificationEvidenceLifecycleDispatchInput
    ): Promise<AgentEvaluationVerificationEvidencePromotionReceipt> => {
      const payload = dispatch.request.payload;
      if (!isPlainObject(payload)) return fail('create-payload');
      const decodedCandidate = decodeVerificationEvidenceCandidate(
        payload.candidate
      );
      if (
        decodedCandidate.status !== 'ready' ||
        typeof payload.idempotencyKey !== 'string' ||
        decodedCandidate.candidate.workspaceId !==
          dispatch.authority.workspaceId
      ) {
        return fail('create-payload');
      }
      const base = Object.freeze({
        format: directRequestFormat,
        version: directVersion,
        purpose: PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
        operation: 'promotion.create' as const,
        workspaceId: dispatch.authority.workspaceId,
        idempotencyKey: payload.idempotencyKey,
        candidate: decodedCandidate.candidate,
      });
      const requestDigest = digestAgentCanonicalValue(base);
      const direct = assertDirectResponseBase(
        await jsonRequest(
          `/workspaces/${canonicalSegment(dispatch.authority.workspaceId, 'workspace-id')}/promotions`,
          Object.freeze({ ...base, requestDigest }),
          writeTimeoutMs,
          payload.idempotencyKey
        ),
        [
          'format',
          'version',
          'purpose',
          'operation',
          'requestDigest',
          'promotionId',
          'evidenceId',
          'uploadCapability',
          'responseDigest',
        ],
        base.operation,
        requestDigest
      );
      if (
        !isAgentControlIdentity(direct.promotionId) ||
        !isAgentControlIdentity(direct.evidenceId) ||
        typeof direct.uploadCapability !== 'string' ||
        direct.uploadCapability.length < 32 ||
        direct.uploadCapability.length > 512
      ) {
        return fail('create-response');
      }
      return bridgeReceipt({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'promotion-created' as const,
        requestDigest: dispatch.request.requestDigest,
        promotionId: direct.promotionId,
        evidenceId: direct.evidenceId,
        uploadCapability: direct.uploadCapability,
      });
    };

    const upload = async (
      dispatch: ProductionVerificationEvidenceLifecycleDispatchInput
    ): Promise<AgentEvaluationVerificationEvidenceArtifactUploadReceipt> => {
      const payload = dispatch.request.payload;
      if (!isPlainObject(payload) || !isPlainObject(payload.artifact)) {
        return fail('upload-payload');
      }
      const artifact = payload.artifact;
      if (
        !isAgentControlIdentity(payload.promotionId) ||
        typeof payload.uploadCapability !== 'string' ||
        !visibleAsciiCapabilityPattern.test(payload.uploadCapability) ||
        !isAgentControlIdentity(artifact.id) ||
        !isAgentCanonicalDigest(artifact.digest) ||
        !Number.isSafeInteger(artifact.size) ||
        Number(artifact.size) < 0 ||
        Number(artifact.size) >
          PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_MAXIMUM_ARTIFACT_BYTES ||
        typeof artifact.mediaType !== 'string' ||
        !parameterFreeMediaTypePattern.test(artifact.mediaType)
      ) {
        return fail('upload-payload');
      }
      const artifactSize = Number(artifact.size);
      const bytes = strictBase64(artifact.bytesBase64, artifactSize);
      if (sha256Bytes(bytes) !== artifact.digest) {
        bytes.fill(0);
        return fail('artifact-digest');
      }
      const projection = Object.freeze({
        format: directRequestFormat,
        version: directVersion,
        purpose: PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
        operation: 'artifact.upload' as const,
        workspaceId: dispatch.authority.workspaceId,
        promotionId: payload.promotionId,
        artifactId: artifact.id,
        uploadCapabilityDigest: sha256Bytes(
          textEncoder.encode(payload.uploadCapability)
        ),
        artifactDigest: artifact.digest,
        artifactSize,
        mediaType: artifact.mediaType,
      });
      const requestDigest = digestAgentCanonicalValue(projection);
      let response: unknown;
      try {
        response = await request({
          method: 'PUT',
          path: `/workspaces/${canonicalSegment(dispatch.authority.workspaceId, 'workspace-id')}/promotions/${canonicalSegment(payload.promotionId, 'promotion-id')}/artifacts/${canonicalSegment(artifact.id, 'artifact-id')}`,
          timeoutMs: writeTimeoutMs,
          body: bytes,
          contentType: artifact.mediaType,
          headers: {
            'Content-Length': String(artifactSize),
            'Idempotency-Key': requestDigest,
            'X-Prodivix-Verification-Request-Digest': requestDigest,
            'X-Prodivix-Verification-Capability': payload.uploadCapability,
            'X-Prodivix-Verification-Artifact-Digest': artifact.digest,
            'X-Prodivix-Verification-Artifact-Size': String(artifactSize),
          },
        });
      } finally {
        bytes.fill(0);
      }
      const direct = assertDirectResponseBase(
        response,
        [
          'format',
          'version',
          'purpose',
          'operation',
          'requestDigest',
          'promotionId',
          'artifact',
          'responseDigest',
        ],
        projection.operation,
        requestDigest
      );
      if (
        direct.promotionId !== payload.promotionId ||
        !exactRecordWithOptional(
          direct.artifact,
          ['id', 'path', 'kind', 'digest', 'size', 'mediaType', 'availability'],
          ['normalizedDigest', 'sourceTraceDigest']
        ) ||
        direct.artifact.id !== artifact.id ||
        typeof direct.artifact.path !== 'string' ||
        typeof direct.artifact.kind !== 'string' ||
        direct.artifact.digest !== artifact.digest ||
        (direct.artifact.normalizedDigest !== undefined &&
          !isAgentCanonicalDigest(direct.artifact.normalizedDigest)) ||
        (direct.artifact.sourceTraceDigest !== undefined &&
          !isAgentCanonicalDigest(direct.artifact.sourceTraceDigest)) ||
        direct.artifact.size !== artifactSize ||
        direct.artifact.mediaType !== artifact.mediaType ||
        direct.artifact.availability !== 'available'
      ) {
        return fail('upload-response');
      }
      return bridgeReceipt({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'artifact-uploaded' as const,
        requestDigest: dispatch.request.requestDigest,
        promotionId: payload.promotionId,
        artifactId: artifact.id,
        artifactDigest: artifact.digest,
        artifactSize,
        mediaType: artifact.mediaType,
      });
    };

    const transition = async (
      dispatch: ProductionVerificationEvidenceLifecycleDispatchInput,
      operation: 'promotion.prepare' | 'promotion.final-commit'
    ): Promise<
      | AgentEvaluationVerificationEvidencePreparationReceipt
      | AgentEvaluationVerificationEvidenceFinalizationReceipt
    > => {
      const payload = dispatch.request.payload;
      if (
        !isPlainObject(payload) ||
        !isAgentControlIdentity(payload.promotionId) ||
        typeof payload.uploadCapability !== 'string' ||
        !visibleAsciiCapabilityPattern.test(payload.uploadCapability) ||
        (operation === 'promotion.prepare' &&
          Object.hasOwn(payload, 'attestation')) ||
        (operation === 'promotion.final-commit' &&
          !isPlainObject(payload.attestation))
      ) {
        return fail('transition-payload');
      }
      const base = Object.freeze({
        format: directRequestFormat,
        version: directVersion,
        purpose: PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
        operation,
        workspaceId: dispatch.authority.workspaceId,
        promotionId: payload.promotionId,
        uploadCapability: payload.uploadCapability,
        attestation:
          operation === 'promotion.prepare' ? null : payload.attestation,
      });
      const requestDigest = digestAgentCanonicalValue(base);
      const direct = await jsonRequest(
        `/workspaces/${canonicalSegment(dispatch.authority.workspaceId, 'workspace-id')}/promotions/${canonicalSegment(payload.promotionId, 'promotion-id')}/${operation === 'promotion.prepare' ? 'prepare' : 'final-commit'}`,
        Object.freeze({ ...base, requestDigest }),
        writeTimeoutMs,
        requestDigest
      );
      if (operation === 'promotion.prepare') {
        const prepared = assertDirectResponseBase(
          direct,
          [
            'format',
            'version',
            'purpose',
            'operation',
            'requestDigest',
            'promotionId',
            'evidenceId',
            'attestationNonce',
            'attestationStatement',
            'attestationStatementDigest',
            'responseDigest',
          ],
          operation,
          requestDigest
        );
        if (
          prepared.promotionId !== payload.promotionId ||
          !isAgentControlIdentity(prepared.evidenceId) ||
          typeof prepared.attestationNonce !== 'string' ||
          prepared.attestationNonce.length < 16 ||
          prepared.attestationNonce.length > 4_096 ||
          !isAgentJsonValue(prepared.attestationStatement) ||
          !isAgentCanonicalDigest(prepared.attestationStatementDigest) ||
          !statementDigestMatches(
            prepared.attestationStatement,
            prepared.attestationStatementDigest
          )
        ) {
          return fail('prepare-response');
        }
        return bridgeReceipt({
          format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
          version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
          kind: 'promotion-prepared' as const,
          requestDigest: dispatch.request.requestDigest,
          promotionId: payload.promotionId,
          evidenceId: prepared.evidenceId,
          attestationNonce: prepared.attestationNonce,
          attestationStatement: prepared.attestationStatement,
          attestationStatementDigest: prepared.attestationStatementDigest,
        });
      }
      const committed = assertDirectResponseBase(
        direct,
        [
          'format',
          'version',
          'purpose',
          'operation',
          'requestDigest',
          'promotionId',
          'evidenceId',
          'manifest',
          'responseDigest',
        ],
        operation,
        requestDigest
      );
      const manifest = responseManifest(committed.manifest);
      if (
        committed.promotionId !== payload.promotionId ||
        committed.evidenceId !== manifest.evidence.id
      ) {
        return fail('final-commit-response');
      }
      return bridgeReceipt({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'promotion-finalized' as const,
        requestDigest: dispatch.request.requestDigest,
        promotionId: payload.promotionId,
        evidenceId: manifest.evidence.id,
        manifest: encodeVerificationEvidenceManifest(manifest),
      });
    };

    const dispatch = (
      input: ProductionVerificationEvidenceLifecycleDispatchInput
    ): Promise<unknown> => {
      switch (input.request.operation) {
        case 'promotion.create':
          return create(input);
        case 'artifact.upload':
          return upload(input);
        case 'promotion.prepare':
          return transition(input, 'promotion.prepare');
        case 'promotion.final-commit':
          return transition(input, 'promotion.final-commit');
        default:
          return Promise.reject(
            new TypeError(
              'G4_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_INVALID: operation'
            )
          );
      }
    };

    const resolve = async (
      input: ProductionAgentEvaluationVerifiedViewAuthorityInput
    ): Promise<AgentEvaluationVerificationEvidenceVerifiedViewReceipt> => {
      const evidenceIds = frozenEvidenceIds(input.evidenceIds);
      const base = Object.freeze({
        format: directRequestFormat,
        version: directVersion,
        purpose: PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE,
        operation: 'verified-view.resolve' as const,
        workspaceId: input.authority.workspaceId,
        evidenceIds,
      });
      const requestDigest = digestAgentCanonicalValue(base);
      const direct = assertDirectResponseBase(
        await jsonRequest(
          `/workspaces/${canonicalSegment(input.authority.workspaceId, 'workspace-id')}/verified-view/resolve`,
          Object.freeze({ ...base, requestDigest }),
          readTimeoutMs
        ),
        [
          'format',
          'version',
          'purpose',
          'operation',
          'requestDigest',
          'evidenceIds',
          'view',
          'manifests',
          'responseDigest',
        ],
        base.operation,
        requestDigest
      );
      if (
        !sameCanonicalJson(direct.evidenceIds, evidenceIds) ||
        !Array.isArray(direct.manifests) ||
        direct.manifests.length !== evidenceIds.length
      ) {
        return fail('verified-view-response');
      }
      const view = responseView(direct.view);
      const manifests = direct.manifests.map(responseManifest);
      if (
        view.records.length !== evidenceIds.length ||
        evidenceIds.some((evidenceId, index) => {
          const manifest = manifests[index]!;
          const record = view.records[index]!;
          const materialized = Object.freeze({
            ...manifest.evidence,
            manifestDigest: manifest.manifestDigest,
          });
          return (
            manifest.evidence.id !== evidenceId ||
            record.evidenceId !== evidenceId ||
            manifest.manifestDigest !== record.manifestDigest ||
            digestVerificationValue(materialized) !==
              record.materializedEvidenceDigest
          );
        })
      ) {
        return fail('verified-view-manifest-binding');
      }
      const revokedEvidenceIds = Object.freeze(
        view.records
          .filter(({ trustStatus }) => trustStatus === 'revoked')
          .map(({ evidenceId }) => evidenceId)
      );
      return bridgeReceipt({
        format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
        version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
        kind: 'verified-view-resolved' as const,
        requestDigest: input.request.requestDigest,
        verifiedEvidenceView: encodeVerificationEvidenceVerifiedView(view),
        revokedEvidenceIds,
      });
    };

    const authority: ProductionVerificationEvidenceDirectAuthority =
      Object.freeze({
        dispatch,
        reconstruct({
          request,
          transition,
          snapshot,
        }: Parameters<
          ProductionVerificationEvidenceLifecycleAuthority['reconstruct']
        >[0]) {
          if (
            (request.operation !== 'promotion.create' &&
              request.operation !== 'promotion.prepare') ||
            transition.requestDigest !== request.requestDigest ||
            transition.ownerStateBundle.snapshotDigest !==
              snapshot.snapshotDigest ||
            (request.operation === 'promotion.create' &&
              snapshot.state !== 'active') ||
            (request.operation === 'promotion.prepare' &&
              snapshot.state !== 'prepared')
          ) {
            return Promise.reject(
              new TypeError(
                'G4_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_INVALID: reconstruction-binding'
              )
            );
          }
          return dispatch({
            request,
            authority: authorityFromRequest(request),
            previousSnapshot:
              request.operation === 'promotion.create' ? null : snapshot,
          });
        },
        resolve,
        resolveDirect: resolve,
        close() {
          closePromise ??= Promise.resolve().then(() => {
            closed = true;
            return retired;
          });
          return closePromise;
        },
      });

    const probe = async (): Promise<void> => {
      const response = await request({
        method: 'GET',
        path: '/health',
        timeoutMs: readTimeoutMs,
        maximumResponseBytes: 4_096,
      });
      if (
        !exactRecord(response, [
          'format',
          'version',
          'purpose',
          'implementationDigest',
        ]) ||
        response.format !== directHealthFormat ||
        response.version !== directVersion ||
        response.purpose !==
          PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_PURPOSE ||
        response.implementationDigest !==
          PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST
      ) {
        return fail('health');
      }
    };

    return Object.freeze({ authority, probe });
  };

const environmentReader = (
  environment: Environment
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function'
    ? environment
    : (name: string): string | undefined => environment[name];

export const createEnvironmentAgentEvaluationVerificationEvidenceDirectAuthority =
  async (
    input: CreateEnvironmentProductionVerificationEvidenceDirectAuthorityInput
  ): Promise<ProductionVerificationEvidenceDirectAuthority> => {
    const read = environmentReader(input.environment ?? process.env);
    const direct =
      createProductionAgentEvaluationVerificationEvidenceDirectAuthority({
        baseUrl:
          read(
            PRODUCTION_VERIFICATION_EVIDENCE_DIRECT_AUTHORITY_ENVIRONMENT_NAMES.baseUrl
          ) ?? fail('base-url-unavailable'),
        readToken: read,
        forbiddenCanaries: input.forbiddenCanaries,
        ...(input.fetch ? { fetch: input.fetch } : {}),
        ...(input.readTimeoutMs ? { readTimeoutMs: input.readTimeoutMs } : {}),
        ...(input.writeTimeoutMs
          ? { writeTimeoutMs: input.writeTimeoutMs }
          : {}),
      });
    try {
      await direct.probe();
    } catch (caught) {
      try {
        await direct.authority.close();
      } catch (cleanup) {
        throw new AggregateError(
          [caught, cleanup],
          'Verification Evidence authority probe and retirement both failed.'
        );
      }
      throw caught;
    }
    return direct.authority;
  };

/**
 * Composes durable 8790 owner-state reads with the independent Backend
 * Verification authority. The mutable current view always comes from the
 * purpose-bound Verification repository and never from the sidecar journal.
 */
export const createEnvironmentAgentEvaluationVerificationEvidenceOwnerEngine =
  async (
    input: CreateEnvironmentProductionVerificationEvidenceOwnerEngineInput
  ): Promise<ProductionVerificationEvidenceOwnerEngine> => {
    const environment = input.environment ?? process.env;
    const direct =
      await createEnvironmentAgentEvaluationVerificationEvidenceDirectAuthority(
        input
      );
    const readAuthority =
      createProductionAgentEvaluationVerificationEvidenceOwnerReadAuthority({
        forbiddenCanaries: input.forbiddenCanaries,
        verifiedViewAuthority: direct,
        ownerStateQueryFor(request) {
          if (
            !isAgentControlIdentity(request.namespaceId) ||
            !isAgentCanonicalDigest(request.planDigest) ||
            !/^[a-f0-9]{40}$/u.test(request.repositoryCommit)
          ) {
            return fail('owner-state-scope');
          }
          return createEnvironmentAgentEvaluationOwnerStateQueryClient({
            namespaceId: request.namespaceId,
            planDigest: request.planDigest,
            repositoryCommit: request.repositoryCommit,
            forbiddenCanaries: input.forbiddenCanaries,
            environment,
            ...(input.fetch ? { fetch: input.fetch } : {}),
          });
        },
      });
    return createProductionAgentEvaluationVerificationEvidenceLifecycleEngine({
      readAuthority,
      lifecycleAuthority: direct,
    });
  };
