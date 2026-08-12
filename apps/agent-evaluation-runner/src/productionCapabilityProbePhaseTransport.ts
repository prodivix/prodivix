import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes as nodeRandomBytes,
} from 'node:crypto';
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, parse, relative, resolve } from 'node:path';

import {
  createAgentCapabilityProbeProviderExecutionEvidence,
  createAgentCapabilityProbeProviderRequestMaterial,
  createAgentCapabilityProbeProviderRequestPolicy,
  createAgentCapabilityProbeResponseSpoolAad,
  decodeAgentCapabilityProbeProviderPhaseResponse,
  decryptAgentCapabilityProbeResponseSpoolPlaintext,
  digestAgentCanonicalValue,
  digestAgentCapabilityProbeResponseSpoolAad,
  encryptAgentCapabilityProbeResponseSpoolPlaintext,
  isAgentCapabilityProbeProviderPhaseObservation,
  isAgentCapabilityProbeProviderRequestPolicy,
  isAgentCapabilityProbeProviderRequestProjection,
  isAgentCapabilityProbeResponseSpoolEncryptionProfile,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  matchAgentCapabilityProbeProviderRequestPolicy,
  matchAgentCapabilityProbeResponseSpoolAadBinding,
  resolveAgentCapabilityProbeNetworkRoundTripPhase,
  type AgentCapabilityProbeProviderPhaseObservation,
  type AgentCapabilityProbeProviderPhaseRecord,
  type AgentCapabilityProbeProviderRequestPolicy,
  type AgentCapabilityProbeProviderRequestProjection,
  type AgentCapabilityProbeResponseSpoolAad,
  type AgentCapabilityProbeResponseSpoolEncryptionProfile,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  decodeCanonicalBase64,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  decodeAgentEvaluationCapabilityProbeAdmissionRequest,
  type AgentEvaluationCapabilityProbeAdmissionRequest,
} from './capabilityProbeAdmissionClient';
import {
  AGENT_EVALUATION_PROVIDER_DEFINITIONS,
  type AgentEvaluationNativeProtocol,
} from './config';
import {
  agentEvaluationEgressBoundFetch,
  type AgentEvaluationEgressBoundFetch,
} from './egressBoundFetch';
import {
  authorizeAgentEvaluationCapabilityProbeEgress,
  type AgentEvaluationHostResolver,
} from './egress';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
} from './errors';
import type {
  AgentEvaluationCapabilityProbePhaseExecution,
  AgentEvaluationCapabilityProbePhaseTransport,
} from './productionCapabilityProbeExecutor';
import { AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME } from './capabilityProbeResponseSpoolKey';
import {
  createCredentialCanarySignatures,
  EnvironmentAgentProviderSecretResolver,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
  type AgentProviderSecretResolver,
} from './secretResolver';

export const PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PHASE_TRANSPORT_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-production-capability-probe-phase-transport-implementation',
    version: 1,
    requestAuthority: 'canonical-provider-probe-policy-and-material',
    responseAuthority: 'durable-aes-gcm-phase-record',
    replayAuthority: 'completed-record-before-claim-zero-dispatch',
  });

const claimFormat =
  'prodivix.agent-evaluation-capability-probe-phase-dispatch-claim' as const;
const recordFormat =
  'prodivix.agent-evaluation-capability-probe-phase-durable-record' as const;
const plaintextFormat =
  'prodivix.agent-evaluation-capability-probe-phase-sealed-plaintext' as const;
const requestLeafFormat =
  'prodivix.agent-evaluation-capability-probe-provider-request-leaf' as const;
const responseLeafFormat =
  'prodivix.agent-evaluation-capability-probe-provider-response-leaf' as const;
const dispatchIntentFormat =
  'prodivix.agent-evaluation-capability-probe-provider-dispatch-intent' as const;
const transportReceiptFormat =
  'prodivix.agent-evaluation-capability-probe-provider-transport-receipt' as const;
const version = 1 as const;
const maximumStateFileBytes = 2 * 1_024 * 1_024;
const maximumSseEvents = 10_000;
const maximumCanaries = 256;
const maximumCanaryBytes = 4_096;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type ProbePhase =
  AgentEvaluationCapabilityProbeAdmissionRequest['probeProgram']['providerRequestIntent']['requestPhases'][number];
type TransportOutcome = 'failed' | 'received' | 'timed-out';

type PhaseDispatchClaim = Readonly<{
  format: typeof claimFormat;
  version: typeof version;
  admissionRequestDigest: CanonicalDigest;
  phase: ProbePhase;
  sequence: number;
  policy: AgentCapabilityProbeProviderRequestPolicy;
  requestProjection: AgentCapabilityProbeProviderRequestProjection;
  requestDigest: CanonicalDigest;
  requestBytes: number;
  dispatchIntentDigest: CanonicalDigest;
  dispatchedAt: Instant;
  claimDigest: CanonicalDigest;
}>;

type SealedPhasePlaintext = Readonly<{
  format: typeof plaintextFormat;
  version: typeof version;
  admissionRequestDigest: CanonicalDigest;
  phase: ProbePhase;
  sequence: number;
  transportOutcome: TransportOutcome;
  httpStatus: number | null;
  responseMediaType: string | null;
  rawResponseBase64: string | null;
  rawResponseByteLength: number;
  rawResponseDigest: CanonicalDigest | null;
  callbackLocalProviderStateHandle: string | null;
  observation: AgentCapabilityProbeProviderPhaseObservation;
  plaintextDigest: CanonicalDigest;
}>;

type DurablePhaseRecord = Readonly<{
  format: typeof recordFormat;
  version: typeof version;
  admissionRequestDigest: CanonicalDigest;
  policy: AgentCapabilityProbeProviderRequestPolicy;
  requestProjection: AgentCapabilityProbeProviderRequestProjection;
  aad: AgentCapabilityProbeResponseSpoolAad;
  execution: AgentEvaluationCapabilityProbePhaseExecution;
  sealedPlaintextDigest: CanonicalDigest;
  recordDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityProbeSpoolKeyAuthority = Readonly<{
  keyRefDigest: CanonicalDigest;
  encryptionProfileDigest: CanonicalDigest;
}>;

export interface AgentEvaluationCapabilityProbeSpoolKeyResolver {
  readonly authority: AgentEvaluationCapabilityProbeSpoolKeyAuthority;
  use<T>(
    input: Readonly<{
      useId: string;
      purpose: 'decrypt' | 'encrypt';
    }>,
    callback: (key: Uint8Array) => Promise<T>
  ): Promise<T>;
}

export type CreateProductionAgentEvaluationCapabilityProbePhaseTransportInput =
  Readonly<{
    stateDirectory: string;
    encryptionProfile: AgentCapabilityProbeResponseSpoolEncryptionProfile;
    forbiddenCanaries: () => readonly string[];
    environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
    secrets?: AgentProviderSecretResolver;
    keys?: AgentEvaluationCapabilityProbeSpoolKeyResolver;
    fetch?: AgentEvaluationEgressBoundFetch;
    resolveHost?: AgentEvaluationHostResolver;
    clock?: () => Instant;
    randomBytes?: (size: number) => Uint8Array;
    allowTemporaryStateDirectory?: boolean;
    runnerTemporaryDirectory?: string;
  }>;

const fail = (code: string): never => {
  throw new TypeError(`G4_CAPABILITY_PROBE_PHASE_TRANSPORT_INVALID: ${code}`);
};

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every((key) => !isUnsafeObjectKey(key));

const digestWithout = (
  value: Readonly<Record<string, unknown>>,
  key: string
): CanonicalDigest =>
  digestAgentCanonicalValue(
    Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))
  );

const digestBytes = (value: Uint8Array): CanonicalDigest =>
  `sha256-${createHash('sha256').update(value).digest('hex')}` as CanonicalDigest;

const canonicalInstant = (value: string): Instant => {
  if (!isAgentControlInstant(value)) return fail('instant');
  return value;
};

const currentInstant = (): Instant => new Date().toISOString() as Instant;

const within = (parent: string, child: string): boolean => {
  const candidate = relative(resolve(parent), resolve(child));
  return (
    candidate === '' || (!candidate.startsWith('..') && !isAbsolute(candidate))
  );
};

const initializeStateDirectory = async (
  source: string,
  allowTemporary: boolean,
  runnerTemporaryDirectory?: string
): Promise<string> => {
  if (!isAbsolute(source)) return fail('state-directory-absolute');
  const target = resolve(source);
  if (target === parse(target).root) return fail('state-directory-root');
  if (
    !allowTemporary &&
    (within(tmpdir(), target) ||
      (runnerTemporaryDirectory !== undefined &&
        isAbsolute(runnerTemporaryDirectory) &&
        within(runnerTemporaryDirectory, target)))
  ) {
    return fail('state-directory-durable');
  }
  await mkdir(target, { recursive: true, mode: 0o700 });
  const metadata = await lstat(target);
  const concrete = await realpath(target);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    concrete !== target
  ) {
    return fail('state-directory-physical');
  }
  return target;
};

const normalizeCanaries = (source: readonly string[]): readonly string[] => {
  if (
    !Array.isArray(source) ||
    source.length > maximumCanaries ||
    source.some(
      (value) =>
        typeof value !== 'string' ||
        value.length < 8 ||
        textEncoder.encode(value).byteLength > maximumCanaryBytes
    )
  ) {
    return fail('canaries');
  }
  return Object.freeze([...new Set(source)].sort(compareUnicodeCodePoints));
};

const canaryClean = (value: unknown, canaries: readonly string[]): boolean => {
  const text = typeof value === 'string' ? value : canonicalJsonText(value);
  return canaries.every((canary) => !text.includes(canary));
};

const canonicalBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64');

const decodeBoundedBase64 = (
  value: string,
  maximumBytes: number,
  label: string
): Uint8Array =>
  decodeCanonicalBase64(value, {
    maximumBytes,
    label,
  });

const keyBytesContain = (value: unknown, key: Uint8Array): boolean => {
  if (!(value instanceof Uint8Array) || value.byteLength < key.byteLength) {
    return false;
  }
  for (
    let offset = 0;
    offset <= value.byteLength - key.byteLength;
    offset += 1
  ) {
    let same = true;
    for (let index = 0; index < key.byteLength; index += 1) {
      if (value[offset + index] !== key[index]) {
        same = false;
        break;
      }
    }
    if (same) return true;
  }
  return false;
};

export class EnvironmentAgentEvaluationCapabilityProbeSpoolKeyResolver implements AgentEvaluationCapabilityProbeSpoolKeyResolver {
  readonly authority: AgentEvaluationCapabilityProbeSpoolKeyAuthority;
  readonly #readEnvironment: AgentEvaluationEnvironmentReader;

  constructor(
    input: Readonly<{
      profile: AgentCapabilityProbeResponseSpoolEncryptionProfile;
      environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
    }>
  ) {
    if (
      !isAgentCapabilityProbeResponseSpoolEncryptionProfile(input.profile) ||
      input.profile.keyEnvironmentName !==
        AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    const environment = input.environment ?? process.env;
    this.#readEnvironment =
      typeof environment === 'function'
        ? environment
        : (name) => environment[name];
    this.authority = Object.freeze({
      keyRefDigest: input.profile.keyRefDigest,
      encryptionProfileDigest: input.profile.encryptionProfileDigest,
    });
  }

  async use<T>(
    input: Readonly<{ useId: string; purpose: 'decrypt' | 'encrypt' }>,
    callback: (key: Uint8Array) => Promise<T>
  ): Promise<T> {
    if (
      !isAgentControlIdentity(input.useId) ||
      !['decrypt', 'encrypt'].includes(input.purpose) ||
      typeof callback !== 'function'
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
      );
    }
    let source = this.#readEnvironment(
      AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME
    );
    let key: Uint8Array | undefined;
    try {
      if (typeof source !== 'string') {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
        );
      }
      key = decodeBoundedBase64(source, 32, 'Capability probe spool key');
      if (key.byteLength !== 32) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
        );
      }
      const result = await callback(key);
      if (keyBytesContain(result, key)) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
        );
      }
      return result;
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
      );
    } finally {
      source = '';
      key?.fill(0);
    }
  }
}

class DurablePhaseStore {
  readonly #stateDirectory: string;
  readonly #forbiddenCanaries: () => readonly string[];
  readonly #touched = new Set<CanonicalDigest>();

  constructor(
    stateDirectory: string,
    forbiddenCanaries: () => readonly string[]
  ) {
    this.#stateDirectory = stateDirectory;
    this.#forbiddenCanaries = forbiddenCanaries;
  }

  #directory(requestDigest: CanonicalDigest): string {
    const target = join(this.#stateDirectory, requestDigest);
    if (!within(this.#stateDirectory, target)) return fail('state-path');
    return target;
  }

  #recordPath(requestDigest: CanonicalDigest, sequence: number): string {
    return join(this.#directory(requestDigest), `phase-${sequence}.json`);
  }

  #claimPath(requestDigest: CanonicalDigest, sequence: number): string {
    return join(this.#directory(requestDigest), `phase-${sequence}.claim.json`);
  }

  async #read(path: string): Promise<unknown | null> {
    let metadata: Awaited<ReturnType<typeof stat>>;
    try {
      const physical = await lstat(path);
      if (!physical.isFile() || physical.isSymbolicLink()) {
        return fail('state-file-physical');
      }
      metadata = await stat(path);
    } catch (caught) {
      if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw caught;
    }
    if (metadata.size < 2 || metadata.size > maximumStateFileBytes) {
      return fail('state-file-size');
    }
    const source = await readFile(path, 'utf8');
    let value: unknown;
    try {
      value = JSON.parse(source) as unknown;
    } catch {
      return fail('state-file-json');
    }
    if (canonicalJsonText(value) !== source)
      return fail('state-file-canonical');
    return value;
  }

  async readRecord(
    requestDigest: CanonicalDigest,
    sequence: number
  ): Promise<unknown | null> {
    this.#touched.add(requestDigest);
    return this.#read(this.#recordPath(requestDigest, sequence));
  }

  async claim(value: PhaseDispatchClaim): Promise<boolean> {
    this.#touched.add(value.admissionRequestDigest);
    const directory = this.#directory(value.admissionRequestDigest);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const physical = await lstat(directory);
    const concrete = await realpath(directory);
    if (
      !physical.isDirectory() ||
      physical.isSymbolicLink() ||
      concrete !== directory
    ) {
      return fail('request-state-directory');
    }
    const canaries = normalizeCanaries(this.#forbiddenCanaries());
    if (!canaryClean(value, canaries)) return fail('claim-canary');
    const bytes = canonicalJsonText(value);
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(
        this.#claimPath(value.admissionRequestDigest, value.sequence),
        'wx',
        0o600
      );
      await file.writeFile(bytes, 'utf8');
      await file.sync();
      return true;
    } catch (caught) {
      if ((caught as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw caught;
    } finally {
      await file?.close();
    }
  }

  async persist(value: DurablePhaseRecord): Promise<void> {
    const canaries = normalizeCanaries(this.#forbiddenCanaries());
    if (!canaryClean(value, canaries)) return fail('record-canary');
    const bytes = canonicalJsonText(value);
    if (textEncoder.encode(bytes).byteLength > maximumStateFileBytes) {
      return fail('record-size');
    }
    const target = this.#recordPath(
      value.admissionRequestDigest,
      value.execution.sequence
    );
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(target, 'wx', 0o600);
      await file.writeFile(bytes, 'utf8');
      await file.sync();
    } catch (caught) {
      if ((caught as NodeJS.ErrnoException).code !== 'EEXIST') throw caught;
      const current = await this.#read(target);
      if (!sameCanonicalJson(current, value)) return fail('record-replay');
    } finally {
      await file?.close();
    }
  }

  async releaseClaim(
    requestDigest: CanonicalDigest,
    sequence: number
  ): Promise<void> {
    await rm(this.#claimPath(requestDigest, sequence), { force: true });
  }

  async close(): Promise<void> {
    for (const requestDigest of this.#touched) {
      const target = this.#directory(requestDigest);
      if (!within(this.#stateDirectory, target)) return fail('close-path');
      try {
        const metadata = await lstat(target);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
          return fail('close-state-directory');
        }
        const concrete = await realpath(target);
        if (concrete !== target) return fail('close-state-realpath');
      } catch (caught) {
        if ((caught as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw caught;
      }
      await rm(target, { recursive: true, force: true });
    }
    const residuals = (await readdir(this.#stateDirectory)).filter((name) =>
      this.#touched.has(name as CanonicalDigest)
    );
    if (residuals.length > 0) return fail('close-residual');
    this.#touched.clear();
  }
}

const requestLeaf = (input: {
  request: AgentEvaluationCapabilityProbeAdmissionRequest;
  policy: AgentCapabilityProbeProviderRequestPolicy;
  projection: AgentCapabilityProbeProviderRequestProjection;
  requestBytes: number;
}) =>
  Object.freeze({
    format: requestLeafFormat,
    version,
    admissionRequestDigest: input.request.requestDigest,
    phase: input.policy.phase,
    sequence: input.policy.sequence,
    policyDigest: input.policy.policyDigest,
    requestProjectionDigest: input.projection.projectionDigest,
    requestBodyDigest: input.projection.bodyDigest,
    requestBytes: input.requestBytes,
  });

const createClaim = (input: {
  request: AgentEvaluationCapabilityProbeAdmissionRequest;
  policy: AgentCapabilityProbeProviderRequestPolicy;
  projection: AgentCapabilityProbeProviderRequestProjection;
  requestDigest: CanonicalDigest;
  requestBytes: number;
  dispatchedAt: Instant;
}): PhaseDispatchClaim => {
  const dispatchBase = Object.freeze({
    format: dispatchIntentFormat,
    version,
    admissionRequestDigest: input.request.requestDigest,
    phase: input.policy.phase,
    sequence: input.policy.sequence,
    requestDigest: input.requestDigest,
    policyDigest: input.policy.policyDigest,
    requestProjectionDigest: input.projection.projectionDigest,
    dispatchedAt: input.dispatchedAt,
  });
  const base = Object.freeze({
    format: claimFormat,
    version,
    admissionRequestDigest: input.request.requestDigest,
    phase: input.policy.phase,
    sequence: input.policy.sequence,
    policy: input.policy,
    requestProjection: input.projection,
    requestDigest: input.requestDigest,
    requestBytes: input.requestBytes,
    dispatchIntentDigest: digestAgentCanonicalValue(dispatchBase),
    dispatchedAt: input.dispatchedAt,
  });
  return Object.freeze({
    ...base,
    claimDigest: digestAgentCanonicalValue(base),
  });
};

const responseLeaf = (input: {
  request: AgentEvaluationCapabilityProbeAdmissionRequest;
  claim: PhaseDispatchClaim;
  transportOutcome: TransportOutcome;
  httpStatus: number | null;
  responseMediaType: string | null;
  rawResponseDigest: CanonicalDigest | null;
  rawResponseByteLength: number;
  completedAt: Instant;
}) =>
  Object.freeze({
    format: responseLeafFormat,
    version,
    admissionRequestDigest: input.request.requestDigest,
    phase: input.claim.phase,
    sequence: input.claim.sequence,
    requestDigest: input.claim.requestDigest,
    transportOutcome: input.transportOutcome,
    httpStatus: input.httpStatus,
    responseMediaType: input.responseMediaType,
    rawResponseDigest: input.rawResponseDigest,
    rawResponseByteLength: input.rawResponseByteLength,
    completedAt: input.completedAt,
  });

const createTransportReceiptDigest = (input: {
  request: AgentEvaluationCapabilityProbeAdmissionRequest;
  claim: PhaseDispatchClaim;
  responseDigest: CanonicalDigest;
  transportOutcome: TransportOutcome;
  completedAt: Instant;
}): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: transportReceiptFormat,
    version,
    admissionRequestDigest: input.request.requestDigest,
    phase: input.claim.phase,
    sequence: input.claim.sequence,
    requestDigest: input.claim.requestDigest,
    dispatchIntentDigest: input.claim.dispatchIntentDigest,
    responseDigest: input.responseDigest,
    transportOutcome: input.transportOutcome,
    completedAt: input.completedAt,
  });

const plaintextBase = (input: Omit<SealedPhasePlaintext, 'plaintextDigest'>) =>
  Object.freeze({ ...input });

const createPlaintext = (
  input: Omit<SealedPhasePlaintext, 'plaintextDigest'>
): SealedPhasePlaintext => {
  const base = plaintextBase(input);
  return Object.freeze({
    ...base,
    plaintextDigest: digestAgentCanonicalValue(base),
  });
};

const recordBase = (input: Omit<DurablePhaseRecord, 'recordDigest'>) =>
  Object.freeze({ ...input });

const createRecord = (
  input: Omit<DurablePhaseRecord, 'recordDigest'>
): DurablePhaseRecord => {
  const base = recordBase(input);
  return Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
};

const responseMediaType = (headers: Headers): string | null =>
  headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? null;

const jsonMediaType = (value: string | null): boolean =>
  value === 'application/json' ||
  (value !== null && /^application\/[a-z0-9!#$&^_.+-]+\+json$/u.test(value));

const parseSseJsonEvents = (source: string): readonly unknown[] => {
  const events: unknown[] = [];
  let dataLines: string[] = [];
  const flush = (): void => {
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');
    dataLines = [];
    if (data === '[DONE]') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      return fail('sse-json');
    }
    if (!isPlainObject(parsed) || events.length >= maximumSseEvents) {
      return fail('sse-event');
    }
    events.push(parsed);
  };
  for (const line of source
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')) {
    if (line === '') {
      flush();
      continue;
    }
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
  }
  flush();
  if (events.length === 0) return fail('sse-empty');
  return Object.freeze(events);
};

const parseResponseBody = (
  bytes: Uint8Array,
  mediaType: string,
  policy: AgentCapabilityProbeProviderRequestPolicy
): unknown => {
  const text = textDecoder.decode(bytes);
  if (mediaType === 'text/event-stream') return parseSseJsonEvents(text);
  if (!jsonMediaType(mediaType)) return fail('response-media-type');
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return fail('response-json');
  }
  if (policy.responseMode === 'server-sent-events' && !isPlainObject(value)) {
    return fail('response-json-shape');
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
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximumBytes) {
        return fail('response-too-large');
      }
      chunks.push(next.value);
    }
  } catch (caught) {
    await reader.cancel().catch(() => undefined);
    throw safeRunnerError(caught);
  } finally {
    reader.releaseLock();
  }
  if (length === 0) return fail('response-empty');
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

const buildHeaders = (
  protocolFamily: AgentEvaluationNativeProtocol,
  responseMode: AgentCapabilityProbeProviderRequestPolicy['responseMode'],
  credential: string,
  post: boolean
): Headers => {
  const headers = new Headers({
    Accept:
      responseMode === 'server-sent-events'
        ? 'text/event-stream'
        : 'application/json',
    'Cache-Control': 'no-store',
    'User-Agent': 'prodivix-g4-capability-probe/1',
  });
  if (post) headers.set('Content-Type', 'application/json');
  if (protocolFamily === 'openai-responses') {
    headers.set('Authorization', `Bearer ${credential}`);
  } else if (protocolFamily === 'anthropic-messages') {
    headers.set('anthropic-version', '2023-06-01');
    headers.set('x-api-key', credential);
  } else {
    headers.set('x-goog-api-key', credential);
  }
  return headers;
};

const clearCredentialHeaders = (headers: Headers): void => {
  headers.delete('Authorization');
  headers.delete('x-api-key');
  headers.delete('x-goog-api-key');
};

const timeoutSignal = (milliseconds: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), milliseconds);
  return Object.freeze({
    signal: controller.signal,
    close() {
      clearTimeout(timeout);
    },
  });
};

const executionKeys = Object.freeze([
  'phase',
  'sequence',
  'requestDigest',
  'requestBytes',
  'responseDigest',
  'responseBytes',
  'outcome',
  'programTerminal',
  'providerJobStatus',
  'dispatchIntentDigest',
  'transportReceiptDigest',
  'dispatchedAt',
  'completedAt',
  'spoolRef',
  'envelopeDigest',
  'ciphertextBase64',
  'aadDigest',
  'encryptionProfileDigest',
  'keyRefDigest',
] as const);

const executionIsExact = (
  value: unknown,
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  profile: AgentCapabilityProbeResponseSpoolEncryptionProfile
): value is AgentEvaluationCapabilityProbePhaseExecution =>
  exactRecord(value, executionKeys) &&
  request.probeProgram.providerRequestIntent.requestPhases.includes(
    value.phase as ProbePhase
  ) &&
  Number.isSafeInteger(value.sequence) &&
  Number(value.sequence) >= 0 &&
  [
    value.requestDigest,
    value.responseDigest,
    value.dispatchIntentDigest,
    value.transportReceiptDigest,
    value.envelopeDigest,
    value.aadDigest,
    value.encryptionProfileDigest,
    value.keyRefDigest,
  ].every(isAgentCanonicalDigest) &&
  Number.isSafeInteger(value.requestBytes) &&
  Number(value.requestBytes) >= 1 &&
  Number.isSafeInteger(value.responseBytes) &&
  Number(value.responseBytes) >= 1 &&
  ['completed', 'failed', 'refused', 'timed-out'].includes(
    String(value.outcome)
  ) &&
  typeof value.programTerminal === 'boolean' &&
  (value.providerJobStatus === null ||
    ['cancelled', 'completed', 'failed', 'in-progress', 'queued'].includes(
      String(value.providerJobStatus)
    )) &&
  isAgentControlInstant(value.dispatchedAt) &&
  isAgentControlInstant(value.completedAt) &&
  Date.parse(String(value.completedAt)) >=
    Date.parse(String(value.dispatchedAt)) &&
  isAgentControlIdentity(value.spoolRef) &&
  typeof value.ciphertextBase64 === 'string' &&
  value.encryptionProfileDigest === profile.encryptionProfileDigest &&
  value.keyRefDigest === profile.keyRefDigest;

const decodeRecord = (
  value: unknown,
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  profile: AgentCapabilityProbeResponseSpoolEncryptionProfile
): DurablePhaseRecord => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'admissionRequestDigest',
      'policy',
      'requestProjection',
      'aad',
      'execution',
      'sealedPlaintextDigest',
      'recordDigest',
    ]) ||
    value.format !== recordFormat ||
    value.version !== version ||
    value.admissionRequestDigest !== request.requestDigest ||
    !isAgentCapabilityProbeProviderRequestPolicy(value.policy) ||
    !executionIsExact(value.execution, request, profile) ||
    !isAgentCanonicalDigest(value.sealedPlaintextDigest) ||
    !isAgentCanonicalDigest(value.recordDigest) ||
    value.recordDigest !== digestWithout(value, 'recordDigest')
  ) {
    return fail('record');
  }
  const policy = value.policy;
  const execution = value.execution;
  if (
    policy.sequence !== execution.sequence ||
    policy.phase !== execution.phase ||
    !matchAgentCapabilityProbeProviderRequestPolicy(
      policy,
      request.probeProgram,
      {
        protocolFamily: request.providerConfiguration.adapter
          .protocolFamily as AgentEvaluationNativeProtocol,
        providerConfigurationId:
          request.providerConfiguration.providerConfigurationId,
        modelId: request.modelLineage.modelId,
        modelLineageDigest: request.modelLineage.lineageDigest,
        adapterDigest: request.providerConfiguration.adapter.adapterDigest,
        sequence: policy.sequence,
        observedAt: execution.dispatchedAt,
        providerResourceAuthority: request.probeProviderResourceAuthority,
      }
    ) ||
    !isAgentCapabilityProbeProviderRequestProjection(
      value.requestProjection,
      request.probeProgram,
      policy
    ) ||
    !matchAgentCapabilityProbeResponseSpoolAadBinding(
      value.aad as AgentCapabilityProbeResponseSpoolAad,
      request.probeProgram,
      profile,
      {
        repositoryCommit: request.repositoryCommit,
        admissionRequestDigest: request.requestDigest,
        phase: execution.phase,
        sequence: execution.sequence,
        phaseRequestDigest: execution.requestDigest,
        dispatchIntentDigest: execution.dispatchIntentDigest,
        transportReceiptDigest: execution.transportReceiptDigest,
        spoolRef: execution.spoolRef,
        responseDigest: execution.responseDigest,
      }
    ) ||
    execution.aadDigest !==
      digestAgentCapabilityProbeResponseSpoolAad(
        value.aad as AgentCapabilityProbeResponseSpoolAad
      )
  ) {
    return fail('record-binding');
  }
  return Object.freeze({
    ...(value as unknown as DurablePhaseRecord),
  });
};

const decodePlaintext = (
  value: unknown,
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  record: DurablePhaseRecord,
  canaries: readonly string[]
): SealedPhasePlaintext => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'admissionRequestDigest',
      'phase',
      'sequence',
      'transportOutcome',
      'httpStatus',
      'responseMediaType',
      'rawResponseBase64',
      'rawResponseByteLength',
      'rawResponseDigest',
      'callbackLocalProviderStateHandle',
      'observation',
      'plaintextDigest',
    ]) ||
    value.format !== plaintextFormat ||
    value.version !== version ||
    value.admissionRequestDigest !== request.requestDigest ||
    value.phase !== record.execution.phase ||
    value.sequence !== record.execution.sequence ||
    !['failed', 'received', 'timed-out'].includes(
      String(value.transportOutcome)
    ) ||
    !Number.isSafeInteger(value.rawResponseByteLength) ||
    Number(value.rawResponseByteLength) < 0 ||
    (value.callbackLocalProviderStateHandle !== null &&
      !isAgentControlIdentity(value.callbackLocalProviderStateHandle)) ||
    !isAgentCanonicalDigest(value.plaintextDigest) ||
    value.plaintextDigest !== digestWithout(value, 'plaintextDigest') ||
    value.plaintextDigest !== record.sealedPlaintextDigest ||
    !isAgentCapabilityProbeProviderPhaseObservation(
      value.observation,
      request.probeProgram,
      record.policy,
      record.requestProjection
    ) ||
    !canaryClean(value, canaries)
  ) {
    return fail('plaintext');
  }
  const received = value.transportOutcome === 'received';
  if (
    received !== (value.rawResponseBase64 !== null) ||
    received !== (value.rawResponseDigest !== null) ||
    received !== (value.responseMediaType !== null) ||
    received !==
      (Number.isSafeInteger(value.httpStatus) &&
        Number(value.httpStatus) >= 100 &&
        Number(value.httpStatus) <= 599) ||
    (!received && value.rawResponseByteLength !== 0)
  ) {
    return fail('plaintext-transport');
  }
  if (received) {
    const bytes = decodeBoundedBase64(
      String(value.rawResponseBase64),
      request.probeProgram.hardLimits.maximumResponseBytes,
      'Capability probe raw response'
    );
    try {
      if (
        bytes.byteLength !== value.rawResponseByteLength ||
        digestBytes(bytes) !== value.rawResponseDigest
      ) {
        return fail('plaintext-response');
      }
    } finally {
      bytes.fill(0);
    }
  }
  return Object.freeze({
    ...(value as unknown as SealedPhasePlaintext),
  });
};

const assertRecordPlaintextBinding = (
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  record: DurablePhaseRecord,
  plaintext: SealedPhasePlaintext
): void => {
  const expectedRequestDigest = digestAgentCanonicalValue(
    requestLeaf({
      request,
      policy: record.policy,
      projection: record.requestProjection,
      requestBytes: record.execution.requestBytes,
    })
  );
  const expectedClaim = createClaim({
    request,
    policy: record.policy,
    projection: record.requestProjection,
    requestDigest: expectedRequestDigest,
    requestBytes: record.execution.requestBytes,
    dispatchedAt: record.execution.dispatchedAt,
  });
  const expectedResponseDigest = digestAgentCanonicalValue(
    responseLeaf({
      request,
      claim: expectedClaim,
      transportOutcome: plaintext.transportOutcome,
      httpStatus: plaintext.httpStatus,
      responseMediaType: plaintext.responseMediaType,
      rawResponseDigest: plaintext.rawResponseDigest,
      rawResponseByteLength: plaintext.rawResponseByteLength,
      completedAt: record.execution.completedAt,
    })
  );
  const expectedTransportReceiptDigest = createTransportReceiptDigest({
    request,
    claim: expectedClaim,
    responseDigest: expectedResponseDigest,
    transportOutcome: plaintext.transportOutcome,
    completedAt: record.execution.completedAt,
  });
  if (
    record.execution.requestDigest !== expectedRequestDigest ||
    record.execution.dispatchIntentDigest !==
      expectedClaim.dispatchIntentDigest ||
    record.execution.responseDigest !== expectedResponseDigest ||
    record.execution.transportReceiptDigest !==
      expectedTransportReceiptDigest ||
    record.execution.responseBytes !==
      Math.max(1, plaintext.rawResponseByteLength) ||
    record.execution.outcome !== plaintext.observation.outcome ||
    record.execution.programTerminal !==
      plaintext.observation.programTerminal ||
    record.execution.providerJobStatus !==
      plaintext.observation.providerJobStatus ||
    record.execution.completedAt !== plaintext.observation.observedAt
  ) {
    return fail('record-plaintext-binding');
  }
};

const protocolFor = (
  request: AgentEvaluationCapabilityProbeAdmissionRequest
): AgentEvaluationNativeProtocol => {
  const protocol = request.providerConfiguration.adapter.protocolFamily;
  if (
    protocol !== 'anthropic-messages' &&
    protocol !== 'gemini-interactions' &&
    protocol !== 'openai-responses'
  ) {
    return fail('protocol');
  }
  const definition = AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocol];
  if (
    request.providerConfiguration.providerConfigurationId !==
    definition.providerConfigurationId
  ) {
    return fail('provider-configuration');
  }
  return protocol;
};

/**
 * Production active-probe transport. Completed phase files are the replay
 * authority; a surviving claim without a completed record blocks redispatch.
 */
export const createProductionAgentEvaluationCapabilityProbePhaseTransport =
  async (
    input: CreateProductionAgentEvaluationCapabilityProbePhaseTransportInput
  ): Promise<AgentEvaluationCapabilityProbePhaseTransport> => {
    if (
      !isAgentCapabilityProbeResponseSpoolEncryptionProfile(
        input.encryptionProfile
      ) ||
      input.encryptionProfile.keyEnvironmentName !==
        AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME ||
      typeof input.forbiddenCanaries !== 'function'
    ) {
      return fail('composition');
    }
    const stateDirectory = await initializeStateDirectory(
      input.stateDirectory,
      input.allowTemporaryStateDirectory === true,
      input.runnerTemporaryDirectory
    );
    const store = new DurablePhaseStore(
      stateDirectory,
      input.forbiddenCanaries
    );
    const environment = input.environment ?? process.env;
    const secrets =
      input.secrets ?? new EnvironmentAgentProviderSecretResolver(environment);
    const keys =
      input.keys ??
      new EnvironmentAgentEvaluationCapabilityProbeSpoolKeyResolver({
        profile: input.encryptionProfile,
        environment,
      });
    if (
      keys.authority.keyRefDigest !== input.encryptionProfile.keyRefDigest ||
      keys.authority.encryptionProfileDigest !==
        input.encryptionProfile.encryptionProfileDigest ||
      typeof keys.use !== 'function' ||
      typeof secrets.use !== 'function'
    ) {
      return fail('authority');
    }
    const fetcher = input.fetch ?? agentEvaluationEgressBoundFetch;
    const clock = input.clock ?? currentInstant;
    const nonceSource = input.randomBytes ?? nodeRandomBytes;
    const queues = new Map<string, Promise<unknown>>();
    let draining = false;

    const usePlaintext = async <T>(
      request: AgentEvaluationCapabilityProbeAdmissionRequest,
      record: DurablePhaseRecord,
      useLabel: string,
      callback: (plaintext: SealedPhasePlaintext) => Promise<T>
    ): Promise<T> => {
      const canaries = normalizeCanaries(input.forbiddenCanaries());
      let plaintextBytes: Uint8Array | undefined;
      try {
        plaintextBytes =
          await decryptAgentCapabilityProbeResponseSpoolPlaintext(
            Object.freeze({
              envelopeDigest: record.execution.envelopeDigest,
              ciphertextBase64: record.execution.ciphertextBase64,
            }),
            request.probeProgram,
            input.encryptionProfile,
            record.aad,
            async ({
              keyRef,
              nonceBytes,
              aadBytes,
              ciphertextBytes,
              authenticationTagBytes,
            }) => {
              if (keyRef !== input.encryptionProfile.keyRef) {
                return fail('decrypt-key-ref');
              }
              return keys.use(
                {
                  useId: `capability-probe-phase.decrypt.${useLabel}.${record.execution.sequence}`,
                  purpose: 'decrypt',
                },
                async (key) => {
                  const decipher = createDecipheriv(
                    'aes-256-gcm',
                    key,
                    nonceBytes,
                    {
                      authTagLength:
                        input.encryptionProfile.authenticationTagBytes,
                    }
                  );
                  decipher.setAAD(aadBytes);
                  decipher.setAuthTag(authenticationTagBytes);
                  const value = Buffer.concat([
                    decipher.update(ciphertextBytes),
                    decipher.final(),
                  ]);
                  return new Uint8Array(value);
                }
              );
            }
          );
        const source = textDecoder.decode(plaintextBytes);
        let value: unknown;
        try {
          value = JSON.parse(source) as unknown;
        } catch {
          return fail('plaintext-json');
        }
        if (canonicalJsonText(value) !== source) {
          return fail('plaintext-canonical');
        }
        return callback(decodePlaintext(value, request, record, canaries));
      } finally {
        plaintextBytes?.fill(0);
      }
    };

    const loadRecord = async (
      request: AgentEvaluationCapabilityProbeAdmissionRequest,
      sequence: number
    ): Promise<DurablePhaseRecord | null> => {
      const value = await store.readRecord(request.requestDigest, sequence);
      return value === null
        ? null
        : decodeRecord(value, request, input.encryptionProfile);
    };

    const verifyPersistedPhase = (
      request: AgentEvaluationCapabilityProbeAdmissionRequest,
      record: DurablePhaseRecord,
      plaintext: SealedPhasePlaintext,
      priorPhases: readonly AgentCapabilityProbeProviderPhaseRecord[]
    ): void => {
      assertRecordPlaintextBinding(request, record, plaintext);
      let rawResponseBytes: Uint8Array | undefined;
      try {
        const responseBody =
          plaintext.transportOutcome === 'received'
            ? (() => {
                rawResponseBytes = decodeBoundedBase64(
                  plaintext.rawResponseBase64!,
                  request.probeProgram.hardLimits.maximumResponseBytes,
                  'Capability probe persisted raw response'
                );
                return parseResponseBody(
                  rawResponseBytes,
                  plaintext.responseMediaType!,
                  record.policy
                );
              })()
            : null;
        const decoded = decodeAgentCapabilityProbeProviderPhaseResponse(
          request.probeProgram,
          record.policy,
          {
            requestProjection: record.requestProjection,
            priorPhases,
            requestLeafDigest: record.execution.requestDigest,
            responseLeafDigest: record.execution.responseDigest,
            transportOutcome: plaintext.transportOutcome,
            httpStatus: plaintext.httpStatus,
            responseBody,
            observedAt: record.execution.completedAt,
          },
          { secretCanaries: normalizeCanaries(input.forbiddenCanaries()) }
        );
        if (
          !sameCanonicalJson(decoded.observation, plaintext.observation) ||
          decoded.callbackLocalProviderStateHandle !==
            plaintext.callbackLocalProviderStateHandle
        ) {
          return fail('persisted-phase-reconstruction');
        }
      } finally {
        rawResponseBytes?.fill(0);
      }
    };

    const loadPersistedPhases = async (
      request: AgentEvaluationCapabilityProbeAdmissionRequest,
      count: number,
      useLabel: string
    ): Promise<
      Readonly<{
        records: readonly DurablePhaseRecord[];
        providerRecords: readonly AgentCapabilityProbeProviderPhaseRecord[];
        callbackLocalProviderStateHandle: string | null;
      }>
    > => {
      const records: DurablePhaseRecord[] = [];
      const providerRecords: AgentCapabilityProbeProviderPhaseRecord[] = [];
      let callbackLocalProviderStateHandle: string | null = null;
      for (let sequence = 0; sequence < count; sequence += 1) {
        const record = await loadRecord(request, sequence);
        if (record === null) return fail('prior-record-missing');
        await usePlaintext(
          request,
          record,
          `${useLabel}.${sequence}`,
          async (plaintext) => {
            verifyPersistedPhase(
              request,
              record,
              plaintext,
              Object.freeze([...providerRecords])
            );
            records.push(record);
            providerRecords.push(
              Object.freeze({
                policy: record.policy,
                requestProjection: record.requestProjection,
                observation: plaintext.observation,
              })
            );
            callbackLocalProviderStateHandle =
              plaintext.callbackLocalProviderStateHandle;
          }
        );
      }
      return Object.freeze({
        records: Object.freeze(records),
        providerRecords: Object.freeze(providerRecords),
        callbackLocalProviderStateHandle,
      });
    };

    const seal = async (sealInput: {
      request: AgentEvaluationCapabilityProbeAdmissionRequest;
      claim: PhaseDispatchClaim;
      transportOutcome: TransportOutcome;
      httpStatus: number | null;
      responseMediaType: string | null;
      rawResponseBytes: Uint8Array | null;
      responseBody: unknown | null;
      callbackPriorRecords: readonly AgentCapabilityProbeProviderPhaseRecord[];
      canaries: readonly string[];
      completedAt: Instant;
    }): Promise<DurablePhaseRecord> => {
      const rawResponseDigest =
        sealInput.rawResponseBytes === null
          ? null
          : digestBytes(sealInput.rawResponseBytes);
      const response = responseLeaf({
        request: sealInput.request,
        claim: sealInput.claim,
        transportOutcome: sealInput.transportOutcome,
        httpStatus: sealInput.httpStatus,
        responseMediaType: sealInput.responseMediaType,
        rawResponseDigest,
        rawResponseByteLength: sealInput.rawResponseBytes?.byteLength ?? 0,
        completedAt: sealInput.completedAt,
      });
      const responseDigest = digestAgentCanonicalValue(response);
      const decoded = decodeAgentCapabilityProbeProviderPhaseResponse(
        sealInput.request.probeProgram,
        sealInput.claim.policy,
        {
          requestProjection: sealInput.claim.requestProjection,
          priorPhases: sealInput.callbackPriorRecords,
          requestLeafDigest: sealInput.claim.requestDigest,
          responseLeafDigest: responseDigest,
          transportOutcome: sealInput.transportOutcome,
          httpStatus: sealInput.httpStatus,
          responseBody: sealInput.responseBody,
          observedAt: sealInput.completedAt,
        },
        { secretCanaries: sealInput.canaries }
      );
      const transportReceiptDigest = createTransportReceiptDigest({
        request: sealInput.request,
        claim: sealInput.claim,
        responseDigest,
        transportOutcome: sealInput.transportOutcome,
        completedAt: sealInput.completedAt,
      });
      const spoolRef = `capability-probe-phase.${sealInput.request.requestDigest.slice('sha256-'.length)}.${sealInput.claim.sequence}`;
      const aad = createAgentCapabilityProbeResponseSpoolAad(
        sealInput.request.probeProgram,
        input.encryptionProfile,
        {
          repositoryCommit: sealInput.request.repositoryCommit,
          admissionRequestDigest: sealInput.request.requestDigest,
          phase: sealInput.claim.phase,
          sequence: sealInput.claim.sequence,
          phaseRequestDigest: sealInput.claim.requestDigest,
          dispatchIntentDigest: sealInput.claim.dispatchIntentDigest,
          transportReceiptDigest,
          spoolRef,
          responseDigest,
        }
      );
      const plaintext = createPlaintext({
        format: plaintextFormat,
        version,
        admissionRequestDigest: sealInput.request.requestDigest,
        phase: sealInput.claim.phase,
        sequence: sealInput.claim.sequence,
        transportOutcome: sealInput.transportOutcome,
        httpStatus: sealInput.httpStatus,
        responseMediaType: sealInput.responseMediaType,
        rawResponseBase64:
          sealInput.rawResponseBytes === null
            ? null
            : canonicalBase64(sealInput.rawResponseBytes),
        rawResponseByteLength: sealInput.rawResponseBytes?.byteLength ?? 0,
        rawResponseDigest,
        callbackLocalProviderStateHandle:
          decoded.callbackLocalProviderStateHandle,
        observation: decoded.observation,
      });
      if (!canaryClean(plaintext, sealInput.canaries)) {
        return fail('sealed-canary');
      }
      const plaintextBytes = textEncoder.encode(canonicalJsonText(plaintext));
      const nonceBytes = new Uint8Array(
        nonceSource(input.encryptionProfile.nonceBytes)
      );
      let producedCiphertext: Uint8Array | undefined;
      let producedTag: Uint8Array | undefined;
      try {
        const wire = await encryptAgentCapabilityProbeResponseSpoolPlaintext(
          sealInput.request.probeProgram,
          input.encryptionProfile,
          aad,
          {
            plaintextBytes,
            nonceBytes,
            encrypt: async ({
              keyRef,
              nonceBytes: nonce,
              aadBytes,
              plaintextBytes: source,
            }) => {
              if (keyRef !== input.encryptionProfile.keyRef) {
                return fail('encrypt-key-ref');
              }
              return keys.use(
                {
                  useId: `capability-probe-phase.encrypt.${sealInput.request.requestDigest.slice('sha256-'.length)}.${sealInput.claim.sequence}`,
                  purpose: 'encrypt',
                },
                async (key) => {
                  const cipher = createCipheriv('aes-256-gcm', key, nonce, {
                    authTagLength:
                      input.encryptionProfile.authenticationTagBytes,
                  });
                  cipher.setAAD(aadBytes);
                  producedCiphertext = new Uint8Array(
                    Buffer.concat([cipher.update(source), cipher.final()])
                  );
                  producedTag = new Uint8Array(cipher.getAuthTag());
                  return Object.freeze({
                    ciphertextBytes: producedCiphertext,
                    authenticationTagBytes: producedTag,
                  });
                }
              );
            },
          }
        );
        const execution = Object.freeze({
          phase: sealInput.claim.phase,
          sequence: sealInput.claim.sequence,
          requestDigest: sealInput.claim.requestDigest,
          requestBytes: sealInput.claim.requestBytes,
          responseDigest,
          responseBytes: Math.max(
            1,
            sealInput.rawResponseBytes?.byteLength ?? 0
          ),
          outcome: decoded.observation.outcome,
          programTerminal: decoded.observation.programTerminal,
          providerJobStatus: decoded.observation.providerJobStatus,
          dispatchIntentDigest: sealInput.claim.dispatchIntentDigest,
          transportReceiptDigest,
          dispatchedAt: sealInput.claim.dispatchedAt,
          completedAt: sealInput.completedAt,
          spoolRef,
          envelopeDigest: wire.envelopeDigest,
          ciphertextBase64: wire.ciphertextBase64,
          aadDigest: digestAgentCapabilityProbeResponseSpoolAad(aad),
          encryptionProfileDigest:
            input.encryptionProfile.encryptionProfileDigest,
          keyRefDigest: input.encryptionProfile.keyRefDigest,
        }) satisfies AgentEvaluationCapabilityProbePhaseExecution;
        return createRecord({
          format: recordFormat,
          version,
          admissionRequestDigest: sealInput.request.requestDigest,
          policy: sealInput.claim.policy,
          requestProjection: sealInput.claim.requestProjection,
          aad,
          execution,
          sealedPlaintextDigest: plaintext.plaintextDigest,
        });
      } finally {
        plaintextBytes.fill(0);
        nonceBytes.fill(0);
        producedCiphertext?.fill(0);
        producedTag?.fill(0);
      }
    };

    const executePhase: AgentEvaluationCapabilityProbePhaseTransport['executePhase'] =
      async (value) => {
        if (draining) return fail('draining');
        const request = decodeAgentEvaluationCapabilityProbeAdmissionRequest(
          value.request
        );
        const protocolFamily = protocolFor(request);
        if (
          value.sequence < 0 ||
          value.sequence > 5 ||
          value.phase !==
            resolveAgentCapabilityProbeNetworkRoundTripPhase(
              request.probeProgram,
              value.sequence
            )
        ) {
          return fail('phase-input');
        }
        const queueKey = `${request.requestDigest}:${value.sequence}`;
        const previous = queues.get(queueKey) ?? Promise.resolve();
        const current = previous.then(async () => {
          const prior = await loadPersistedPhases(
            request,
            value.sequence,
            `execute.${request.requestDigest.slice('sha256-'.length)}`
          );
          if (
            value.priorPhases.length !== value.sequence ||
            !sameCanonicalJson(
              value.priorPhases,
              prior.records.map(({ execution }) => execution)
            )
          ) {
            return fail('prior-phase-binding');
          }
          const existing = await loadRecord(request, value.sequence);
          if (existing !== null) {
            await usePlaintext(
              request,
              existing,
              `replay.${request.requestDigest.slice('sha256-'.length)}`,
              async (plaintext) => {
                verifyPersistedPhase(
                  request,
                  existing,
                  plaintext,
                  prior.providerRecords
                );
              }
            );
            return existing.execution;
          }
          const dispatchedAt = canonicalInstant(clock());
          const firstDispatchedAt =
            prior.records[0]?.execution.dispatchedAt ?? dispatchedAt;
          const remaining =
            request.probeProgram.hardLimits.maximumExecutionDurationMs -
            (Date.parse(dispatchedAt) - Date.parse(firstDispatchedAt));
          const timeoutMs = Math.min(
            request.probeProgram.hardLimits.maximumSingleDispatchMs,
            remaining
          );
          if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
            return fail('phase-time-budget');
          }
          const policy = createAgentCapabilityProbeProviderRequestPolicy(
            request.probeProgram,
            {
              protocolFamily,
              providerConfigurationId:
                request.providerConfiguration.providerConfigurationId,
              modelId: request.modelLineage.modelId,
              modelLineageDigest: request.modelLineage.lineageDigest,
              adapterDigest:
                request.providerConfiguration.adapter.adapterDigest,
              sequence: value.sequence,
              observedAt: dispatchedAt,
              providerResourceAuthority: request.probeProviderResourceAuthority,
            }
          );
          let claimed = false;
          let dispatchStarted = false;
          try {
            return await secrets.use(
              {
                protocolFamily,
                providerConfigurationId:
                  request.providerConfiguration.providerConfigurationId,
                secretRef:
                  AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocolFamily]
                    .secretRef,
                purpose: 'model-invocation',
                runtimeZone: 'server',
                useId: `capability-probe-phase.${request.requestDigest.slice('sha256-'.length)}.${value.sequence}`,
              },
              async (credentialBytes) => {
                const credentialCanaries =
                  createCredentialCanarySignatures(credentialBytes);
                const canaries = normalizeCanaries([
                  ...input.forbiddenCanaries(),
                  ...credentialCanaries,
                ]);
                const material =
                  createAgentCapabilityProbeProviderRequestMaterial(
                    request.probeProgram,
                    policy,
                    {
                      observedAt: dispatchedAt,
                      providerStateHandle:
                        prior.callbackLocalProviderStateHandle,
                      providerResourceAuthority:
                        request.probeProviderResourceAuthority,
                    }
                  );
                const requestBody =
                  material.callbackLocalBody === null
                    ? null
                    : canonicalJsonText(material.callbackLocalBody);
                if (
                  requestBody !== null &&
                  (textContainsCredentialCanary(requestBody, canaries) ||
                    textEncoder.encode(requestBody).byteLength >
                      request.probeProgram.hardLimits.maximumRequestBytes)
                ) {
                  return fail('request-body');
                }
                const requestBytes =
                  requestBody === null
                    ? 1
                    : textEncoder.encode(requestBody).byteLength;
                const leaf = requestLeaf({
                  request,
                  policy,
                  projection: material.projection,
                  requestBytes,
                });
                const requestDigest = digestAgentCanonicalValue(leaf);
                const claim = createClaim({
                  request,
                  policy,
                  projection: material.projection,
                  requestDigest,
                  requestBytes,
                  dispatchedAt,
                });
                const base = new URL(
                  AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocolFamily].endpoint
                );
                const endpoint = new URL(
                  material.callbackLocalPath,
                  base.origin
                ).toString();
                const admission =
                  await authorizeAgentEvaluationCapabilityProbeEgress({
                    protocolFamily,
                    method: policy.httpMethod,
                    endpoint,
                    requestBytes,
                    maximumResponseBytes:
                      request.probeProgram.hardLimits.maximumResponseBytes,
                    timeoutMs,
                    ...(input.resolveHost === undefined
                      ? {}
                      : { resolveHost: input.resolveHost }),
                  });
                await keys.use(
                  {
                    useId: `capability-probe-phase.preflight.${request.requestDigest.slice('sha256-'.length)}.${value.sequence}`,
                    purpose: 'encrypt',
                  },
                  async (key) => {
                    if (key.byteLength !== 32) return fail('key-size');
                    return true;
                  }
                );
                claimed = await store.claim(claim);
                if (!claimed) {
                  const completed = await loadRecord(request, value.sequence);
                  if (completed !== null) {
                    await usePlaintext(
                      request,
                      completed,
                      `claim-replay.${request.requestDigest.slice('sha256-'.length)}`,
                      async (plaintext) => {
                        verifyPersistedPhase(
                          request,
                          completed,
                          plaintext,
                          prior.providerRecords
                        );
                      }
                    );
                    return completed.execution;
                  }
                  return fail('phase-claimed');
                }
                let credential = textDecoder.decode(credentialBytes);
                const headers = buildHeaders(
                  protocolFamily,
                  policy.responseMode,
                  credential,
                  policy.httpMethod === 'POST'
                );
                const bounded = timeoutSignal(timeoutMs);
                let rawResponseBytes: Uint8Array | null = null;
                try {
                  let transportOutcome: TransportOutcome = 'received';
                  let httpStatus: number | null = null;
                  let mediaType: string | null = null;
                  let responseBody: unknown | null = null;
                  try {
                    dispatchStarted = true;
                    const response = await fetcher(
                      endpoint,
                      {
                        method: policy.httpMethod,
                        headers,
                        ...(requestBody === null ? {} : { body: requestBody }),
                        cache: 'no-store',
                        credentials: 'omit',
                        redirect: 'manual',
                        signal: bounded.signal,
                      },
                      admission.approvedAddresses
                    );
                    httpStatus = response.status;
                    mediaType = responseMediaType(response.headers);
                    rawResponseBytes = await readBoundedResponse(
                      response,
                      request.probeProgram.hardLimits.maximumResponseBytes
                    );
                    const rawText = textDecoder.decode(rawResponseBytes);
                    if (
                      textContainsCredentialCanary(rawText, canaries) ||
                      !canaryClean(rawText, canaries)
                    ) {
                      return fail('response-canary');
                    }
                    responseBody = parseResponseBody(
                      rawResponseBytes,
                      mediaType ?? '',
                      policy
                    );
                    if (
                      valueContainsCredentialCanary(
                        responseBody,
                        credentialBytes,
                        credentialCanaries
                      ) ||
                      !canaryClean(responseBody, canaries)
                    ) {
                      return fail('response-value-canary');
                    }
                  } catch {
                    transportOutcome = bounded.signal.aborted
                      ? 'timed-out'
                      : 'failed';
                    httpStatus = null;
                    mediaType = null;
                    responseBody = null;
                    rawResponseBytes?.fill(0);
                    rawResponseBytes = null;
                  }
                  const completedAt = canonicalInstant(clock());
                  const record = await seal({
                    request,
                    claim,
                    transportOutcome,
                    httpStatus,
                    responseMediaType: mediaType,
                    rawResponseBytes,
                    responseBody,
                    callbackPriorRecords: prior.providerRecords,
                    canaries,
                    completedAt,
                  });
                  await store.persist(record);
                  await store.releaseClaim(
                    request.requestDigest,
                    value.sequence
                  );
                  return record.execution;
                } finally {
                  bounded.close();
                  clearCredentialHeaders(headers);
                  credential = '';
                  rawResponseBytes?.fill(0);
                }
              }
            );
          } finally {
            if (claimed && !dispatchStarted) {
              await store.releaseClaim(request.requestDigest, value.sequence);
            }
          }
        });
        queues.set(queueKey, current);
        try {
          return (await current) as AgentEvaluationCapabilityProbePhaseExecution;
        } finally {
          if (queues.get(queueKey) === current) queues.delete(queueKey);
        }
      };

    const normalize: AgentEvaluationCapabilityProbePhaseTransport['normalize'] =
      async (value) => {
        if (draining) return fail('draining');
        const request = decodeAgentEvaluationCapabilityProbeAdmissionRequest(
          value.request
        );
        if (
          !isAgentCanonicalDigest(value.requestReferenceDigest) ||
          !isAgentCanonicalDigest(value.responseReferenceDigest) ||
          value.phases.length < 1
        ) {
          return fail('normalize-input');
        }
        const persisted = await loadPersistedPhases(
          request,
          value.phases.length,
          `normalize.${request.requestDigest.slice('sha256-'.length)}`
        );
        if (
          !sameCanonicalJson(
            value.phases,
            persisted.records.map(({ execution }) => execution)
          )
        ) {
          return fail('normalize-phase-binding');
        }
        const evidence = createAgentCapabilityProbeProviderExecutionEvidence(
          request.probeProgram,
          persisted.providerRecords
        );
        if (evidence.status === 'inconclusive') {
          return fail('normalize-inconclusive');
        }
        return Object.freeze({
          status: evidence.status,
          observedFacts: evidence.observedFacts,
          semanticProof: evidence.semanticProof,
          denial: evidence.denial,
        });
      };

    let closePromise: ReturnType<
      AgentEvaluationCapabilityProbePhaseTransport['close']
    > | null = null;
    const close: AgentEvaluationCapabilityProbePhaseTransport['close'] = () => {
      closePromise ??= (async () => {
        draining = true;
        await Promise.all([...queues.values()]);
        await store.close();
        return Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze([] as const),
          residualCanaryIds: Object.freeze([] as const),
        });
      })();
      return closePromise;
    };

    return Object.freeze({ executePhase, normalize, close });
  };
