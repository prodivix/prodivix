import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, parse, relative, resolve } from 'node:path';

import {
  createAgentCapabilityProbeProviderResourceCleanupReceipt,
  createAgentCapabilityProbeProviderResourceCleanupResourceResult,
  createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  createAgentCapabilityProbeProviderResourceDeletionRequestProjection,
  createAgentCapabilityProbeProviderResourceAuthority,
  digestAgentCanonicalValue,
  inspectAgentControlJson,
  isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  isAgentCapabilityProbeProviderResourceDeletionRequestProjection,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  resolveAgentCapabilityProbePublicResource,
  type AgentCapabilityProbePublicResourceMaterial,
  type AgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  type AgentCapabilityProbeProviderResourceCleanupReceipt,
  type AgentCapabilityProbeProviderResourceCleanupResourceResult,
  type AgentCapabilityProbeProviderResourceDeletionRequestProjection,
  type AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest,
  decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  digestAgentEvaluationCapabilityProbeProviderResourceStage,
  type AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  type AgentEvaluationCapabilityProbeProviderResourceResult,
} from './capabilityProbeProviderResourceClient';
import type { AgentEvaluationCapabilityProbeProviderResourceCleanupClient } from './capabilityProbeProviderResourceCleanupClient';
import { AGENT_EVALUATION_PROVIDER_DEFINITIONS } from './config';
import type { AgentEvaluationEgressBoundFetch } from './egressBoundFetch';
import type { AgentEvaluationHostResolver } from './egress';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type {
  AgentEvaluationCapabilityProbeProviderResourceCleanupOwnerPort,
  AgentEvaluationCapabilityProbeProviderResourceOwnerPort,
} from './productionOwnerAuthoritySidecar';
import {
  type AgentEvaluationEnvironmentReader,
  type AgentProviderSecretResolver,
} from './secretResolver';
import { createAgentEvaluationProviderResourceTransport } from './productionProviderResourceTransport';
import {
  executeAgentEvaluationCapabilityProbeProviderResourceMutation,
  executeAgentEvaluationCapabilityProbeProviderResourceReconciliation,
  type AgentEvaluationHostedRetrievalProviderResourceMutationResult,
} from './productionHostedRetrievalProviderResourceMutationAdapter';

export const PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_ID =
  'evaluation.capability-probe-provider-resource.owner.v1' as const;
export const PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-capability-probe-provider-resource-owner-implementation',
    version: 1,
    protocols: ['gemini-interactions', 'openai-responses'],
    resourceLifecycle: 'create-upload-index-delete',
    durableHandleJournal: true,
  });
export const PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_AUTHORITY_ID =
  'evaluation.capability-probe-provider-resource-cleanup.owner.v1' as const;
export const PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-owner-implementation',
    version: 1,
    protocols: ['gemini-interactions', 'openai-responses'],
    deletionRequestAuthority: 'canonical-sealed-projection',
    executionAuthority: 'provider-delete-with-404-idempotency',
    durability: '8790-ingress-before-response',
    reconciliation: 'sealed-result-zero-execute',
  });

const handleFormat =
  'prodivix.agent-evaluation-capability-probe-provider-resource-handle';
const stateFormat =
  'prodivix.agent-evaluation-capability-probe-provider-resource-owner-state';
const manifestFormat =
  'prodivix.agent-evaluation-capability-probe-provider-resource-manifest';
const uploadReceiptFormat =
  'prodivix.agent-evaluation-capability-probe-provider-resource-content-upload-receipt';
const resultFormat =
  'prodivix.agent-evaluation-capability-probe-provider-resource-result';
const version = 1 as const;
const maximumStateBytes = 524_288;
const maximumPolls = 120;
const textEncoder = new TextEncoder();
const digestFilePattern = /^sha256-[a-f0-9]{64}\.(\d{4})\.json$/u;

type SupportedProtocol = 'gemini-interactions' | 'openai-responses';

export type AgentEvaluationCapabilityProbeProviderResourceHandle = Readonly<{
  format: typeof handleFormat;
  version: typeof version;
  protocolFamily: SupportedProtocol;
  requestDigest: CanonicalDigest;
  lifecycle: 'active' | 'preparing';
  providerResourceId: string | null;
  auxiliaryResourceIds: readonly string[];
  requestProjectionDigests: readonly CanonicalDigest[];
  responseProjectionDigests: readonly CanonicalDigest[];
  dispatchIntentDigest: CanonicalDigest | null;
  transportReceiptDigest: CanonicalDigest | null;
  responseSpoolDigest: CanonicalDigest | null;
  uploadedAt: Instant | null;
  handleDigest: CanonicalDigest;
}>;

type ResourceOwnerState = Readonly<{
  format: typeof stateFormat;
  version: typeof version;
  requestDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  revision: number;
  registeredAt: Instant;
  expiresAt: Instant;
  handle: AgentEvaluationCapabilityProbeProviderResourceHandle;
  result: AgentEvaluationCapabilityProbeProviderResourceResult | null;
  recordDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityProbeProviderResourceRegistration =
  Readonly<{
    handle: AgentEvaluationCapabilityProbeProviderResourceHandle;
  }>;

export type AgentEvaluationCapabilityProbeProviderResourceTransport = Readonly<{
  register(input: {
    request: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest;
    material: AgentCapabilityProbePublicResourceMaterial;
    registeredAt: Instant;
    expiresAt: Instant;
    existingHandle: AgentEvaluationCapabilityProbeProviderResourceHandle;
    checkpoint(
      handle: AgentEvaluationCapabilityProbeProviderResourceHandle
    ): Promise<void>;
    signal: AbortSignal;
  }): Promise<AgentEvaluationCapabilityProbeProviderResourceRegistration>;
  delete(input: {
    handle: AgentEvaluationCapabilityProbeProviderResourceHandle;
    signal: AbortSignal;
  }): Promise<void>;
  cleanup(input: {
    deletionRequestProjection: AgentCapabilityProbeProviderResourceDeletionRequestProjection;
    signal: AbortSignal;
  }): Promise<
    readonly AgentCapabilityProbeProviderResourceCleanupResourceResult[]
  >;
}>;

export type CreateProductionAgentEvaluationCapabilityProbeProviderResourceOwnerInput =
  Readonly<{
    stateDirectory: string;
    transport: AgentEvaluationCapabilityProbeProviderResourceTransport;
    cleanupClient: AgentEvaluationCapabilityProbeProviderResourceCleanupClient;
    forbiddenCanaries: () => readonly string[];
    clock?: () => Instant;
    allowTemporaryStateDirectory?: boolean;
    runnerTemporaryDirectory?: string;
  }>;

export type ProductionAgentEvaluationCapabilityProbeProviderResourceOwner =
  Readonly<{
    port: AgentEvaluationCapabilityProbeProviderResourceOwnerPort;
    cleanupPort: AgentEvaluationCapabilityProbeProviderResourceCleanupOwnerPort;
    close(): Promise<
      Readonly<{
        status: 'clean';
        residualResourceIds: readonly [];
        residualCanaryIds: readonly [];
      }>
    >;
  }>;

export type CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceTransportInput =
  Readonly<{
    environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
    secrets?: AgentProviderSecretResolver;
    fetch?: AgentEvaluationEgressBoundFetch;
    resolveHost?: AgentEvaluationHostResolver;
    clock?: () => Instant;
    wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
  }>;

const fail = (code: string): never => {
  throw new TypeError(
    `G4_CAPABILITY_PROBE_PROVIDER_RESOURCE_OWNER_INVALID: ${code}`
  );
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
  const exactPath =
    process.platform === 'win32'
      ? concrete.toLowerCase() === target.toLowerCase()
      : concrete === target;
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || !exactPath) {
    return fail('state-directory-concrete');
  }
  return target;
};

const handleBase = (
  input: Omit<
    AgentEvaluationCapabilityProbeProviderResourceHandle,
    'handleDigest'
  >
) => Object.freeze({ ...input });

export const createAgentEvaluationCapabilityProbeProviderResourceHandle = (
  input: Omit<
    AgentEvaluationCapabilityProbeProviderResourceHandle,
    'format' | 'version' | 'handleDigest'
  >
): AgentEvaluationCapabilityProbeProviderResourceHandle => {
  const requestProjectionDigests = Object.freeze([
    ...input.requestProjectionDigests,
  ]);
  const responseProjectionDigests = Object.freeze([
    ...input.responseProjectionDigests,
  ]);
  const auxiliaryResourceIds = Object.freeze([...input.auxiliaryResourceIds]);
  const exchanges = requestProjectionDigests.map(
    (requestProjectionDigest, index) =>
      Object.freeze({
        requestProjectionDigest,
        responseProjectionDigest: responseProjectionDigests[index],
      })
  );
  const base = handleBase({
    format: handleFormat,
    version,
    ...input,
    auxiliaryResourceIds,
    requestProjectionDigests,
    responseProjectionDigests,
  });
  const handle = Object.freeze({
    ...base,
    handleDigest: digestAgentCanonicalValue(base),
  });
  const active = input.lifecycle === 'active';
  if (
    (input.protocolFamily !== 'openai-responses' &&
      input.protocolFamily !== 'gemini-interactions') ||
    !isAgentCanonicalDigest(input.requestDigest) ||
    (input.providerResourceId !== null &&
      !isAgentControlIdentity(input.providerResourceId)) ||
    input.auxiliaryResourceIds.length > 4 ||
    new Set(input.auxiliaryResourceIds).size !==
      input.auxiliaryResourceIds.length ||
    input.auxiliaryResourceIds.some(
      (value) => !isAgentControlIdentity(value)
    ) ||
    requestProjectionDigests.length !== responseProjectionDigests.length ||
    requestProjectionDigests.length > 128 ||
    requestProjectionDigests.some((value) => !isAgentCanonicalDigest(value)) ||
    responseProjectionDigests.some((value) => !isAgentCanonicalDigest(value)) ||
    (active
      ? input.providerResourceId === null ||
        requestProjectionDigests.length === 0 ||
        input.dispatchIntentDigest === null ||
        input.transportReceiptDigest === null ||
        input.responseSpoolDigest === null ||
        input.uploadedAt === null ||
        ![
          input.dispatchIntentDigest,
          input.transportReceiptDigest,
          input.responseSpoolDigest,
        ].every(isAgentCanonicalDigest) ||
        !isAgentControlInstant(input.uploadedAt) ||
        input.dispatchIntentDigest !==
          digestAgentCanonicalValue({
            format:
              'prodivix.agent-evaluation-capability-probe-provider-resource-dispatch-intents',
            version,
            requestProjectionDigests,
          }) ||
        input.transportReceiptDigest !==
          digestAgentCanonicalValue({
            format:
              'prodivix.agent-evaluation-capability-probe-provider-resource-transport-receipts',
            version,
            responseProjectionDigests,
          }) ||
        input.responseSpoolDigest !==
          digestAgentCanonicalValue({
            format:
              'prodivix.agent-evaluation-capability-probe-provider-resource-response-spool',
            version,
            exchangeSetDigest: digestAgentCanonicalValue(exchanges),
          })
      : input.dispatchIntentDigest !== null ||
        input.transportReceiptDigest !== null ||
        input.responseSpoolDigest !== null ||
        input.uploadedAt !== null) ||
    inspectAgentControlJson(handle, 32_768).length > 0
  ) {
    return fail('handle');
  }
  return handle;
};

const decodeHandle = (
  value: unknown
): AgentEvaluationCapabilityProbeProviderResourceHandle => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'protocolFamily',
      'requestDigest',
      'lifecycle',
      'providerResourceId',
      'auxiliaryResourceIds',
      'requestProjectionDigests',
      'responseProjectionDigests',
      'dispatchIntentDigest',
      'transportReceiptDigest',
      'responseSpoolDigest',
      'uploadedAt',
      'handleDigest',
    ]) ||
    !Array.isArray(value.auxiliaryResourceIds) ||
    !Array.isArray(value.requestProjectionDigests) ||
    !Array.isArray(value.responseProjectionDigests)
  ) {
    return fail('handle-shape');
  }
  const candidate =
    value as unknown as AgentEvaluationCapabilityProbeProviderResourceHandle;
  const recreated = createAgentEvaluationCapabilityProbeProviderResourceHandle({
    protocolFamily: candidate.protocolFamily,
    requestDigest: candidate.requestDigest,
    lifecycle: candidate.lifecycle,
    providerResourceId: candidate.providerResourceId,
    auxiliaryResourceIds: candidate.auxiliaryResourceIds,
    requestProjectionDigests: candidate.requestProjectionDigests,
    responseProjectionDigests: candidate.responseProjectionDigests,
    dispatchIntentDigest: candidate.dispatchIntentDigest,
    transportReceiptDigest: candidate.transportReceiptDigest,
    responseSpoolDigest: candidate.responseSpoolDigest,
    uploadedAt: candidate.uploadedAt,
  });
  if (!sameCanonicalJson(candidate, recreated)) return fail('handle-digest');
  return recreated;
};

const component = <T extends Readonly<Record<string, unknown>>>(
  base: T,
  digestField: string
): Readonly<T & Record<string, CanonicalDigest>> =>
  Object.freeze({
    ...base,
    [digestField]: digestAgentCanonicalValue(base),
  }) as Readonly<T & Record<string, CanonicalDigest>>;

const createResult = (
  request: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  handle: AgentEvaluationCapabilityProbeProviderResourceHandle,
  registeredAt: Instant,
  expiresAt: Instant
): AgentEvaluationCapabilityProbeProviderResourceResult => {
  if (
    handle.lifecycle !== 'active' ||
    handle.providerResourceId === null ||
    handle.dispatchIntentDigest === null ||
    handle.transportReceiptDigest === null ||
    handle.responseSpoolDigest === null ||
    handle.uploadedAt === null
  ) {
    return fail('active-handle');
  }
  const descriptor =
    request.probeProgram.providerRequestIntent.publicProbeResource;
  if (descriptor === null) return fail('public-resource');
  const providerResourceKind =
    handle.protocolFamily === 'openai-responses'
      ? ('openai-vector-store-id' as const)
      : ('gemini-file-search-store-name' as const);
  const resourceManifest = component(
    Object.freeze({
      format: manifestFormat,
      version,
      requestDigest: request.requestDigest,
      probeProgramDigest: request.probeProgram.programDigest,
      publicResourceDescriptorDigest: descriptor.descriptorDigest,
      protocolFamily: handle.protocolFamily,
      providerConfigurationId:
        request.providerConfiguration.providerConfigurationId,
      modelId: request.modelLineage.modelId,
      modelLineageDigest: request.modelLineage.lineageDigest,
      adapterDigest: request.providerConfiguration.adapter.adapterDigest,
      providerResourceKind,
      providerResourceId: handle.providerResourceId,
      contentDigest: descriptor.contentDigest,
      documentBytesDigest: descriptor.documentBytesDigest,
      registeredAt,
      expiresAt,
    }),
    'manifestDigest'
  );
  const contentUploadReceipt = component(
    Object.freeze({
      format: uploadReceiptFormat,
      version,
      requestDigest: request.requestDigest,
      resourceManifestDigest: resourceManifest.manifestDigest,
      publicResourceDescriptorDigest: descriptor.descriptorDigest,
      providerResourceKind,
      providerResourceId: handle.providerResourceId,
      contentDigest: descriptor.contentDigest,
      documentBytesDigest: descriptor.documentBytesDigest,
      dispatchIntentDigest: handle.dispatchIntentDigest,
      transportReceiptDigest: handle.transportReceiptDigest,
      responseSpoolDigest: handle.responseSpoolDigest,
      uploadedAt: handle.uploadedAt,
    }),
    'contentUploadReceiptDigest'
  );
  const deletionRequestProjection =
    createAgentCapabilityProbeProviderResourceDeletionRequestProjection({
      requestDigest: request.requestDigest,
      protocolFamily: handle.protocolFamily,
      providerResourceId: handle.providerResourceId,
      auxiliaryResourceIds: handle.auxiliaryResourceIds,
    });
  const deletionAuthorityReceipt =
    createAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt({
      resourceManifestDigest: resourceManifest.manifestDigest,
      deletionRequestProjection,
      registeredAt,
      expiresAt,
    });
  const authority = createAgentCapabilityProbeProviderResourceAuthority(
    request.probeProgram,
    {
      protocolFamily: handle.protocolFamily,
      providerConfigurationId:
        request.providerConfiguration.providerConfigurationId,
      modelId: request.modelLineage.modelId,
      modelLineageDigest: request.modelLineage.lineageDigest,
      adapterDigest: request.providerConfiguration.adapter.adapterDigest,
      providerResourceId: handle.providerResourceId,
      resourceManifestDigest: resourceManifest.manifestDigest,
      contentUploadReceiptDigest:
        contentUploadReceipt.contentUploadReceiptDigest,
      deletionAuthorityReceiptDigest:
        deletionAuthorityReceipt.deletionAuthorityReceiptDigest,
      registeredAt,
      expiresAt,
    }
  );
  const base = Object.freeze({
    format: resultFormat,
    version,
    requestDigest: request.requestDigest,
    resourceManifest,
    contentUploadReceipt,
    deletionAuthorityReceipt,
    providerResourceAuthority: authority,
  });
  return Object.freeze({
    ...base,
    resultDigest: digestAgentCanonicalValue(base),
  });
};

const stateRecord = (
  input: Omit<ResourceOwnerState, 'format' | 'version' | 'recordDigest'>
): ResourceOwnerState => {
  const base = Object.freeze({ format: stateFormat, version, ...input });
  return Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
};

const decodeState = (
  value: unknown,
  request: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  stageDigest: CanonicalDigest
): ResourceOwnerState => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'requestDigest',
      'stageDigest',
      'revision',
      'registeredAt',
      'expiresAt',
      'handle',
      'result',
      'recordDigest',
    ]) ||
    value.format !== stateFormat ||
    value.version !== version ||
    value.requestDigest !== request.requestDigest ||
    value.stageDigest !== stageDigest ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    (value.revision as number) > 9999 ||
    !isAgentControlInstant(value.registeredAt) ||
    value.expiresAt !== request.minimumExpiresAt ||
    value.recordDigest !==
      digestWithout(value as Readonly<Record<string, unknown>>, 'recordDigest')
  ) {
    return fail('state');
  }
  const handle = decodeHandle(value.handle);
  if (handle.requestDigest !== request.requestDigest) {
    return fail('state-handle');
  }
  const candidate = stateRecord({
    requestDigest: request.requestDigest,
    stageDigest,
    revision: value.revision as number,
    registeredAt: value.registeredAt as Instant,
    expiresAt: value.expiresAt as Instant,
    handle,
    result:
      value.result as AgentEvaluationCapabilityProbeProviderResourceResult | null,
  });
  if (!sameCanonicalJson(candidate, value)) return fail('state-recreate');
  if (candidate.result !== null) {
    createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest({
      namespaceId: request.namespaceId,
      repositoryCommit: request.repositoryCommit,
      registrationRequest: request,
      ownerImplementationDigest:
        PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_IMPLEMENTATION_DIGEST,
      stageDigest,
      resourceResult: candidate.result,
    });
  }
  return candidate;
};

const stateCanaryClean = (
  value: unknown,
  forbiddenCanaries: () => readonly string[]
): boolean => {
  const text = canonicalJsonText(value);
  return forbiddenCanaries().every(
    (canary) => canary.length >= 8 && !text.includes(canary)
  );
};

export const createProductionAgentEvaluationCapabilityProbeProviderResourceOwner =
  async (
    input: CreateProductionAgentEvaluationCapabilityProbeProviderResourceOwnerInput
  ): Promise<ProductionAgentEvaluationCapabilityProbeProviderResourceOwner> => {
    const stateDirectory = await initializeStateDirectory(
      input.stateDirectory,
      input.allowTemporaryStateDirectory === true,
      input.runnerTemporaryDirectory
    );
    if (
      typeof input.transport?.register !== 'function' ||
      typeof input.transport?.delete !== 'function' ||
      typeof input.transport?.cleanup !== 'function' ||
      typeof input.cleanupClient?.list !== 'function' ||
      typeof input.cleanupClient?.cleanup !== 'function' ||
      typeof input.forbiddenCanaries !== 'function'
    ) {
      return fail('input');
    }
    const clock = input.clock ?? currentInstant;
    const queues = new Map<string, Promise<unknown>>();
    let draining = false;

    const filesFor = async (requestDigest: CanonicalDigest) =>
      (await readdir(stateDirectory))
        .filter((name) => name.startsWith(`${requestDigest}.`))
        .sort(compareUnicodeCodePoints);

    const load = async (
      request: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
      stageDigest: CanonicalDigest
    ): Promise<ResourceOwnerState | null> => {
      const files = await filesFor(request.requestDigest);
      if (files.length === 0) return null;
      if (files.length > 32) return fail('state-revision-cap');
      const latest = files.at(-1)!;
      if (!digestFilePattern.test(latest)) return fail('state-file');
      const source = await readFile(join(stateDirectory, latest), 'utf8');
      if (textEncoder.encode(source).byteLength > maximumStateBytes) {
        return fail('state-bytes');
      }
      let value: unknown;
      try {
        value = JSON.parse(source) as unknown;
      } catch {
        return fail('state-json');
      }
      if (canonicalJsonText(value) !== source) return fail('state-canonical');
      return decodeState(value, request, stageDigest);
    };

    const persist = async (state: ResourceOwnerState): Promise<void> => {
      if (!stateCanaryClean(state, input.forbiddenCanaries)) {
        return fail('state-canary');
      }
      const bytes = canonicalJsonText(state);
      if (textEncoder.encode(bytes).byteLength > maximumStateBytes) {
        return fail('state-cap');
      }
      const name = `${state.requestDigest}.${state.revision
        .toString()
        .padStart(4, '0')}.json`;
      const target = join(stateDirectory, name);
      let file: Awaited<ReturnType<typeof open>> | undefined;
      try {
        file = await open(target, 'wx', 0o600);
        await file.writeFile(bytes, 'utf8');
        await file.sync();
      } catch (caught) {
        if ((caught as NodeJS.ErrnoException).code !== 'EEXIST') throw caught;
        const current = await readFile(target, 'utf8');
        if (current !== bytes) return fail('state-replay');
      } finally {
        await file?.close();
      }
    };

    const execute = async (inputValue: {
      request: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest;
      stageDigest: CanonicalDigest;
    }): Promise<AgentEvaluationCapabilityProbeProviderResourceResult> => {
      if (draining) return fail('draining');
      const request =
        decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest(
          inputValue.request
        );
      const expectedStage =
        digestAgentEvaluationCapabilityProbeProviderResourceStage(
          request.requestDigest,
          PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_IMPLEMENTATION_DIGEST
        );
      if (inputValue.stageDigest !== expectedStage) return fail('stage');
      const previous = queues.get(request.requestDigest) ?? Promise.resolve();
      const current = previous.then(async () => {
        let state = await load(request, expectedStage);
        if (state?.result) return state.result;
        if (state === null) {
          const registeredAt = canonicalInstant(clock());
          if (
            Date.parse(request.minimumExpiresAt) <= Date.parse(registeredAt) ||
            Date.parse(request.minimumExpiresAt) - Date.parse(registeredAt) >
              8 * 24 * 60 * 60 * 1_000
          ) {
            return fail('lifetime');
          }
          const protocolFamily = request.providerConfiguration.adapter
            .protocolFamily as SupportedProtocol;
          state = stateRecord({
            requestDigest: request.requestDigest,
            stageDigest: expectedStage,
            revision: 0,
            registeredAt,
            expiresAt: request.minimumExpiresAt,
            handle: createAgentEvaluationCapabilityProbeProviderResourceHandle({
              protocolFamily,
              requestDigest: request.requestDigest,
              lifecycle: 'preparing',
              providerResourceId: null,
              auxiliaryResourceIds: Object.freeze([]),
              requestProjectionDigests: Object.freeze([]),
              responseProjectionDigests: Object.freeze([]),
              dispatchIntentDigest: null,
              transportReceiptDigest: null,
              responseSpoolDigest: null,
              uploadedAt: null,
            }),
            result: null,
          });
          await persist(state);
        }
        const material = resolveAgentCapabilityProbePublicResource(
          request.probeProgram
        );
        if (material === null) return fail('material');
        let latest = state;
        const registration = await input.transport.register({
          request,
          material,
          registeredAt: state.registeredAt,
          expiresAt: state.expiresAt,
          existingHandle: state.handle,
          checkpoint: async (handle) => {
            if (
              handle.requestDigest !== request.requestDigest ||
              handle.protocolFamily !== state!.handle.protocolFamily
            ) {
              return fail('checkpoint-handle');
            }
            latest = stateRecord({
              requestDigest: request.requestDigest,
              stageDigest: expectedStage,
              revision: latest.revision + 1,
              registeredAt: latest.registeredAt,
              expiresAt: latest.expiresAt,
              handle,
              result: null,
            });
            await persist(latest);
          },
          signal: AbortSignal.timeout(120_000),
        });
        const handle = decodeHandle(registration.handle);
        if (
          handle.requestDigest !== request.requestDigest ||
          handle.lifecycle !== 'active'
        ) {
          return fail('registration');
        }
        const result = createResult(
          request,
          handle,
          latest.registeredAt,
          latest.expiresAt
        );
        createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest(
          {
            namespaceId: request.namespaceId,
            repositoryCommit: request.repositoryCommit,
            registrationRequest: request,
            ownerImplementationDigest:
              PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_IMPLEMENTATION_DIGEST,
            stageDigest: expectedStage,
            resourceResult: result,
          }
        );
        latest = stateRecord({
          requestDigest: request.requestDigest,
          stageDigest: expectedStage,
          revision: latest.revision + 1,
          registeredAt: latest.registeredAt,
          expiresAt: latest.expiresAt,
          handle,
          result,
        });
        await persist(latest);
        return result;
      });
      queues.set(request.requestDigest, current);
      try {
        return (await current) as AgentEvaluationCapabilityProbeProviderResourceResult;
      } finally {
        if (queues.get(request.requestDigest) === current) {
          queues.delete(request.requestDigest);
        }
      }
    };

    const executeCleanup = async (inputValue: {
      cleanupRequest: AgentCapabilityProbeProviderResourceCleanupAuthorityRequest;
      deletionAuthorityReceipt: AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt;
    }): Promise<AgentCapabilityProbeProviderResourceCleanupReceipt> => {
      if (
        !isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest(
          inputValue.cleanupRequest
        ) ||
        !isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(
          inputValue.deletionAuthorityReceipt
        ) ||
        inputValue.cleanupRequest.resourceRegistrationRequestDigest !==
          inputValue.deletionAuthorityReceipt.requestDigest ||
        inputValue.cleanupRequest.deletionAuthorityReceiptDigest !==
          inputValue.deletionAuthorityReceipt.deletionAuthorityReceiptDigest
      ) {
        return fail('cleanup-binding');
      }
      const queueKey = `cleanup\u0000${inputValue.cleanupRequest.cleanupRequestDigest}`;
      const previous = queues.get(queueKey) ?? Promise.resolve();
      const current = previous.then(async () => {
        const resourceResults = await input.transport.cleanup({
          deletionRequestProjection:
            inputValue.deletionAuthorityReceipt.deletionRequestProjection,
          signal: AbortSignal.timeout(125_000),
        });
        const receipt =
          createAgentCapabilityProbeProviderResourceCleanupReceipt({
            deletionAuthorityReceipt: inputValue.deletionAuthorityReceipt,
            resourceResults,
          });
        if (!stateCanaryClean(receipt, input.forbiddenCanaries)) {
          return fail('cleanup-canary');
        }
        return receipt;
      });
      queues.set(queueKey, current);
      try {
        return (await current) as AgentCapabilityProbeProviderResourceCleanupReceipt;
      } finally {
        if (queues.get(queueKey) === current) queues.delete(queueKey);
      }
    };

    let closePromise: ReturnType<
      ProductionAgentEvaluationCapabilityProbeProviderResourceOwner['close']
    > | null = null;
    const close = () => {
      closePromise ??= (async () => {
        draining = true;
        await Promise.all([...queues.values()]);
        const beforeCleanup = await input.cleanupClient.list(
          AbortSignal.timeout(30_000)
        );
        for (const record of beforeCleanup.records) {
          if (record.cleanupResponse === null) {
            await input.cleanupClient.cleanup(
              record.cleanupRequest,
              AbortSignal.timeout(150_000)
            );
          }
        }
        const afterCleanup = await input.cleanupClient.list(
          AbortSignal.timeout(30_000)
        );
        const beforeRequestDigests = beforeCleanup.records.map(
          ({ resourceRegistrationRequest }) =>
            resourceRegistrationRequest.requestDigest
        );
        const afterRequestDigests = afterCleanup.records.map(
          ({ resourceRegistrationRequest }) =>
            resourceRegistrationRequest.requestDigest
        );
        if (
          !sameCanonicalJson(beforeRequestDigests, afterRequestDigests) ||
          afterCleanup.records.some(
            ({ cleanupResponse }) => cleanupResponse === null
          )
        ) {
          return fail('cleanup-durable-closure');
        }
        const durablyCleaned = new Set(afterRequestDigests);
        const names = await readdir(stateDirectory);
        const latestByDigest = new Map<string, string>();
        for (const name of names) {
          const match = digestFilePattern.exec(name);
          if (!match) return fail('close-state-file');
          const digest = name.slice(0, 'sha256-'.length + 64);
          const previous = latestByDigest.get(digest);
          if (previous === undefined || name > previous) {
            latestByDigest.set(digest, name);
          }
        }
        const residuals: string[] = [];
        for (const [requestDigest, name] of latestByDigest) {
          if (durablyCleaned.has(requestDigest)) continue;
          const source = await readFile(join(stateDirectory, name), 'utf8');
          const value = JSON.parse(source) as ResourceOwnerState;
          const handle = decodeHandle(value.handle);
          try {
            await input.transport.delete({
              handle,
              signal: AbortSignal.timeout(30_000),
            });
          } catch {
            residuals.push(handle.providerResourceId ?? requestDigest);
          }
        }
        if (residuals.length > 0) {
          throw new TypeError(
            `G4_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESIDUAL: ${residuals.join(',')}`
          );
        }
        for (const name of names) {
          await rm(join(stateDirectory, name), { force: true });
        }
        return Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze([]) as readonly [],
          residualCanaryIds: Object.freeze([]) as readonly [],
        });
      })();
      closePromise = closePromise.catch((caught: unknown) => {
        closePromise = null;
        throw caught;
      });
      return closePromise;
    };

    return Object.freeze({
      port: Object.freeze({
        authorityId:
          PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_AUTHORITY_ID,
        implementationDigest:
          PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_IMPLEMENTATION_DIGEST,
        execute,
      }),
      cleanupPort: Object.freeze({
        authorityId:
          PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_AUTHORITY_ID,
        implementationDigest:
          PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_IMPLEMENTATION_DIGEST,
        execute: executeCleanup,
      }),
      close,
    });
  };

type ProviderExchange = Readonly<{
  requestProjectionDigest: CanonicalDigest;
  responseProjectionDigest: CanonicalDigest;
}>;

const defaultWait = async (
  milliseconds: number,
  signal: AbortSignal
): Promise<void> =>
  new Promise((resolvePromise, reject) => {
    if (signal.aborted) {
      reject(
        new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted
        )
      );
      return;
    }
    const timeout = setTimeout(resolvePromise, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(
          new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted
          )
        );
      },
      { once: true }
    );
  });

export const createEnvironmentAgentEvaluationCapabilityProbeProviderResourceTransport =
  (
    input: CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceTransportInput = {}
  ): AgentEvaluationCapabilityProbeProviderResourceTransport => {
    const clock = input.clock ?? currentInstant;
    const wait = input.wait ?? defaultWait;
    const providerTransport = createAgentEvaluationProviderResourceTransport({
      environment: input.environment ?? process.env,
      ...(input.secrets === undefined ? {} : { secrets: input.secrets }),
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
      ...(input.resolveHost === undefined
        ? {}
        : { resolveHost: input.resolveHost }),
      clock,
    });
    const exchangeFor = (
      result: AgentEvaluationHostedRetrievalProviderResourceMutationResult
    ): ProviderExchange =>
      Object.freeze({
        requestProjectionDigest: result.transport.requestProjectionDigest,
        responseProjectionDigest: result.transport.responseProjectionDigest,
      });

    const activeHandle = (
      handle: AgentEvaluationCapabilityProbeProviderResourceHandle,
      exchanges: readonly ProviderExchange[]
    ): AgentEvaluationCapabilityProbeProviderResourceHandle => {
      const completeExchanges = [
        ...handle.requestProjectionDigests.map(
          (requestProjectionDigest, index) =>
            Object.freeze({
              requestProjectionDigest,
              responseProjectionDigest:
                handle.responseProjectionDigests[index]!,
            })
        ),
        ...exchanges,
      ];
      const requestProjectionDigests = Object.freeze(
        completeExchanges.map(
          ({ requestProjectionDigest }) => requestProjectionDigest
        )
      );
      const responseProjectionDigests = Object.freeze(
        completeExchanges.map(
          ({ responseProjectionDigest }) => responseProjectionDigest
        )
      );
      return createAgentEvaluationCapabilityProbeProviderResourceHandle({
        protocolFamily: handle.protocolFamily,
        requestDigest: handle.requestDigest,
        lifecycle: 'active',
        providerResourceId: handle.providerResourceId,
        auxiliaryResourceIds: handle.auxiliaryResourceIds,
        requestProjectionDigests,
        responseProjectionDigests,
        dispatchIntentDigest: digestAgentCanonicalValue({
          format:
            'prodivix.agent-evaluation-capability-probe-provider-resource-dispatch-intents',
          version,
          requestProjectionDigests,
        }),
        transportReceiptDigest: digestAgentCanonicalValue({
          format:
            'prodivix.agent-evaluation-capability-probe-provider-resource-transport-receipts',
          version,
          responseProjectionDigests,
        }),
        responseSpoolDigest: digestAgentCanonicalValue({
          format:
            'prodivix.agent-evaluation-capability-probe-provider-resource-response-spool',
          version,
          exchangeSetDigest: digestAgentCanonicalValue(completeExchanges),
        }),
        uploadedAt: canonicalInstant(clock()),
      });
    };

    const preparingHandle = (
      handle: AgentEvaluationCapabilityProbeProviderResourceHandle,
      providerResourceId: string | null,
      auxiliaryResourceIds: readonly string[],
      exchanges: readonly ProviderExchange[]
    ): AgentEvaluationCapabilityProbeProviderResourceHandle =>
      createAgentEvaluationCapabilityProbeProviderResourceHandle({
        protocolFamily: handle.protocolFamily,
        requestDigest: handle.requestDigest,
        lifecycle: 'preparing',
        providerResourceId,
        auxiliaryResourceIds,
        requestProjectionDigests: Object.freeze([
          ...handle.requestProjectionDigests,
          ...exchanges.map(
            ({ requestProjectionDigest }) => requestProjectionDigest
          ),
        ]),
        responseProjectionDigests: Object.freeze([
          ...handle.responseProjectionDigests,
          ...exchanges.map(
            ({ responseProjectionDigest }) => responseProjectionDigest
          ),
        ]),
        dispatchIntentDigest: null,
        transportReceiptDigest: null,
        responseSpoolDigest: null,
        uploadedAt: null,
      });

    const registerOpenAi = async (
      registration: Parameters<
        AgentEvaluationCapabilityProbeProviderResourceTransport['register']
      >[0]
    ): Promise<AgentEvaluationCapabilityProbeProviderResourceRegistration> =>
      providerTransport.use(
        {
          protocolFamily: 'openai-responses',
          providerConfigurationId:
            registration.request.providerConfiguration.providerConfigurationId,
          secretRef:
            AGENT_EVALUATION_PROVIDER_DEFINITIONS['openai-responses'].secretRef,
          purpose: 'capability-probe-resource',
          runtimeZone: 'server',
          useId: `provider-resource.create.${registration.request.requestDigest.slice(7)}`,
        },
        async (session) => {
          let handle = registration.existingHandle;
          const exchanges: ProviderExchange[] = [];
          const content =
            registration.material.documentText ??
            registration.material.contentText;
          const contentBytes = textEncoder.encode(content);
          let fileId = handle.auxiliaryResourceIds[0];
          if (fileId === undefined) {
            const filename = `prodivix-capability-probe-${registration.request.requestDigest.slice(7, 23)}.txt`;
            const lifetimeSeconds = Math.min(
              8 * 24 * 60 * 60,
              Math.max(
                3_600,
                Math.ceil(
                  (Date.parse(registration.expiresAt) -
                    Date.parse(registration.registeredAt)) /
                    1_000
                )
              )
            );
            const uploaded =
              await executeAgentEvaluationCapabilityProbeProviderResourceMutation(
                session,
                {
                  providerIdempotencyKey: `${registration.request.requestDigest}.file`,
                  mutation: Object.freeze({
                    protocolFamily: 'openai-responses',
                    mutationKind: 'upload-content',
                    contentBytes,
                    filename,
                    lifetimeSeconds,
                    signal: registration.signal,
                  }),
                }
              );
            if (
              uploaded.resourceId === null ||
              uploaded.resourceRole !== 'auxiliary' ||
              uploaded.outcome !== 'uploaded'
            ) {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
              );
            }
            fileId = uploaded.resourceId;
            exchanges.push(exchangeFor(uploaded));
            handle = preparingHandle(
              handle,
              handle.providerResourceId,
              Object.freeze([fileId]),
              exchanges
            );
            await registration.checkpoint(handle);
            exchanges.length = 0;
          }
          let vectorStoreId = handle.providerResourceId;
          if (vectorStoreId === null) {
            const created =
              await executeAgentEvaluationCapabilityProbeProviderResourceMutation(
                session,
                {
                  providerIdempotencyKey: `${registration.request.requestDigest}.store`,
                  mutation: Object.freeze({
                    protocolFamily: 'openai-responses',
                    mutationKind: 'create-primary',
                    displayName: `prodivix-capability-probe-${registration.request.requestDigest.slice(7, 31)}`,
                    auxiliaryResourceId: fileId,
                    signal: registration.signal,
                  }),
                }
              );
            if (
              created.resourceId === null ||
              created.resourceRole !== 'primary' ||
              created.outcome !== 'created'
            ) {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
              );
            }
            vectorStoreId = created.resourceId;
            exchanges.push(exchangeFor(created));
            handle = preparingHandle(
              handle,
              vectorStoreId,
              Object.freeze([fileId]),
              exchanges
            );
            await registration.checkpoint(handle);
            exchanges.length = 0;
          }
          for (let poll = 0; poll < maximumPolls; poll += 1) {
            const observed =
              await executeAgentEvaluationCapabilityProbeProviderResourceReconciliation(
                session,
                Object.freeze({
                  reconciliationKind: 'read-resource',
                  protocolFamily: 'openai-responses',
                  resourceId: vectorStoreId,
                  resourceRole: 'primary',
                  signal: registration.signal,
                })
              );
            exchanges.push(exchangeFor(observed));
            if (observed.readiness === 'ready') {
              const active = activeHandle(handle, exchanges);
              await registration.checkpoint(active);
              return Object.freeze({ handle: active });
            }
            if (observed.readiness !== 'pending') {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
              );
            }
            await wait(1_000, registration.signal);
          }
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
          );
        }
      );

    const registerGemini = async (
      registration: Parameters<
        AgentEvaluationCapabilityProbeProviderResourceTransport['register']
      >[0]
    ): Promise<AgentEvaluationCapabilityProbeProviderResourceRegistration> =>
      providerTransport.use(
        {
          protocolFamily: 'gemini-interactions',
          providerConfigurationId:
            registration.request.providerConfiguration.providerConfigurationId,
          secretRef:
            AGENT_EVALUATION_PROVIDER_DEFINITIONS['gemini-interactions']
              .secretRef,
          purpose: 'capability-probe-resource',
          runtimeZone: 'server',
          useId: `provider-resource.create.${registration.request.requestDigest.slice(7)}`,
        },
        async (session) => {
          let handle = registration.existingHandle;
          const exchanges: ProviderExchange[] = [];
          const displayName = `prodivix-probe-${registration.request.requestDigest.slice(7, 31)}`;
          let storeName = handle.providerResourceId;
          if (storeName === null) {
            let pageToken: string | undefined;
            const matchingStoreNames: string[] = [];
            for (let page = 0; page < 16; page += 1) {
              const listed =
                await executeAgentEvaluationCapabilityProbeProviderResourceReconciliation(
                  session,
                  Object.freeze({
                    reconciliationKind: 'list-primary',
                    protocolFamily: 'gemini-interactions',
                    displayName,
                    ...(pageToken === undefined ? {} : { pageToken }),
                    signal: registration.signal,
                  })
                );
              exchanges.push(exchangeFor(listed));
              if (listed.matchingResourceId !== null) {
                matchingStoreNames.push(listed.matchingResourceId);
              }
              if (matchingStoreNames.length > 1) {
                throw new AgentEvaluationRunnerError(
                  AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
                );
              }
              if (listed.nextPageToken === null) break;
              pageToken = listed.nextPageToken;
              if (page === 15) {
                throw new AgentEvaluationRunnerError(
                  AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge
                );
              }
            }
            storeName = matchingStoreNames[0] ?? null;
          }
          if (storeName === null) {
            const created =
              await executeAgentEvaluationCapabilityProbeProviderResourceMutation(
                session,
                {
                  mutation: Object.freeze({
                    protocolFamily: 'gemini-interactions',
                    mutationKind: 'create-primary',
                    displayName,
                    signal: registration.signal,
                  }),
                }
              );
            if (
              created.resourceId === null ||
              created.resourceRole !== 'primary' ||
              created.outcome !== 'created'
            ) {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
              );
            }
            storeName = created.resourceId;
            exchanges.push(exchangeFor(created));
            handle = preparingHandle(
              handle,
              storeName,
              Object.freeze([]),
              exchanges
            );
            await registration.checkpoint(handle);
            exchanges.length = 0;
          } else if (handle.providerResourceId === null) {
            handle = preparingHandle(
              handle,
              storeName,
              Object.freeze([]),
              exchanges
            );
            await registration.checkpoint(handle);
            exchanges.length = 0;
          }
          const content =
            registration.material.documentText ??
            registration.material.contentText;
          const contentBytes = textEncoder.encode(content);
          let observed =
            await executeAgentEvaluationCapabilityProbeProviderResourceReconciliation(
              session,
              Object.freeze({
                reconciliationKind: 'read-resource',
                protocolFamily: 'gemini-interactions',
                resourceId: storeName,
                resourceRole: 'primary',
                signal: registration.signal,
              })
            );
          exchanges.push(exchangeFor(observed));
          if (observed.readiness !== 'ready') {
            if (observed.readiness === 'empty') {
              const started =
                await executeAgentEvaluationCapabilityProbeProviderResourceMutation(
                  session,
                  {
                    mutation: Object.freeze({
                      protocolFamily: 'gemini-interactions',
                      mutationKind: 'upload-content-start',
                      providerResourceId: storeName,
                      filename: `prodivix-probe-${registration.request.requestDigest.slice(7, 23)}.txt`,
                      contentBytes: contentBytes.byteLength,
                      signal: registration.signal,
                    }),
                  }
                );
              exchanges.push(exchangeFor(started));
              if (started.continuationEndpoint === null) {
                throw new AgentEvaluationRunnerError(
                  AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
                );
              }
              const uploaded =
                await executeAgentEvaluationCapabilityProbeProviderResourceMutation(
                  session,
                  {
                    mutation: Object.freeze({
                      protocolFamily: 'gemini-interactions',
                      mutationKind: 'upload-content-finalize',
                      providerResourceId: storeName,
                      continuationEndpoint: started.continuationEndpoint,
                      contentBytes,
                      signal: registration.signal,
                    }),
                  }
                );
              exchanges.push(exchangeFor(uploaded));
            } else if (observed.readiness !== 'pending') {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
              );
            }
            for (let poll = 0; poll < maximumPolls; poll += 1) {
              await wait(1_000, registration.signal);
              observed =
                await executeAgentEvaluationCapabilityProbeProviderResourceReconciliation(
                  session,
                  Object.freeze({
                    reconciliationKind: 'read-resource',
                    protocolFamily: 'gemini-interactions',
                    resourceId: storeName,
                    resourceRole: 'primary',
                    signal: registration.signal,
                  })
                );
              exchanges.push(exchangeFor(observed));
              if (observed.readiness === 'ready') break;
              if (observed.readiness !== 'pending') {
                throw new AgentEvaluationRunnerError(
                  AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
                );
              }
            }
          }
          if (observed.readiness !== 'ready') {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
            );
          }
          const active = activeHandle(handle, exchanges);
          await registration.checkpoint(active);
          return Object.freeze({ handle: active });
        }
      );

    const deleteResources = async (inputValue: {
      protocolFamily: SupportedProtocol;
      requestDigest: CanonicalDigest;
      providerResourceId: string | null;
      auxiliaryResourceIds: readonly string[];
      signal: AbortSignal;
    }): Promise<
      readonly AgentCapabilityProbeProviderResourceCleanupResourceResult[]
    > =>
      providerTransport.use(
        {
          protocolFamily: inputValue.protocolFamily,
          providerConfigurationId:
            AGENT_EVALUATION_PROVIDER_DEFINITIONS[inputValue.protocolFamily]
              .providerConfigurationId,
          secretRef:
            AGENT_EVALUATION_PROVIDER_DEFINITIONS[inputValue.protocolFamily]
              .secretRef,
          purpose: 'capability-probe-resource',
          runtimeZone: 'server',
          useId: `provider-resource.delete.${inputValue.requestDigest.slice(7)}`,
        },
        async (session) => {
          const resources: Array<
            Readonly<{
              resourceId: string;
              resourceRole: 'auxiliary' | 'primary';
            }>
          > = [];
          if (inputValue.providerResourceId !== null) {
            if (inputValue.protocolFamily === 'openai-responses') {
              resources.push(
                Object.freeze({
                  resourceId: inputValue.providerResourceId,
                  resourceRole: 'primary' as const,
                })
              );
            } else {
              if (
                !/^fileSearchStores\/[a-z0-9-]{1,64}$/u.test(
                  inputValue.providerResourceId
                )
              ) {
                throw new AgentEvaluationRunnerError(
                  AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
                );
              }
              resources.push(
                Object.freeze({
                  resourceId: inputValue.providerResourceId,
                  resourceRole: 'primary' as const,
                })
              );
            }
          }
          if (inputValue.protocolFamily === 'openai-responses') {
            for (const resourceId of inputValue.auxiliaryResourceIds) {
              resources.push(
                Object.freeze({
                  resourceId,
                  resourceRole: 'auxiliary' as const,
                })
              );
            }
          } else if (inputValue.auxiliaryResourceIds.length !== 0) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
            );
          }
          const results: AgentCapabilityProbeProviderResourceCleanupResourceResult[] =
            [];
          for (const resource of resources) {
            const deleted =
              await executeAgentEvaluationCapabilityProbeProviderResourceMutation(
                session,
                {
                  mutation: Object.freeze({
                    protocolFamily: inputValue.protocolFamily,
                    mutationKind: 'delete-resource',
                    resourceId: resource.resourceId,
                    resourceRole: resource.resourceRole,
                    signal: inputValue.signal,
                  }),
                }
              );
            const dispatchIntentDigest = digestAgentCanonicalValue({
              format:
                'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-dispatch-intent',
              version,
              requestDigest: inputValue.requestDigest,
              resourceId: resource.resourceId,
              resourceRole: resource.resourceRole,
              requestProjectionDigest:
                deleted.transport.requestProjectionDigest,
            });
            const transportReceiptDigest = digestAgentCanonicalValue({
              format:
                'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-transport-receipt',
              version,
              dispatchIntentDigest,
              responseProjectionDigest:
                deleted.transport.responseProjectionDigest,
              status: deleted.transport.status,
            });
            results.push(
              createAgentCapabilityProbeProviderResourceCleanupResourceResult({
                resourceId: resource.resourceId,
                resourceRole: resource.resourceRole,
                outcome:
                  deleted.outcome === 'already-absent'
                    ? 'already-absent'
                    : 'deleted',
                dispatchIntentDigest,
                transportReceiptDigest,
                completedAt: canonicalInstant(clock()),
              })
            );
          }
          return Object.freeze(results);
        }
      );

    return Object.freeze({
      register: async (registration) => {
        if (
          registration.signal.aborted ||
          registration.existingHandle.requestDigest !==
            registration.request.requestDigest ||
          registration.existingHandle.protocolFamily !==
            registration.request.providerConfiguration.adapter.protocolFamily
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
          );
        }
        return registration.existingHandle.protocolFamily === 'openai-responses'
          ? registerOpenAi(registration)
          : registerGemini(registration);
      },
      delete: async ({ handle, signal }) => {
        await deleteResources({
          protocolFamily: handle.protocolFamily,
          requestDigest: handle.requestDigest,
          providerResourceId: handle.providerResourceId,
          auxiliaryResourceIds: handle.auxiliaryResourceIds,
          signal,
        });
      },
      cleanup: async ({ deletionRequestProjection, signal }) => {
        if (
          signal.aborted ||
          !isAgentCapabilityProbeProviderResourceDeletionRequestProjection(
            deletionRequestProjection
          ) ||
          (deletionRequestProjection.protocolFamily !== 'openai-responses' &&
            deletionRequestProjection.protocolFamily !== 'gemini-interactions')
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
          );
        }
        return deleteResources({
          protocolFamily: deletionRequestProjection.protocolFamily,
          requestDigest: deletionRequestProjection.requestDigest,
          providerResourceId: deletionRequestProjection.providerResourceId,
          auxiliaryResourceIds: deletionRequestProjection.auxiliaryResourceIds,
          signal,
        });
      },
    });
  };
