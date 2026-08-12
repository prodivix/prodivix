import { randomUUID } from 'node:crypto';
import {
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, parse, relative, resolve } from 'node:path';

import {
  digestAgentCanonicalValue,
  inspectAgentControlJson,
  isAgentCanonicalDigest,
  isAgentControlInstant,
  type AgentEvaluationCapabilityEffectSourceReceipt,
  type AgentEvaluationProviderCapabilitySharedObservedFact,
  type AgentJsonValue,
  type AgentProductionEvaluationRuntimeFactSourceIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import {
  AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_FORMAT,
  AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_VERSION,
  decodeAgentEvaluationProductionRuntimeFactSourceRegistryHealth,
  type AgentEvaluationProductionRuntimeFactSourceRegistryHealth,
} from './productionRuntimeFactSourceHealthRegistry';
import {
  createAgentEvaluationProductionSharedEffectResult,
  createAgentEvaluationProductionSharedEffectStage,
  createProductionAgentEvaluationSharedEffectOwner,
  decodeAgentEvaluationProductionSharedEffectResult,
  decodeAgentEvaluationProductionSharedEffectStage,
  type AgentEvaluationProductionSharedEffectBinding,
  type AgentEvaluationProductionSharedEffectDurableRegistry,
  type AgentEvaluationProductionSharedEffectHealthInput,
  type AgentEvaluationProductionSharedEffectResult,
  type AgentEvaluationProductionSharedEffectStage,
  type ProductionAgentEvaluationSharedEffectOwner,
} from './productionSharedEffectOwner';

export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXECUTION_CLAIM_FORMAT =
  'prodivix.agent-evaluation-production-shared-effect-execution-claim' as const;
export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_OWNER_READINESS_FORMAT =
  'prodivix.agent-evaluation-production-shared-effect-owner-readiness' as const;
export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_READINESS_CLAIM_FORMAT =
  'prodivix.agent-evaluation-production-shared-effect-readiness-claim' as const;
export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_READINESS_ENVELOPE_FORMAT =
  'prodivix.agent-evaluation-production-shared-effect-readiness-envelope' as const;
export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_CAPACITY_SLOT_FORMAT =
  'prodivix.agent-evaluation-production-shared-effect-capacity-slot' as const;
export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_DURABLE_REGISTRY_VERSION =
  1 as const;
export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_MAXIMUM_RECORDS =
  5_880 as const;
export const AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_MAXIMUM_READINESS_RECORDS =
  15 as const;

const maximumStageBytes = 65_536;
const maximumClaimBytes = 16_384;
const maximumResultBytes = 16_842_752;
const maximumReadinessBytes = 65_536;
const maximumCapacitySlotBytes = 4_096;
const maximumRegistrationLifetimeMs = 8 * 24 * 60 * 60 * 1_000;

export type AgentEvaluationProductionSharedEffectExecutionClaim = Readonly<{
  format: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXECUTION_CLAIM_FORMAT;
  version: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_DURABLE_REGISTRY_VERSION;
  authorityRequestDigest: CanonicalDigest;
  preEffectIntentDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  sourceIdentityDigest: CanonicalDigest;
  claimedAt: string;
  claimDigest: CanonicalDigest;
}>;

export type AgentEvaluationProductionSharedEffectOwnerReadinessReceipt =
  Readonly<{
    format: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_OWNER_READINESS_FORMAT;
    version: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_DURABLE_REGISTRY_VERSION;
    registrationRequestDigest: CanonicalDigest;
    expectedIdentityDigest: CanonicalDigest;
    sourceAuthorityKind: 'shared-durable-capability';
    sourceKind:
      'sealed-provider-response-metadata' | 'sealed-hosted-owner-result';
    sourceAuthorityId: string;
    sourceAuthorityImplementationDigest: CanonicalDigest;
    routeBinding: string;
    capabilityProfileId: string;
    capabilityProfileDigest: CanonicalDigest;
    capabilityId: string;
    protocolFamily: string;
    providerConfigurationId: string;
    modelId: string;
    modelLineageDigest: CanonicalDigest;
    adapterDigest: CanonicalDigest;
    registrationAuthorityIssuerId: string;
    status: 'ready';
    checkedAt: string;
    expiresAt: string;
    receiptDigest: CanonicalDigest;
  }>;

export type AgentEvaluationProductionSharedEffectReadinessClaim = Readonly<{
  format: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_READINESS_CLAIM_FORMAT;
  version: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_DURABLE_REGISTRY_VERSION;
  registrationRequestDigest: CanonicalDigest;
  expectedIdentityDigest: CanonicalDigest;
  claimedAt: string;
  claimDigest: CanonicalDigest;
}>;

export type AgentEvaluationProductionSharedEffectReadinessEnvelope = Readonly<{
  format: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_READINESS_ENVELOPE_FORMAT;
  version: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_DURABLE_REGISTRY_VERSION;
  registrationRequestDigest: CanonicalDigest;
  expectedIdentityDigest: CanonicalDigest;
  ownerReadinessReceipt: AgentEvaluationProductionSharedEffectOwnerReadinessReceipt;
  ownerReadinessReceiptDigest: CanonicalDigest;
  registryHealth: AgentEvaluationProductionRuntimeFactSourceRegistryHealth;
  registryHealthDigest: CanonicalDigest;
  envelopeDigest: CanonicalDigest;
}>;

export type AgentEvaluationProductionSharedEffectCapacitySlot = Readonly<{
  format: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_CAPACITY_SLOT_FORMAT;
  version: typeof AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_DURABLE_REGISTRY_VERSION;
  family: 'effect' | 'readiness';
  identityDigest: CanonicalDigest;
  slotIndex: number;
  slotDigest: CanonicalDigest;
}>;

export type AgentEvaluationProductionSharedEffectExecutionResultInput =
  Readonly<{
    effectSourceReceipt: AgentEvaluationCapabilityEffectSourceReceipt;
    effectSourceFact: AgentEvaluationProviderCapabilitySharedObservedFact | null;
    businessResult: AgentJsonValue;
  }>;

/**
 * A concrete adapter implements the provider-metadata or hosted-effect call and
 * owns the external state/vault boundary. The file registry calls execute once
 * after a durable claim and never calls it from reconciliation.
 */
export interface AgentEvaluationProductionSharedEffectExecutor {
  readonly authorityKind: 'production-provider-metadata-or-hosted-effect-owner';
  execute(
    binding: AgentEvaluationProductionSharedEffectBinding,
    stage: AgentEvaluationProductionSharedEffectStage
  ): Promise<
    AgentEvaluationProductionSharedEffectExecutionResultInput | undefined
  >;
  checkReadiness(
    input: AgentEvaluationProductionSharedEffectHealthInput
  ): Promise<
    AgentEvaluationProductionSharedEffectOwnerReadinessReceipt | undefined
  >;
  close(): Promise<
    Readonly<{
      status: 'clean';
      residualResourceIds: readonly [];
      residualCanaryIds: readonly [];
    }>
  >;
}

export type CreateFileProductionAgentEvaluationSharedEffectDurableRegistryInput =
  Readonly<{
    stateDirectory: string;
    executor: AgentEvaluationProductionSharedEffectExecutor;
    forbiddenCanaries: () => readonly string[];
    allowTemporaryStateDirectory?: boolean;
    runnerTemporaryDirectory?: string;
    clock?: () => Date;
  }>;

export type CreateFileProductionAgentEvaluationSharedEffectOwnerInput =
  CreateFileProductionAgentEvaluationSharedEffectDurableRegistryInput &
    Readonly<{
      expectedSourceIdentities: readonly AgentProductionEvaluationRuntimeFactSourceIdentity[];
    }>;

export type FileProductionAgentEvaluationSharedEffectOwner =
  ProductionAgentEvaluationSharedEffectOwner &
    Readonly<{
      registry: AgentEvaluationProductionSharedEffectDurableRegistry;
    }>;

const fail = (code: string): never => {
  throw new TypeError(`G4_SHARED_EFFECT_DURABLE_REGISTRY_INVALID: ${code}`);
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

const boundedCanonical = (value: unknown, maximumBytes: number): boolean => {
  try {
    return (
      new TextEncoder().encode(canonicalJsonText(value)).byteLength <=
      maximumBytes
    );
  } catch {
    return false;
  }
};

const pathIsWithin = (parent: string, child: string): boolean => {
  const path = relative(resolve(parent), resolve(child));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};

const safeDigestSegment = (value: CanonicalDigest): string => {
  if (!isAgentCanonicalDigest(value)) return fail('path-digest');
  return value.slice('sha256-'.length);
};

const cleanReceipt = Object.freeze({
  status: 'clean' as const,
  residualResourceIds: Object.freeze([]) as readonly [],
  residualCanaryIds: Object.freeze([]) as readonly [],
});

class KeyedSerialQueue {
  readonly #tails = new Map<string, Promise<void>>();

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.#tails.set(key, tail);
    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.#tails.get(key) === tail) this.#tails.delete(key);
    }
  }

  async drain(): Promise<void> {
    await Promise.all([...this.#tails.values()]);
  }

  get size(): number {
    return this.#tails.size;
  }
}

const ensureStateRoot = async (
  source: string,
  allowTemporary: boolean,
  runnerTemporary?: string
): Promise<
  Readonly<{
    root: string;
    stages: string;
    claims: string;
    results: string;
    readiness: string;
    effectCapacity: string;
    readinessCapacity: string;
  }>
> => {
  if (
    typeof source !== 'string' ||
    source !== source.trim() ||
    !isAbsolute(source)
  ) {
    return fail('state-directory-absolute');
  }
  const parent = resolve(source);
  if (parent === parse(parent).root) return fail('state-directory-root');
  if (
    !allowTemporary &&
    (pathIsWithin(tmpdir(), parent) ||
      (runnerTemporary !== undefined &&
        isAbsolute(runnerTemporary) &&
        pathIsWithin(runnerTemporary, parent)))
  ) {
    return fail('shared-durable-directory-required');
  }
  const root = join(parent, 'shared-effect-owner-v1');
  const directories = Object.freeze({
    root,
    stages: join(root, 'stages'),
    claims: join(root, 'claims'),
    results: join(root, 'results'),
    readiness: join(root, 'readiness'),
    effectCapacity: join(root, 'capacity-effect'),
    readinessCapacity: join(root, 'capacity-readiness'),
  });
  for (const path of Object.values(directories)) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    const metadata = await lstat(path);
    const concrete = await realpath(path);
    const exactConcretePath =
      process.platform === 'win32'
        ? concrete.toLowerCase() === resolve(path).toLowerCase()
        : concrete === resolve(path);
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      !exactConcretePath
    ) {
      return fail('state-directory-concrete');
    }
  }
  return directories;
};

const decodeJsonBytes = (source: Uint8Array, maximumBytes: number): unknown => {
  if (source.byteLength < 1 || source.byteLength > maximumBytes) {
    return fail('record-byte-budget');
  }
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(source)
    );
  } catch {
    return fail('record-json');
  }
  if (canonicalJsonText(value) !== new TextDecoder().decode(source)) {
    return fail('record-canonical-bytes');
  }
  return value;
};

const readCanonical = async (
  path: string,
  maximumBytes: number
): Promise<unknown | undefined> => {
  try {
    const metadata = await lstat(path);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size < 1 ||
      metadata.size > maximumBytes
    ) {
      return fail('record-concrete-file');
    }
    const source = await readFile(path);
    try {
      return decodeJsonBytes(source, maximumBytes);
    } finally {
      source.fill(0);
    }
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw caught;
  }
};

const writeCanonicalOnce = async (
  path: string,
  value: unknown,
  maximumBytes: number,
  activeTemporaryPaths: Set<string>
): Promise<boolean> => {
  const source = new TextEncoder().encode(canonicalJsonText(value));
  if (source.byteLength < 1 || source.byteLength > maximumBytes) {
    source.fill(0);
    return fail('record-byte-budget');
  }
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  activeTemporaryPaths.add(temporary);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(source);
    await handle.sync();
    await handle.close();
    handle = undefined;
    try {
      await link(temporary, path);
    } catch (caught) {
      if ((caught as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw caught;
    }
    if (process.platform !== 'win32') {
      handle = await open(dirname(path), 'r');
      await handle.sync();
      await handle.close();
      handle = undefined;
    }
    return true;
  } finally {
    source.fill(0);
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
    activeTemporaryPaths.delete(temporary);
  }
};

const claimKeys = Object.freeze([
  'format',
  'version',
  'authorityRequestDigest',
  'preEffectIntentDigest',
  'stageDigest',
  'sourceIdentityDigest',
  'claimedAt',
  'claimDigest',
] as const);

const createClaim = (
  binding: AgentEvaluationProductionSharedEffectBinding,
  stage: AgentEvaluationProductionSharedEffectStage,
  claimedAt: string
): AgentEvaluationProductionSharedEffectExecutionClaim => {
  if (
    !isAgentControlInstant(claimedAt) ||
    Date.parse(claimedAt) < Date.parse(stage.stagedAt) ||
    Date.parse(claimedAt) > Date.parse(stage.expiresAt)
  ) {
    return fail('claim-time');
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXECUTION_CLAIM_FORMAT,
    version: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_DURABLE_REGISTRY_VERSION,
    authorityRequestDigest: binding.authorityRequestDigest,
    preEffectIntentDigest: binding.toolInput.preEffectIntent.intentDigest,
    stageDigest: stage.stageDigest,
    sourceIdentityDigest: binding.sourceIdentityDigest,
    claimedAt,
  });
  return Object.freeze({
    ...base,
    claimDigest: digestAgentCanonicalValue(base),
  });
};

const decodeClaim = (
  value: unknown,
  binding: AgentEvaluationProductionSharedEffectBinding,
  stage: AgentEvaluationProductionSharedEffectStage
): AgentEvaluationProductionSharedEffectExecutionClaim => {
  if (
    !exactRecord(value, claimKeys) ||
    !isAgentControlInstant(value.claimedAt)
  ) {
    return fail('claim-shape');
  }
  const recreated = createClaim(binding, stage, value.claimedAt);
  if (
    !sameCanonicalJson(value, recreated) ||
    !boundedCanonical(value, maximumClaimBytes) ||
    inspectAgentControlJson(value, maximumClaimBytes).length > 0
  ) {
    return fail('claim-binding');
  }
  return recreated;
};

const capacitySlotKeys = Object.freeze([
  'format',
  'version',
  'family',
  'identityDigest',
  'slotIndex',
  'slotDigest',
] as const);

const createCapacitySlot = (
  family: AgentEvaluationProductionSharedEffectCapacitySlot['family'],
  identityDigest: CanonicalDigest,
  slotIndex: number,
  maximumRecords: number
): AgentEvaluationProductionSharedEffectCapacitySlot => {
  if (
    !isAgentCanonicalDigest(identityDigest) ||
    !Number.isSafeInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= maximumRecords
  ) {
    return fail('capacity-slot-input');
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_CAPACITY_SLOT_FORMAT,
    version: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_DURABLE_REGISTRY_VERSION,
    family,
    identityDigest,
    slotIndex,
  });
  return Object.freeze({
    ...base,
    slotDigest: digestAgentCanonicalValue(base),
  });
};

const decodeCapacitySlot = (
  value: unknown,
  family: AgentEvaluationProductionSharedEffectCapacitySlot['family'],
  maximumRecords: number
): AgentEvaluationProductionSharedEffectCapacitySlot => {
  if (
    !exactRecord(value, capacitySlotKeys) ||
    !isAgentCanonicalDigest(value.identityDigest) ||
    typeof value.slotIndex !== 'number' ||
    !Number.isSafeInteger(value.slotIndex)
  ) {
    return fail('capacity-slot-shape');
  }
  const recreated = createCapacitySlot(
    family,
    value.identityDigest,
    value.slotIndex,
    maximumRecords
  );
  if (
    !sameCanonicalJson(value, recreated) ||
    !boundedCanonical(value, maximumCapacitySlotBytes)
  ) {
    return fail('capacity-slot-binding');
  }
  return recreated;
};

const readinessClaimKeys = Object.freeze([
  'format',
  'version',
  'registrationRequestDigest',
  'expectedIdentityDigest',
  'claimedAt',
  'claimDigest',
] as const);

const createReadinessClaim = (
  input: AgentEvaluationProductionSharedEffectHealthInput,
  claimedAt: string
): AgentEvaluationProductionSharedEffectReadinessClaim => {
  if (!isAgentControlInstant(claimedAt)) return fail('readiness-claim-time');
  const base = Object.freeze({
    format: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_READINESS_CLAIM_FORMAT,
    version: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_DURABLE_REGISTRY_VERSION,
    registrationRequestDigest: input.registrationRequest.requestDigest,
    expectedIdentityDigest: input.lookup.expectedIdentityDigest,
    claimedAt,
  });
  return Object.freeze({
    ...base,
    claimDigest: digestAgentCanonicalValue(base),
  });
};

const decodeReadinessClaim = (
  value: unknown,
  input: AgentEvaluationProductionSharedEffectHealthInput
): AgentEvaluationProductionSharedEffectReadinessClaim => {
  if (
    !exactRecord(value, readinessClaimKeys) ||
    !isAgentControlInstant(value.claimedAt)
  ) {
    return fail('readiness-claim-shape');
  }
  const recreated = createReadinessClaim(input, value.claimedAt);
  if (
    !sameCanonicalJson(value, recreated) ||
    !boundedCanonical(value, maximumClaimBytes) ||
    inspectAgentControlJson(value, maximumClaimBytes).length > 0
  ) {
    return fail('readiness-claim-binding');
  }
  return recreated;
};

const ownerReadinessKeys = Object.freeze([
  'format',
  'version',
  'registrationRequestDigest',
  'expectedIdentityDigest',
  'sourceAuthorityKind',
  'sourceKind',
  'sourceAuthorityId',
  'sourceAuthorityImplementationDigest',
  'routeBinding',
  'capabilityProfileId',
  'capabilityProfileDigest',
  'capabilityId',
  'protocolFamily',
  'providerConfigurationId',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'registrationAuthorityIssuerId',
  'status',
  'checkedAt',
  'expiresAt',
  'receiptDigest',
] as const);

export const createAgentEvaluationProductionSharedEffectOwnerReadinessReceipt =
  (
    input: AgentEvaluationProductionSharedEffectHealthInput,
    timing: Readonly<{ checkedAt: string; expiresAt: string }>
  ): AgentEvaluationProductionSharedEffectOwnerReadinessReceipt => {
    const identity = input.sourceIdentity;
    if (
      !isAgentControlInstant(timing.checkedAt) ||
      !isAgentControlInstant(timing.expiresAt) ||
      Date.parse(timing.expiresAt) <= Date.parse(timing.checkedAt) ||
      Date.parse(timing.expiresAt) <
        Date.parse(input.lookup.minimumExpiresAt) ||
      Date.parse(timing.expiresAt) - Date.parse(timing.checkedAt) >
        maximumRegistrationLifetimeMs
    ) {
      return fail('owner-readiness-time');
    }
    const base = Object.freeze({
      format: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_OWNER_READINESS_FORMAT,
      version:
        AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_DURABLE_REGISTRY_VERSION,
      registrationRequestDigest: input.registrationRequest.requestDigest,
      expectedIdentityDigest: digestAgentCanonicalValue(identity),
      sourceAuthorityKind: identity.kind,
      sourceKind: identity.sourceKind,
      sourceAuthorityId: identity.sourceAuthorityId,
      sourceAuthorityImplementationDigest:
        identity.sourceAuthorityImplementationDigest,
      routeBinding: identity.routeBinding,
      capabilityProfileId: identity.capabilityProfileId,
      capabilityProfileDigest: identity.capabilityProfileDigest,
      capabilityId: identity.capabilityId,
      protocolFamily: identity.protocolFamily,
      providerConfigurationId: identity.providerConfigurationId,
      modelId: identity.modelId,
      modelLineageDigest: identity.modelLineageDigest,
      adapterDigest: identity.adapterDigest,
      registrationAuthorityIssuerId: identity.registrationAuthorityIssuerId,
      status: 'ready' as const,
      checkedAt: timing.checkedAt,
      expiresAt: timing.expiresAt,
    });
    const receipt = Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    });
    if (
      !boundedCanonical(receipt, maximumReadinessBytes) ||
      inspectAgentControlJson(receipt, maximumReadinessBytes).length > 0
    ) {
      return fail('owner-readiness-safety');
    }
    return receipt;
  };

const decodeOwnerReadiness = (
  value: unknown,
  input: AgentEvaluationProductionSharedEffectHealthInput,
  now: Date
): AgentEvaluationProductionSharedEffectOwnerReadinessReceipt => {
  if (
    !exactRecord(value, ownerReadinessKeys) ||
    !isAgentControlInstant(value.checkedAt) ||
    !isAgentControlInstant(value.expiresAt)
  ) {
    return fail('owner-readiness-shape');
  }
  const recreated =
    createAgentEvaluationProductionSharedEffectOwnerReadinessReceipt(input, {
      checkedAt: value.checkedAt,
      expiresAt: value.expiresAt,
    });
  if (
    !sameCanonicalJson(value, recreated) ||
    Date.parse(recreated.checkedAt) > now.getTime() ||
    Date.parse(recreated.expiresAt) <= now.getTime()
  ) {
    return fail('owner-readiness-binding');
  }
  return recreated;
};

const createRegistryHealth = (
  input: AgentEvaluationProductionSharedEffectHealthInput,
  ownerReadinessReceipt: AgentEvaluationProductionSharedEffectOwnerReadinessReceipt
): AgentEvaluationProductionRuntimeFactSourceRegistryHealth => {
  const identity = input.sourceIdentity;
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_FORMAT,
    version:
      AGENT_EVALUATION_PRODUCTION_RUNTIME_FACT_SOURCE_REGISTRY_HEALTH_VERSION,
    namespaceId: input.lookup.namespaceId,
    repositoryCommit: input.lookup.repositoryCommit,
    registrationRequestDigest: input.registrationRequest.requestDigest,
    expectedIdentityDigest: input.lookup.expectedIdentityDigest,
    minimumExpiresAt: input.lookup.minimumExpiresAt,
    sourceAuthorityKind: identity.kind,
    sourceKind: identity.sourceKind,
    sourceAuthorityId: identity.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      identity.sourceAuthorityImplementationDigest,
    effectOwnerAuthorityId: identity.sourceAuthorityId,
    effectOwnerImplementationDigest:
      identity.sourceAuthorityImplementationDigest,
    routeBinding: identity.routeBinding,
    capabilityProfileId: identity.capabilityProfileId,
    capabilityProfileDigest: identity.capabilityProfileDigest,
    capabilityId: identity.capabilityId,
    protocolFamily: identity.protocolFamily,
    providerConfigurationId: identity.providerConfigurationId,
    modelId: identity.modelId,
    modelLineageDigest: identity.modelLineageDigest,
    adapterDigest: identity.adapterDigest,
    registrationAuthorityIssuerId: identity.registrationAuthorityIssuerId,
    status: 'ready' as const,
    checkedAt: ownerReadinessReceipt.checkedAt,
    expiresAt: ownerReadinessReceipt.expiresAt,
    effectOwnerReadinessReceiptDigest: ownerReadinessReceipt.receiptDigest,
  });
  return Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
};

const readinessEnvelopeKeys = Object.freeze([
  'format',
  'version',
  'registrationRequestDigest',
  'expectedIdentityDigest',
  'ownerReadinessReceipt',
  'ownerReadinessReceiptDigest',
  'registryHealth',
  'registryHealthDigest',
  'envelopeDigest',
] as const);

const createReadinessEnvelope = (
  input: AgentEvaluationProductionSharedEffectHealthInput,
  ownerReadinessReceipt: AgentEvaluationProductionSharedEffectOwnerReadinessReceipt,
  now: Date
): AgentEvaluationProductionSharedEffectReadinessEnvelope => {
  const ownerReceipt = decodeOwnerReadiness(ownerReadinessReceipt, input, now);
  const registryHealth =
    decodeAgentEvaluationProductionRuntimeFactSourceRegistryHealth(
      createRegistryHealth(input, ownerReceipt),
      input.registrationRequest,
      input.sourceIdentity,
      now
    );
  const base = Object.freeze({
    format: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_READINESS_ENVELOPE_FORMAT,
    version: AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_DURABLE_REGISTRY_VERSION,
    registrationRequestDigest: input.registrationRequest.requestDigest,
    expectedIdentityDigest: input.lookup.expectedIdentityDigest,
    ownerReadinessReceipt: ownerReceipt,
    ownerReadinessReceiptDigest: ownerReceipt.receiptDigest,
    registryHealth,
    registryHealthDigest: registryHealth.recordDigest,
  });
  return Object.freeze({
    ...base,
    envelopeDigest: digestAgentCanonicalValue(base),
  });
};

const decodeReadinessEnvelope = (
  value: unknown,
  input: AgentEvaluationProductionSharedEffectHealthInput,
  now: Date
): AgentEvaluationProductionSharedEffectReadinessEnvelope => {
  if (!exactRecord(value, readinessEnvelopeKeys)) {
    return fail('readiness-envelope-shape');
  }
  const recreated = createReadinessEnvelope(
    input,
    value.ownerReadinessReceipt as AgentEvaluationProductionSharedEffectOwnerReadinessReceipt,
    now
  );
  if (
    !sameCanonicalJson(value, recreated) ||
    !boundedCanonical(value, maximumReadinessBytes) ||
    inspectAgentControlJson(value, maximumReadinessBytes).length > 0
  ) {
    return fail('readiness-envelope-binding');
  }
  return recreated;
};

export const createFileProductionAgentEvaluationSharedEffectDurableRegistry =
  async (
    input: CreateFileProductionAgentEvaluationSharedEffectDurableRegistryInput
  ): Promise<AgentEvaluationProductionSharedEffectDurableRegistry> => {
    if (
      !input.executor ||
      input.executor.authorityKind !==
        'production-provider-metadata-or-hosted-effect-owner' ||
      ![
        input.executor.execute,
        input.executor.checkReadiness,
        input.executor.close,
        input.forbiddenCanaries,
      ].every((candidate) => typeof candidate === 'function')
    ) {
      return fail('real-effect-executor');
    }
    const directories = await ensureStateRoot(
      input.stateDirectory,
      input.allowTemporaryStateDirectory === true,
      input.runnerTemporaryDirectory
    );
    const clock = input.clock ?? (() => new Date());
    const queue = new KeyedSerialQueue();
    const activeTemporaryPaths = new Set<string>();
    let draining = false;
    let closePromise: Promise<typeof cleanReceipt> | undefined;

    const assertActive = () => {
      if (draining) return fail('registry-draining');
    };

    const nowInstant = (): string => {
      const now = clock();
      if (!Number.isFinite(now.getTime())) return fail('clock');
      return now.toISOString();
    };

    const pathsForBinding = (
      binding: AgentEvaluationProductionSharedEffectBinding
    ) => {
      const segment = safeDigestSegment(binding.authorityRequestDigest);
      return Object.freeze({
        stage: join(directories.stages, `${segment}.json`),
        claim: join(directories.claims, `effect-${segment}.json`),
        result: join(directories.results, `${segment}.json`),
      });
    };

    const pathsForHealth = (
      healthInput: AgentEvaluationProductionSharedEffectHealthInput
    ) => {
      const segment = safeDigestSegment(
        healthInput.registrationRequest.requestDigest
      );
      return Object.freeze({
        claim: join(directories.claims, `readiness-${segment}.json`),
        readiness: join(directories.readiness, `${segment}.json`),
      });
    };

    const reserveCapacity = async (
      family: AgentEvaluationProductionSharedEffectCapacitySlot['family'],
      identityDigest: CanonicalDigest
    ): Promise<void> => {
      const maximumRecords =
        family === 'effect'
          ? AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_MAXIMUM_RECORDS
          : AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_MAXIMUM_READINESS_RECORDS;
      const directory =
        family === 'effect'
          ? directories.effectCapacity
          : directories.readinessCapacity;
      const initialIndex = Number(
        BigInt(`0x${safeDigestSegment(identityDigest).slice(0, 12)}`) %
          BigInt(maximumRecords)
      );
      for (let offset = 0; offset < maximumRecords; offset += 1) {
        const slotIndex = (initialIndex + offset) % maximumRecords;
        const path = join(
          directory,
          `${String(slotIndex).padStart(4, '0')}.json`
        );
        const existing = await readCanonical(path, maximumCapacitySlotBytes);
        if (existing !== undefined) {
          const occupied = decodeCapacitySlot(existing, family, maximumRecords);
          if (occupied.identityDigest === identityDigest) return;
          continue;
        }
        const candidate = createCapacitySlot(
          family,
          identityDigest,
          slotIndex,
          maximumRecords
        );
        const created = await writeCanonicalOnce(
          path,
          candidate,
          maximumCapacitySlotBytes,
          activeTemporaryPaths
        );
        if (created) return;
        const winner = await readCanonical(path, maximumCapacitySlotBytes);
        if (!winner) return fail('capacity-slot-winner-missing');
        const occupied = decodeCapacitySlot(winner, family, maximumRecords);
        if (occupied.identityDigest === identityDigest) return;
      }
      return fail(`${family}-capacity`);
    };

    const assertClean = (value: unknown) => {
      if (!sameCanonicalJson(value, cleanReceipt)) {
        return fail('executor-close');
      }
    };

    const readStage = async (
      binding: AgentEvaluationProductionSharedEffectBinding
    ): Promise<AgentEvaluationProductionSharedEffectStage | undefined> => {
      const value = await readCanonical(
        pathsForBinding(binding).stage,
        maximumStageBytes
      );
      if (value === undefined) return undefined;
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        value,
        input.forbiddenCanaries
      );
      return decodeAgentEvaluationProductionSharedEffectStage(value, binding);
    };

    const readResult = async (
      binding: AgentEvaluationProductionSharedEffectBinding,
      stage: AgentEvaluationProductionSharedEffectStage
    ): Promise<AgentEvaluationProductionSharedEffectResult | undefined> => {
      const value = await readCanonical(
        pathsForBinding(binding).result,
        maximumResultBytes
      );
      if (value === undefined) return undefined;
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        value,
        input.forbiddenCanaries
      );
      return decodeAgentEvaluationProductionSharedEffectResult(
        value,
        binding,
        stage
      );
    };

    const readReadiness = async (
      healthInput: AgentEvaluationProductionSharedEffectHealthInput
    ): Promise<
      AgentEvaluationProductionRuntimeFactSourceRegistryHealth | undefined
    > => {
      const value = await readCanonical(
        pathsForHealth(healthInput).readiness,
        maximumReadinessBytes
      );
      if (value === undefined) return undefined;
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        value,
        input.forbiddenCanaries
      );
      return decodeReadinessEnvelope(value, healthInput, clock())
        .registryHealth;
    };

    return Object.freeze({
      durability: 'shared-durable' as const,
      effectExecution: 'real-owner-only' as const,
      reconcile: 'read-sealed-only' as const,
      async sealStage(binding: AgentEvaluationProductionSharedEffectBinding) {
        assertActive();
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          binding,
          input.forbiddenCanaries
        );
        return queue.run(
          `stage:${binding.authorityRequestDigest}`,
          async () => {
            const existing = await readStage(binding);
            if (existing) return existing;
            await reserveCapacity('effect', binding.authorityRequestDigest);
            const candidate = createAgentEvaluationProductionSharedEffectStage(
              binding,
              nowInstant()
            );
            assertProductionAgentEvaluationG3SandboxCanaryClean(
              candidate,
              input.forbiddenCanaries
            );
            const created = await writeCanonicalOnce(
              pathsForBinding(binding).stage,
              candidate,
              maximumStageBytes,
              activeTemporaryPaths
            );
            if (created) return candidate;
            const winner = await readStage(binding);
            if (!winner) return fail('stage-winner-missing');
            return winner;
          }
        );
      },
      async readSealedStage(
        binding: AgentEvaluationProductionSharedEffectBinding
      ) {
        assertActive();
        return readStage(binding);
      },
      async executeAndSeal(
        binding: AgentEvaluationProductionSharedEffectBinding,
        stage: AgentEvaluationProductionSharedEffectStage
      ) {
        assertActive();
        decodeAgentEvaluationProductionSharedEffectStage(stage, binding);
        return queue.run(
          `effect:${binding.authorityRequestDigest}`,
          async () => {
            const existing = await readResult(binding, stage);
            if (existing) return existing;
            const paths = pathsForBinding(binding);
            const claim = createClaim(binding, stage, nowInstant());
            assertProductionAgentEvaluationG3SandboxCanaryClean(
              claim,
              input.forbiddenCanaries
            );
            const ownsClaim = await writeCanonicalOnce(
              paths.claim,
              claim,
              maximumClaimBytes,
              activeTemporaryPaths
            );
            if (!ownsClaim) {
              const persistedClaim = await readCanonical(
                paths.claim,
                maximumClaimBytes
              );
              if (!persistedClaim) return fail('effect-claim-winner-missing');
              decodeClaim(persistedClaim, binding, stage);
              return readResult(binding, stage);
            }
            const executed = await input.executor.execute(binding, stage);
            if (!executed) return undefined;
            const result = createAgentEvaluationProductionSharedEffectResult(
              binding,
              stage,
              executed
            );
            assertProductionAgentEvaluationG3SandboxCanaryClean(
              result,
              input.forbiddenCanaries
            );
            const created = await writeCanonicalOnce(
              paths.result,
              result,
              maximumResultBytes,
              activeTemporaryPaths
            );
            if (created) return result;
            const winner = await readResult(binding, stage);
            if (!winner || !sameCanonicalJson(winner, result)) {
              return fail('effect-result-conflict');
            }
            return winner;
          }
        );
      },
      async readSealedResult(
        binding: AgentEvaluationProductionSharedEffectBinding,
        stage: AgentEvaluationProductionSharedEffectStage
      ) {
        assertActive();
        decodeAgentEvaluationProductionSharedEffectStage(stage, binding);
        return readResult(binding, stage);
      },
      async sealOwnerReadiness(
        healthInput: AgentEvaluationProductionSharedEffectHealthInput
      ) {
        assertActive();
        return queue.run(
          `readiness:${healthInput.registrationRequest.requestDigest}`,
          async () => {
            const existing = await readReadiness(healthInput);
            if (existing) return existing;
            await reserveCapacity(
              'readiness',
              healthInput.registrationRequest.requestDigest
            );
            const paths = pathsForHealth(healthInput);
            const claim = createReadinessClaim(healthInput, nowInstant());
            const ownsClaim = await writeCanonicalOnce(
              paths.claim,
              claim,
              maximumClaimBytes,
              activeTemporaryPaths
            );
            if (!ownsClaim) {
              const persistedClaim = await readCanonical(
                paths.claim,
                maximumClaimBytes
              );
              if (!persistedClaim)
                return fail('readiness-claim-winner-missing');
              decodeReadinessClaim(persistedClaim, healthInput);
              return readReadiness(healthInput);
            }
            const candidate = await input.executor.checkReadiness(healthInput);
            if (!candidate) return undefined;
            const envelope = createReadinessEnvelope(
              healthInput,
              candidate,
              clock()
            );
            assertProductionAgentEvaluationG3SandboxCanaryClean(
              envelope,
              input.forbiddenCanaries
            );
            const created = await writeCanonicalOnce(
              paths.readiness,
              envelope,
              maximumReadinessBytes,
              activeTemporaryPaths
            );
            if (created) return envelope.registryHealth;
            const winner = await readReadiness(healthInput);
            if (
              !winner ||
              !sameCanonicalJson(winner, envelope.registryHealth)
            ) {
              return fail('readiness-conflict');
            }
            return winner;
          }
        );
      },
      async readOwnerReadiness(
        healthInput: AgentEvaluationProductionSharedEffectHealthInput
      ) {
        assertActive();
        return readReadiness(healthInput);
      },
      async close() {
        closePromise ??= (async () => {
          draining = true;
          await queue.drain();
          assertClean(await input.executor.close());
          if (queue.size !== 0 || activeTemporaryPaths.size !== 0) {
            return fail('close-residual');
          }
          return cleanReceipt;
        })();
        return closePromise;
      },
    });
  };

/** Stable default-composition seam: one shared directory owns effects and readiness. */
export const createFileProductionAgentEvaluationSharedEffectOwner = async (
  input: CreateFileProductionAgentEvaluationSharedEffectOwnerInput
): Promise<FileProductionAgentEvaluationSharedEffectOwner> => {
  const registry =
    await createFileProductionAgentEvaluationSharedEffectDurableRegistry(input);
  const owner = createProductionAgentEvaluationSharedEffectOwner({
    expectedSourceIdentities: input.expectedSourceIdentities,
    registry,
    forbiddenCanaries: input.forbiddenCanaries,
    clock: input.clock,
  });
  return Object.freeze({ registry, ...owner });
};
