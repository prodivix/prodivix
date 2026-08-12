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
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
  decodeAgentEvaluationFrozenConfigCommitment,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationAttemptAuthorityResponseProjection,
  type AgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationMetricObservation,
  type AgentModelEvaluationPlan,
  type AgentHostedRetrievalRuntimeResourceRegistrationIntentBinding,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import {
  PRODUCTION_AGENT_EVALUATION_ATTEMPT_GRADING_IMPLEMENTATION_DIGEST,
  assertProductionAttemptGradingInput,
  gradeProductionAgentEvaluationAttempt,
  projectProductionAttemptGradingResponse,
  reconstructProductionAttemptGradingResponse,
  validateProductionAttemptGradingResponse,
  type ProductionAttemptGradingResponse,
} from './productionAttemptGradingAuthority';
import type {
  AgentEvaluationProductionAttemptOwnerAuthorityPortFactory,
  AgentEvaluationProductionAttemptOwnerAuthorityPorts,
} from './productionOwnerAuthorityComposition';
import {
  PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST,
  assertProductionCapabilityAssessmentInput,
  assertProductionCapabilityExecuteInput,
  createUnavailableProductionCapabilityResponse,
  projectProductionCapabilityAuthorityResponse,
  reconstructProductionCapabilityAuthorityResponse,
  validateProductionCapabilityAuthorityObservation,
  validateProductionCapabilityAuthorityResponse,
  type ProductionCapabilityAuthorityObservationSource,
  type ProductionCapabilityAuthorityResponse,
} from './productionCapabilityAuthority';
import {
  createAgentEvaluationAttemptAuthorityDispatchAckDigest,
  createAgentEvaluationAttemptAuthorityDispatchStageDigest,
  createAgentEvaluationOwnerAuthorityDurability,
  type AgentEvaluationAttemptOwnerAuthorityPort,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import { AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES } from './productionOwnerAuthoritySidecarEnvironment';
import { AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES } from './ledgerClient';
import { decodeAgentEvaluationRunConfigQualificationTemplate } from './runConfig';
import { createProductionAgentEvaluationSharedEffectExecutor } from './productionSharedEffectExecutor';
import { createFileProductionAgentEvaluationSharedEffectOwner } from './productionSharedEffectDurableRegistry';
import {
  createProductionAgentEvaluationCapabilityEffectProviderRuntimeTransport,
  createProductionAgentEvaluationSharedEffectHostedPreactivationRuntimeTransport,
  createProductionAgentEvaluationSharedEffectHostedRuntimeTransport,
  createProductionAgentEvaluationSharedEffectMetadataRuntimeOwner,
  createProductionAgentEvaluationSharedEffectStatefulRuntimeTransport,
  type CreateProductionAgentEvaluationCapabilityEffectProviderRuntimeTransportInput,
} from './productionCapabilityEffectProviderRuntimeTransport';
import {
  EnvironmentAgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyResolver,
  createAgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher,
} from './productionCapabilityEffectProviderJournalSpoolCipher';
import { createEnvironmentProductionAgentEvaluationNativeProviderStateVaultClient } from './productionNativeProviderStateVaultClient';
import { createEnvironmentProductionAgentEvaluationNativeProviderStateVaultHealthReader } from './productionNativeProviderStateVaultHealthClient';
import { createProductionAgentEvaluationSharedEffectStatefulOwner } from './productionSharedEffectStatefulOwner';
import {
  createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding,
  createProductionAgentEvaluationSharedEffectHostedOwner,
  createProductionAgentEvaluationSharedEffectHostedPreactivationOwner,
} from './productionSharedEffectHostedOwner';
import {
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceClient,
  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient,
} from './hostedRetrievalRuntimeResourceClient';
import { createEnvironmentAgentEvaluationAuthoritySigner } from './attestationSigner';
import { AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_ENVIRONMENT_NAMES } from './productionFrozenConfigCommitment';
import { createNodeAgentEvaluationCoordinatorFilePort } from './productionFiles';
import { loadProductionAgentEvaluationRunConfigArtifact } from './productionRunConfigArtifact';
import { PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME } from './productionCapabilityEffectProviderJournalClient';
import { createProductionAgentEvaluationRuntimeFactSourceRegistrationOwner } from './productionRuntimeFactSourceHealthRegistry';
import {
  EnvironmentAgentEvaluationCapabilityProbeSpoolKeyResolver,
  createProductionAgentEvaluationCapabilityProbePhaseTransport,
  PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PHASE_TRANSPORT_IMPLEMENTATION_DIGEST,
} from './productionCapabilityProbePhaseTransport';
import { createProductionAgentEvaluationCapabilityProbeExecutor } from './productionCapabilityProbeExecutor';
import { createEnvironmentAgentEvaluationCapabilityProbeResponseSpoolIngressClient } from './capabilityProbeResponseSpoolIngressClient';
import { createEnvironmentAgentEvaluationCapabilityProbeReferenceIngressClient } from './capabilityProbeReferenceIngressClient';
import {
  createEnvironmentAgentEvaluationCapabilityProbeProviderResourceTransport,
  createProductionAgentEvaluationCapabilityProbeProviderResourceOwner,
} from './productionCapabilityProbeProviderResourceOwner';
import { createEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClient } from './capabilityProbeProviderResourceCleanupClient';
import { containsAsciiControlCharacter } from './textSafety';

export const AGENT_EVALUATION_ATTEMPT_OWNER_STATE_FORMAT =
  'prodivix.agent-evaluation-attempt-owner-state' as const;
export const AGENT_EVALUATION_ATTEMPT_OWNER_STATE_VERSION = 1 as const;

const maximumRecordBytes = 1_048_576;
const providerCapabilityAuthorityId = 'evaluation.provider-capability.owner.v1';
const attemptGradingAuthorityId = 'evaluation.attempt-grading.owner.v1';

type ServiceKind = 'provider-capability' | 'attempt-grading';

type SafeRequestBinding = Readonly<{
  serviceKind: ServiceKind;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  operation: string;
  routeBinding: string;
  requestDigest: CanonicalDigest;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  shardLeaseOwnerId: string;
  shardLeaseGeneration: number;
  verificationGrantGeneration: number;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
  providerCapabilityObservationReceiptSetDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  claimGeneration: 1;
  payloadDigest: CanonicalDigest;
  operationBinding: Readonly<Record<string, unknown>>;
  bindingDigest: CanonicalDigest;
}>;

type StagedState = Readonly<{
  format: typeof AGENT_EVALUATION_ATTEMPT_OWNER_STATE_FORMAT;
  version: typeof AGENT_EVALUATION_ATTEMPT_OWNER_STATE_VERSION;
  storageIdentityDigest: CanonicalDigest;
  state: 'staged';
  binding: SafeRequestBinding;
  sourceAuthorityId?: string;
  sourceImplementationDigest?: CanonicalDigest;
  sourceStageReceiptDigest?: CanonicalDigest;
  stageReceiptDigest: CanonicalDigest;
  recordDigest: CanonicalDigest;
}>;

type CompletedState = Readonly<{
  format: typeof AGENT_EVALUATION_ATTEMPT_OWNER_STATE_FORMAT;
  version: typeof AGENT_EVALUATION_ATTEMPT_OWNER_STATE_VERSION;
  storageIdentityDigest: CanonicalDigest;
  state: 'completed';
  binding: SafeRequestBinding;
  sourceAuthorityId?: string;
  sourceImplementationDigest?: CanonicalDigest;
  sourceStageReceiptDigest?: CanonicalDigest;
  stageReceiptDigest: CanonicalDigest;
  responseProjection: AgentEvaluationAttemptAuthorityResponseProjection;
  specificReceipts?: readonly AgentEvaluationCapabilitySpecificReceipt[];
  capabilityResponse?: ProductionCapabilityAuthorityResponse;
  metricObservations?: readonly AgentEvaluationMetricObservation[];
  recordDigest: CanonicalDigest;
}>;

type AttemptOwnerState = StagedState | CompletedState;

export type CreateFileProductionAgentEvaluationAttemptOwnerAuthorityPortsInput =
  Readonly<{
    stateDirectory: string;
    forbiddenCanaries: () => readonly string[];
    capabilityObservationSource?: ProductionCapabilityAuthorityObservationSource;
    allowTemporaryStateDirectory?: boolean;
    runnerTemporaryDirectory?: string;
  }>;

const fail = (code: string): never => {
  throw new TypeError(`G4_ATTEMPT_OWNER_AUTHORITY_STATE_INVALID: ${code}`);
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

const digestWithout = (
  value: Readonly<Record<string, unknown>>,
  omitted: string
): CanonicalDigest =>
  digestAgentCanonicalValue(
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== omitted))
  );

const pathIsWithin = (parent: string, child: string): boolean => {
  const path = relative(resolve(parent), resolve(child));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};

const ensureStateDirectory = async (
  source: string,
  allowTemporary: boolean,
  runnerTemporary?: string
): Promise<string> => {
  if (
    typeof source !== 'string' ||
    source !== source.trim() ||
    !isAbsolute(source)
  ) {
    return fail('state-directory-absolute');
  }
  const target = resolve(source);
  if (target === parse(target).root) return fail('state-directory-root');
  if (
    !allowTemporary &&
    (pathIsWithin(tmpdir(), target) ||
      (runnerTemporary !== undefined &&
        isAbsolute(runnerTemporary) &&
        pathIsWithin(runnerTemporary, target)))
  ) {
    throw new TypeError(
      'G4_ATTEMPT_AUTHORITY_DURABLE_STORAGE_REQUIRED: state directory must be a shared durable volume outside OS and RUNNER_TEMP roots.'
    );
  }
  await mkdir(target, { recursive: true, mode: 0o700 });
  const metadata = await lstat(target);
  const concrete = await realpath(target);
  const exactConcretePath =
    process.platform === 'win32'
      ? concrete.toLowerCase() === target.toLowerCase()
      : concrete === target;
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    !exactConcretePath
  ) {
    return fail('state-directory-concrete');
  }
  return target;
};

const requestOperationBinding = (
  request: AgentEvaluationOwnerAuthorityRequest
): Readonly<Record<string, unknown>> => {
  if (request.serviceKind === 'provider-capability') {
    if (request.operation === 'tool.execute') {
      const input = assertProductionCapabilityExecuteInput(request);
      return Object.freeze({
        bindingKind: 'execute-tool',
        caseId: input.caseId,
        materialDigest: input.materialDigest,
        capabilityDescriptorDigest: input.capabilityDescriptor.descriptorDigest,
        invocationId: input.invocationId,
        turnIndex: input.turnIndex,
        toolId: input.toolId,
        toolCallId: input.toolCallId,
        providerToolCallId: input.providerToolCallId,
        providerRequestDigest: input.requestDigest,
        argumentsDigest: input.argumentsDigest,
      });
    }
    const input = assertProductionCapabilityAssessmentInput(request);
    return Object.freeze({
      bindingKind: 'assess-capability',
      terminalTurnIndex: input.terminalTurnIndex,
      terminalInvocationId: input.terminalInvocationId,
      materialDigest: input.material.materialDigest,
      capabilityDescriptorDigest: input.capabilityDescriptor.descriptorDigest,
      capabilityToolExecutionSetDigest: digestAgentCanonicalValue(
        input.capabilityToolExecutions.map(({ input: tool, output }) => ({
          toolId: tool.toolId,
          toolCallId: tool.toolCallId,
          requestDigest: tool.requestDigest,
          resultDigest: output.resultDigest,
        }))
      ),
      controlledToolExecutionReceiptSetDigest: digestAgentCanonicalValue(
        input.controlledToolExecutionReceipts.map(
          ({ receiptDigest }) => receiptDigest
        )
      ),
    });
  }
  const input = assertProductionAttemptGradingInput(request);
  return Object.freeze({
    bindingKind: 'grade-and-persist',
    materialDigest: input.material.materialDigest,
    invocationTurnSetReceiptDigest:
      input.invocationTurnSetReceipt.receiptDigest,
    terminalTurnReceiptDigest: input.terminalTurnReceipt.evidenceDigest,
    capabilityExecutionReceiptDigest:
      input.capabilityExecutionReceipt.receiptDigest,
    ...(input.resultSubmissionReceipt
      ? {
          resultSubmissionReceiptDigest:
            input.resultSubmissionReceipt.receiptDigest,
        }
      : {}),
    ...(input.controlledRuntimeReceipt
      ? {
          controlledRuntimeReceiptDigest:
            input.controlledRuntimeReceipt.receiptDigest,
        }
      : {}),
    executionDigest: digestAgentCanonicalValue(input.execution),
  });
};

const requestBinding = (
  request: AgentEvaluationOwnerAuthorityRequest
): SafeRequestBinding => {
  if (
    (request.serviceKind !== 'provider-capability' &&
      request.serviceKind !== 'attempt-grading') ||
    request.planDigest === undefined ||
    request.attemptId === undefined ||
    request.descriptorDigest === undefined ||
    request.shardLeaseOwnerId === undefined ||
    request.shardLeaseGeneration === undefined ||
    request.verificationGrantGeneration === undefined ||
    request.verificationAttemptGrantReceiptSetDigest === undefined ||
    request.providerCapabilityObservationReceiptSetDigest === undefined ||
    request.claimGeneration !== 1
  ) {
    return fail('request-binding');
  }
  const ownerImplementationDigest =
    request.serviceKind === 'provider-capability'
      ? PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST
      : PRODUCTION_AGENT_EVALUATION_ATTEMPT_GRADING_IMPLEMENTATION_DIGEST;
  if (request.ownerImplementationDigest !== ownerImplementationDigest) {
    return fail('owner-implementation-digest-drift');
  }
  const stageDigest = createAgentEvaluationAttemptAuthorityDispatchStageDigest(
    request,
    ownerImplementationDigest
  );
  if (
    request.stageDigest !== undefined &&
    request.stageDigest !== stageDigest
  ) {
    return fail('stage-digest-drift');
  }
  const base = Object.freeze({
    serviceKind: request.serviceKind,
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    operation: request.operation,
    routeBinding: request.routeBinding,
    requestDigest: request.requestDigest,
    attemptId: request.attemptId,
    descriptorDigest: request.descriptorDigest,
    shardLeaseOwnerId: request.shardLeaseOwnerId,
    shardLeaseGeneration: request.shardLeaseGeneration,
    verificationGrantGeneration: request.verificationGrantGeneration,
    verificationAttemptGrantReceiptSetDigest:
      request.verificationAttemptGrantReceiptSetDigest,
    providerCapabilityObservationReceiptSetDigest:
      request.providerCapabilityObservationReceiptSetDigest,
    stageDigest,
    claimGeneration: 1 as const,
    payloadDigest: digestAgentCanonicalValue(request.payload),
    operationBinding: requestOperationBinding(request),
  });
  return Object.freeze({
    ...base,
    bindingDigest: digestAgentCanonicalValue(base),
  });
};

const stagedState = (
  storageIdentityDigest: CanonicalDigest,
  binding: SafeRequestBinding,
  source?: Readonly<{
    sourceAuthorityId: string;
    sourceImplementationDigest: CanonicalDigest;
    sourceStageReceiptDigest: CanonicalDigest;
  }>
): StagedState => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_ATTEMPT_OWNER_STATE_FORMAT,
    version: AGENT_EVALUATION_ATTEMPT_OWNER_STATE_VERSION,
    storageIdentityDigest,
    state: 'staged' as const,
    binding,
    ...(source ?? {}),
    stageReceiptDigest: binding.stageDigest,
  });
  return Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
};

const completedState = (
  staged: StagedState,
  responseProjection: AgentEvaluationAttemptAuthorityResponseProjection,
  evidence:
    | Readonly<{
        specificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
        capabilityResponse?: ProductionCapabilityAuthorityResponse;
      }>
    | Readonly<{
        metricObservations: readonly AgentEvaluationMetricObservation[];
      }>
): CompletedState => {
  const base = Object.freeze({
    format: staged.format,
    version: staged.version,
    storageIdentityDigest: staged.storageIdentityDigest,
    state: 'completed' as const,
    binding: staged.binding,
    ...(staged.sourceAuthorityId
      ? {
          sourceAuthorityId: staged.sourceAuthorityId,
          sourceImplementationDigest: staged.sourceImplementationDigest,
          sourceStageReceiptDigest: staged.sourceStageReceiptDigest,
        }
      : {}),
    stageReceiptDigest: staged.stageReceiptDigest,
    responseProjection,
    ...evidence,
  });
  return Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
};

const decodeState = (source: Uint8Array): AttemptOwnerState => {
  if (source.byteLength < 1 || source.byteLength > maximumRecordBytes) {
    return fail('record-byte-budget');
  }
  let value: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(source);
    value = JSON.parse(text, (key, entry: unknown) => {
      if (key && isUnsafeObjectKey(key)) return fail('record-unsafe-key');
      return entry;
    }) as unknown;
    if (canonicalJsonText(value) !== text) return fail('record-canonical-json');
  } catch (caught) {
    if (
      caught instanceof TypeError &&
      caught.message.startsWith('G4_ATTEMPT_OWNER_AUTHORITY_STATE_INVALID:')
    ) {
      throw caught;
    }
    return fail('record-decode');
  }
  if (
    !exactRecord(
      value,
      [
        'format',
        'version',
        'storageIdentityDigest',
        'state',
        'binding',
        'stageReceiptDigest',
        'recordDigest',
      ],
      [
        'sourceAuthorityId',
        'sourceImplementationDigest',
        'sourceStageReceiptDigest',
        'responseProjection',
        'specificReceipts',
        'capabilityResponse',
        'metricObservations',
      ]
    ) ||
    value.format !== AGENT_EVALUATION_ATTEMPT_OWNER_STATE_FORMAT ||
    value.version !== AGENT_EVALUATION_ATTEMPT_OWNER_STATE_VERSION ||
    !isAgentCanonicalDigest(value.storageIdentityDigest) ||
    (value.state !== 'staged' && value.state !== 'completed') ||
    !isAgentCanonicalDigest(value.stageReceiptDigest) ||
    !isAgentCanonicalDigest(value.recordDigest) ||
    value.recordDigest !== digestWithout(value, 'recordDigest') ||
    !isPlainObject(value.binding) ||
    !isAgentCanonicalDigest(value.binding.bindingDigest) ||
    (value.state === 'staged' &&
      (value.responseProjection !== undefined ||
        value.specificReceipts !== undefined ||
        value.capabilityResponse !== undefined ||
        value.metricObservations !== undefined)) ||
    (value.state === 'completed' && value.responseProjection === undefined) ||
    (value.sourceAuthorityId === undefined) !==
      (value.sourceImplementationDigest === undefined) ||
    (value.sourceAuthorityId === undefined) !==
      (value.sourceStageReceiptDigest === undefined) ||
    (value.sourceImplementationDigest !== undefined &&
      !isAgentCanonicalDigest(value.sourceImplementationDigest)) ||
    (value.sourceStageReceiptDigest !== undefined &&
      !isAgentCanonicalDigest(value.sourceStageReceiptDigest))
  ) {
    return fail('record-shape');
  }
  return value as unknown as AttemptOwnerState;
};

const readState = async (
  path: string
): Promise<AttemptOwnerState | undefined> => {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      return fail('record-concrete-file');
    }
    const source = await readFile(path);
    try {
      return decodeState(source);
    } finally {
      source.fill(0);
    }
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw caught;
  }
};

const writeImmutable = async (path: string, value: unknown): Promise<void> => {
  const source = new TextEncoder().encode(canonicalJsonText(value));
  if (source.byteLength < 1 || source.byteLength > maximumRecordBytes) {
    source.fill(0);
    return fail('record-byte-budget');
  }
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(source);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(temporary, path);
    if (process.platform !== 'win32') {
      handle = await open(dirname(path), 'r');
      await handle.sync();
      await handle.close();
      handle = undefined;
    }
  } finally {
    source.fill(0);
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
};

const exactBinding = (
  state: AttemptOwnerState,
  binding: SafeRequestBinding,
  storageIdentityDigest: CanonicalDigest
): void => {
  if (
    state.storageIdentityDigest !== storageIdentityDigest ||
    !sameCanonicalJson(state.binding, binding)
  ) {
    return fail('persisted-binding-drift');
  }
};

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

export const createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts =
  async (
    input: CreateFileProductionAgentEvaluationAttemptOwnerAuthorityPortsInput
  ) => {
    const root = await ensureStateDirectory(
      join(input.stateDirectory, 'attempt-authorities-v1'),
      input.allowTemporaryStateDirectory === true,
      input.runnerTemporaryDirectory
    );
    const storageIdentityDigest = digestAgentCanonicalValue({
      format: 'prodivix.agent-evaluation-attempt-owner-storage-identity',
      version: 1,
      absoluteRoot: root,
    });
    const queue = new KeyedSerialQueue();
    let draining = false;

    const source = input.capabilityObservationSource;
    if (
      source !== undefined &&
      (source.sourceDurability !== 'shared-durable' ||
        !isAgentControlIdentity(source.sourceAuthorityId) ||
        !isAgentCanonicalDigest(source.sourceImplementationDigest))
    ) {
      return fail('capability-observation-source');
    }

    const pathsFor = async (binding: SafeRequestBinding) => {
      const serviceDirectory = join(root, binding.serviceKind);
      const requestDirectory = join(serviceDirectory, binding.requestDigest);
      await mkdir(requestDirectory, { recursive: true, mode: 0o700 });
      for (const path of [serviceDirectory, requestDirectory]) {
        const metadata = await lstat(path);
        if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
          return fail('request-directory-concrete');
        }
      }
      return Object.freeze({
        staged: join(requestDirectory, 'staged.json'),
        completed: join(requestDirectory, 'completed.json'),
      });
    };

    const load = async (
      binding: SafeRequestBinding
    ): Promise<AttemptOwnerState | undefined> => {
      const paths = await pathsFor(binding);
      const completed = await readState(paths.completed);
      if (completed) {
        if (completed.state !== 'completed') return fail('completed-phase');
        exactBinding(completed, binding, storageIdentityDigest);
        return completed;
      }
      const staged = await readState(paths.staged);
      if (staged) {
        if (staged.state !== 'staged') return fail('staged-phase');
        exactBinding(staged, binding, storageIdentityDigest);
      }
      return staged;
    };

    const persist = async (
      binding: SafeRequestBinding,
      phase: 'staged' | 'completed',
      state: AttemptOwnerState
    ): Promise<AttemptOwnerState> => {
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        state,
        input.forbiddenCanaries
      );
      const path = (await pathsFor(binding))[phase];
      try {
        await writeImmutable(path, state);
        return state;
      } catch (caught) {
        if (
          ['EEXIST', 'EPERM'].includes(
            String((caught as NodeJS.ErrnoException).code)
          )
        ) {
          const winner = await readState(path);
          if (winner && sameCanonicalJson(winner, state)) return winner;
        }
        throw caught;
      }
    };

    const stage = async (
      request: AgentEvaluationOwnerAuthorityRequest
    ): Promise<CanonicalDigest> => {
      if (draining) return fail('authority-draining');
      const binding = requestBinding(request);
      return queue.run(
        `${binding.serviceKind}:${binding.requestDigest}`,
        async () => {
          const existing = await load(binding);
          if (existing) return existing.stageReceiptDigest;
          let sourceStage:
            | Readonly<{
                sourceAuthorityId: string;
                sourceImplementationDigest: CanonicalDigest;
                sourceStageReceiptDigest: CanonicalDigest;
              }>
            | undefined;
          if (binding.serviceKind === 'provider-capability' && source) {
            const sourceStageReceiptDigest = await source.stage(request);
            if (!isAgentCanonicalDigest(sourceStageReceiptDigest)) {
              return fail('source-stage-receipt');
            }
            sourceStage = Object.freeze({
              sourceAuthorityId: source.sourceAuthorityId,
              sourceImplementationDigest: source.sourceImplementationDigest,
              sourceStageReceiptDigest,
            });
          }
          if (binding.serviceKind === 'attempt-grading') {
            gradeProductionAgentEvaluationAttempt(request);
          }
          const state = stagedState(
            storageIdentityDigest,
            binding,
            sourceStage
          );
          await persist(binding, 'staged', state);
          return state.stageReceiptDigest;
        }
      );
    };

    const reconstructCompleted = (
      request: AgentEvaluationOwnerAuthorityRequest,
      state: CompletedState
    ):
      | ProductionCapabilityAuthorityResponse
      | ProductionAttemptGradingResponse => {
      if (state.binding.serviceKind === 'provider-capability') {
        if (
          !Array.isArray(state.specificReceipts) ||
          state.metricObservations !== undefined ||
          state.specificReceipts.some(
            (receipt) => !isAgentEvaluationCapabilitySpecificReceipt(receipt)
          ) ||
          state.responseProjection.serviceKind !== 'capability-runtime'
        ) {
          return fail('completed-capability-evidence');
        }
        if (
          state.responseProjection.operation === 'execute-tool' &&
          state.responseProjection.executionAuthorityKind === 'shared-effect'
        ) {
          if (state.capabilityResponse === undefined) {
            return fail('completed-shared-effect-response');
          }
          return validateProductionCapabilityAuthorityResponse(
            request,
            state.capabilityResponse
          );
        }
        if (state.capabilityResponse !== undefined) {
          return fail('completed-capability-response-scope');
        }
        const response = reconstructProductionCapabilityAuthorityResponse(
          state.responseProjection,
          state.specificReceipts
        );
        return validateProductionCapabilityAuthorityResponse(request, response);
      }
      if (
        !Array.isArray(state.metricObservations) ||
        state.specificReceipts !== undefined ||
        state.responseProjection.serviceKind !== 'attempt-grading'
      ) {
        return fail('completed-grading-evidence');
      }
      const response = reconstructProductionAttemptGradingResponse(
        state.responseProjection,
        state.metricObservations
      );
      return validateProductionAttemptGradingResponse(request, response);
    };

    const completeCapability = async (
      request: AgentEvaluationOwnerAuthorityRequest,
      staged: StagedState,
      mode: 'execute' | 'reconcile',
      recoveredObservation?: Awaited<
        ReturnType<ProductionCapabilityAuthorityObservationSource['reconcile']>
      >
    ): Promise<ProductionCapabilityAuthorityResponse | undefined> => {
      const stagedHasSource = staged.sourceAuthorityId !== undefined;
      if (stagedHasSource !== (source !== undefined)) {
        if (mode === 'reconcile' && stagedHasSource && !source) {
          return undefined;
        }
        return fail('staged-source-availability-drift');
      }
      if (
        source &&
        (staged.sourceAuthorityId !== source.sourceAuthorityId ||
          staged.sourceImplementationDigest !==
            source.sourceImplementationDigest)
      ) {
        return fail('staged-source-identity-drift');
      }
      let response: ProductionCapabilityAuthorityResponse | undefined;
      if (source) {
        const observation =
          recoveredObservation ??
          (mode === 'execute'
            ? await source.resolve(request)
            : await source.reconcile(request));
        if (observation) {
          if (
            observation.sourceAuthorityId !== source.sourceAuthorityId ||
            observation.sourceImplementationDigest !==
              source.sourceImplementationDigest
          ) {
            return fail('source-observation-identity');
          }
          response = validateProductionCapabilityAuthorityObservation(
            request,
            observation,
            staged.sourceStageReceiptDigest
          ).response;
        } else if (mode === 'reconcile') {
          return undefined;
        }
      }
      response ??= createUnavailableProductionCapabilityResponse(request);
      response = validateProductionCapabilityAuthorityResponse(
        request,
        response
      );
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        response,
        input.forbiddenCanaries
      );
      const projection = projectProductionCapabilityAuthorityResponse(
        request,
        response
      );
      const completed = completedState(staged, projection, {
        specificReceipts: response.specificReceipts,
        ...(request.operation === 'tool.execute' &&
        'executionAuthorityKind' in response &&
        response.executionAuthorityKind === 'shared-effect'
          ? { capabilityResponse: response }
          : {}),
      });
      if (
        mode === 'reconcile' &&
        request.dispatchAckDigest !==
          createAgentEvaluationAttemptAuthorityDispatchAckDigest(
            request,
            response,
            PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST
          )
      ) {
        return fail('dispatch-ack-digest-drift');
      }
      await persist(staged.binding, 'completed', completed);
      return response;
    };

    const completeGrading = async (
      request: AgentEvaluationOwnerAuthorityRequest,
      staged: StagedState
    ): Promise<ProductionAttemptGradingResponse> => {
      const response = gradeProductionAgentEvaluationAttempt(request);
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        response,
        input.forbiddenCanaries
      );
      const projection = projectProductionAttemptGradingResponse(
        request,
        response
      );
      const completed = completedState(staged, projection, {
        metricObservations: response.metricObservations,
      });
      if (
        request.mode === 'reconcile' &&
        request.dispatchAckDigest !==
          createAgentEvaluationAttemptAuthorityDispatchAckDigest(
            request,
            response,
            PRODUCTION_AGENT_EVALUATION_ATTEMPT_GRADING_IMPLEMENTATION_DIGEST
          )
      ) {
        return fail('dispatch-ack-digest-drift');
      }
      await persist(staged.binding, 'completed', completed);
      return response;
    };

    const executeFor = async (
      request: AgentEvaluationOwnerAuthorityRequest
    ): Promise<unknown> => {
      if (draining) return fail('authority-draining');
      const binding = requestBinding(request);
      return queue.run(
        `${binding.serviceKind}:${binding.requestDigest}`,
        async () => {
          const current = await load(binding);
          if (!current) return fail('stage-required-before-execute');
          if (current.state === 'completed') {
            return reconstructCompleted(request, current);
          }
          return binding.serviceKind === 'provider-capability'
            ? completeCapability(request, current, 'execute')
            : completeGrading(request, current);
        }
      );
    };

    const reconcileFor = async (
      request: AgentEvaluationOwnerAuthorityRequest
    ): Promise<Readonly<{ response: unknown; reconciled: boolean }>> => {
      if (draining) return fail('authority-draining');
      const binding = requestBinding(request);
      return queue.run(
        `${binding.serviceKind}:${binding.requestDigest}`,
        async () => {
          const current = await load(binding);
          if (!current) {
            if (binding.serviceKind === 'provider-capability' && source) {
              const observation = await source.reconcile(request);
              if (!observation) {
                return Object.freeze({ response: null, reconciled: false });
              }
              const recovered =
                validateProductionCapabilityAuthorityObservation(
                  request,
                  observation
                );
              if (
                recovered.sourceAuthorityId !== source.sourceAuthorityId ||
                recovered.sourceImplementationDigest !==
                  source.sourceImplementationDigest
              ) {
                return fail('source-observation-identity');
              }
              const recoveredStage = stagedState(
                storageIdentityDigest,
                binding,
                Object.freeze({
                  sourceAuthorityId: recovered.sourceAuthorityId,
                  sourceImplementationDigest:
                    recovered.sourceImplementationDigest,
                  sourceStageReceiptDigest: recovered.sourceStageReceiptDigest,
                })
              );
              const response = await completeCapability(
                request,
                recoveredStage,
                'reconcile',
                recovered
              );
              return Object.freeze({ response, reconciled: true });
            }
            const recoveredStage = stagedState(storageIdentityDigest, binding);
            if (binding.serviceKind === 'provider-capability') {
              const response = await completeCapability(
                request,
                recoveredStage,
                'reconcile'
              );
              return Object.freeze({ response, reconciled: true });
            }
            return Object.freeze({
              response: await completeGrading(request, recoveredStage),
              reconciled: true,
            });
          }
          if (current.state === 'completed') {
            const response = reconstructCompleted(request, current);
            const ownerImplementationDigest =
              binding.serviceKind === 'provider-capability'
                ? PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST
                : PRODUCTION_AGENT_EVALUATION_ATTEMPT_GRADING_IMPLEMENTATION_DIGEST;
            if (
              request.dispatchAckDigest !==
              createAgentEvaluationAttemptAuthorityDispatchAckDigest(
                request,
                response,
                ownerImplementationDigest
              )
            ) {
              return fail('dispatch-ack-digest-drift');
            }
            return Object.freeze({
              response,
              reconciled: true,
            });
          }
          if (binding.serviceKind === 'provider-capability') {
            const response = await completeCapability(
              request,
              current,
              'reconcile'
            );
            return response === undefined
              ? Object.freeze({ response: null, reconciled: false })
              : Object.freeze({ response, reconciled: true });
          }
          return Object.freeze({
            response: await completeGrading(request, current),
            reconciled: true,
          });
        }
      );
    };

    const durability = createAgentEvaluationOwnerAuthorityDurability();
    const providerCapability = Object.freeze({
      authorityId: providerCapabilityAuthorityId,
      implementationDigest:
        PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST,
      durability,
      stage,
      execute: executeFor,
      reconcile: reconcileFor,
    }) satisfies AgentEvaluationAttemptOwnerAuthorityPort;
    const attemptGrading = Object.freeze({
      authorityId: attemptGradingAuthorityId,
      implementationDigest:
        PRODUCTION_AGENT_EVALUATION_ATTEMPT_GRADING_IMPLEMENTATION_DIGEST,
      durability,
      stage,
      execute: executeFor,
      reconcile: reconcileFor,
    }) satisfies AgentEvaluationAttemptOwnerAuthorityPort;

    let closePromise:
      | Promise<
          Readonly<{
            status: 'clean';
            residualResourceIds: Readonly<{
              providerCapability: readonly [];
              attemptGrading: readonly [];
            }>;
            residualCanaryIds: readonly [];
          }>
        >
      | undefined;
    const close = () => {
      closePromise ??= (async () => {
        draining = true;
        await queue.drain();
        if (source) {
          const retired = await source.close();
          if (
            !sameCanonicalJson(retired, {
              status: 'clean',
              residualResourceIds: [],
              residualCanaryIds: [],
            })
          ) {
            return fail('source-retirement');
          }
        }
        if (queue.size !== 0) return fail('residual-operation-lock');
        return Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze({
            providerCapability: Object.freeze([]) as readonly [],
            attemptGrading: Object.freeze([]) as readonly [],
          }),
          residualCanaryIds: Object.freeze([]) as readonly [],
        });
      })();
      return closePromise;
    };

    return Object.freeze({ providerCapability, attemptGrading, close });
  };

const maximumQualificationTemplateBytes = 16_777_216;
const maximumFrozenConfigCommitmentBytes = 1_048_576;
const evaluationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,46}$/u;

const requiredEnvironmentValue = (
  read: (name: string) => string | undefined,
  name: string
): string => {
  const value = read(name);
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 1_048_576 ||
    value !== value.trim() ||
    containsAsciiControlCharacter(value)
  ) {
    return fail(`environment-${name}`);
  }
  return value;
};

const readQualificationTemplate = async (
  source: string
): Promise<
  ReturnType<typeof decodeAgentEvaluationRunConfigQualificationTemplate>
> => {
  if (!isAbsolute(source)) return fail('template-path-absolute');
  const target = resolve(source);
  const metadata = await lstat(target);
  const concrete = await realpath(target);
  const exactPath =
    process.platform === 'win32'
      ? concrete.toLowerCase() === target.toLowerCase()
      : concrete === target;
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    !exactPath ||
    metadata.size <= 0 ||
    metadata.size > maximumQualificationTemplateBytes
  ) {
    return fail('template-file');
  }
  const bytes = await readFile(target);
  if (bytes.byteLength !== metadata.size) return fail('template-raced');
  return decodeAgentEvaluationRunConfigQualificationTemplate(bytes);
};

const hostedRegistrationIntentBindings = (
  plan: AgentModelEvaluationPlan
): readonly AgentHostedRetrievalRuntimeResourceRegistrationIntentBinding[] => {
  const bindings = plan.capabilityQualificationTargets.flatMap((target) => {
    const support = target.optionalCapabilitySupportAuthority;
    const source = support?.runtimeFactSourceAuthority;
    const registrationIntentDigest =
      source?.hostedRetrievalRuntimeResourceRegistrationIntentDigest;
    if (!support || !source || registrationIntentDigest === undefined) {
      return [];
    }
    if (
      support.capabilityId !== 'provider.hosted-retrieval' ||
      source.sourceKind !== 'sealed-hosted-owner-result' ||
      (target.protocolFamily !== 'gemini-interactions' &&
        target.protocolFamily !== 'openai-responses') ||
      (target.capabilityProfileId !== 'g4-provider-hosted-retrieval-core' &&
        target.capabilityProfileId !==
          'g4-provider-hosted-retrieval-document') ||
      source.protocolFamily !== target.protocolFamily ||
      source.providerConfigurationId !== target.providerConfigurationId ||
      source.modelId !== target.modelId ||
      source.modelLineageDigest !== target.modelLineageDigest ||
      source.capabilityProfileId !== target.capabilityProfileId ||
      source.capabilityProfileDigest !== target.capabilityProfileDigest
    ) {
      return fail('hosted-registration-source');
    }
    const provider = plan.providerConfigurations.find(
      (candidate) =>
        candidate.providerConfigurationId === target.providerConfigurationId
    );
    const model = plan.modelConfigurations.find(
      (candidate) => candidate.modelId === target.modelId
    );
    const program = support.probeEvidence.probeProgram;
    const publicResource = program.providerRequestIntent.publicProbeResource;
    if (
      !provider ||
      !model ||
      provider.adapter.protocolFamily !== target.protocolFamily ||
      provider.adapter.adapterDigest !== source.adapterDigest ||
      model.lineageDigest !== target.modelLineageDigest ||
      program.profileProjection.capabilityProfileId !==
        target.capabilityProfileId ||
      program.profileProjection.capabilityProfileDigest !==
        target.capabilityProfileDigest ||
      !publicResource
    ) {
      return fail('hosted-registration-preimage');
    }
    const intent = createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
      providerConfigurationId: provider.providerConfigurationId,
      providerConfigurationDigest: digestAgentCanonicalValue(provider),
      protocolFamily: target.protocolFamily,
      modelId: model.modelId,
      modelLineageDigest: model.lineageDigest,
      adapterDigest: provider.adapter.adapterDigest,
      capabilityProfileId: target.capabilityProfileId,
      capabilityProfileDigest: target.capabilityProfileDigest,
      probeProgramDigest: program.programDigest,
      publicResourceDescriptorDigest: publicResource.descriptorDigest,
    });
    if (intent.intentDigest !== registrationIntentDigest) {
      return fail('hosted-registration-intent');
    }
    return [
      Object.freeze({
        protocolFamily: target.protocolFamily,
        capabilityProfileId: target.capabilityProfileId,
        registrationIntentDigest,
      }),
    ];
  });
  const ordered = Object.freeze(
    [...bindings].sort((left, right) =>
      compareUnicodeCodePoints(
        `${left.protocolFamily}\u0000${left.capabilityProfileId}`,
        `${right.protocolFamily}\u0000${right.capabilityProfileId}`
      )
    )
  );
  if (
    ordered.length !== AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT ||
    new Set(
      ordered.map(
        (binding) =>
          `${binding.protocolFamily}\u0000${binding.capabilityProfileId}`
      )
    ).size !== ordered.length
  ) {
    return fail('hosted-registration-count');
  }
  return ordered;
};

export const loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding =
  async (input: {
    environment: (name: string) => string | undefined;
    namespaceId: string;
    clock?: () => Date;
  }) => {
    const observed = (input.clock ?? (() => new Date()))();
    if (!Number.isFinite(observed.getTime())) {
      return fail('hosted-binding-clock');
    }
    const observedAt = observed.toISOString();
    const commitmentPath = requiredEnvironmentValue(
      input.environment,
      AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_ENVIRONMENT_NAMES.outputPath
    );
    if (!isAbsolute(commitmentPath)) {
      return fail('frozen-config-commitment-path-absolute');
    }
    const target = resolve(commitmentPath);
    const metadata = await lstat(target);
    const concrete = await realpath(target);
    const exactPath =
      process.platform === 'win32'
        ? concrete.toLowerCase() === target.toLowerCase()
        : concrete === target;
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      !exactPath ||
      metadata.size <= 0 ||
      metadata.size > maximumFrozenConfigCommitmentBytes
    ) {
      return fail('frozen-config-commitment-file');
    }
    const files = createNodeAgentEvaluationCoordinatorFilePort({
      maximumBytes: maximumQualificationTemplateBytes,
    });
    const readCanonicalJson = files.readCanonicalJson;
    if (typeof readCanonicalJson !== 'function') {
      return fail('frozen-config-commitment-reader');
    }
    const commitment = decodeAgentEvaluationFrozenConfigCommitment(
      await readCanonicalJson(target)
    );
    const artifact = await loadProductionAgentEvaluationRunConfigArtifact({
      files,
      environment: input.environment,
      expectedRepositoryCommit: commitment.repositoryCommit,
      expectedPlanDigest: commitment.planDigest,
      observedAt,
    });
    const { config, artifactBinding } = artifact;
    const observedAtMs = Date.parse(observedAt);
    if (
      !sameCanonicalJson(
        artifactBinding,
        commitment.runConfigArtifactBinding
      ) ||
      config.sourceConfigDigest !== commitment.sourceConfigDigest ||
      config.frozenRunDigest !== commitment.frozenRunDigest ||
      config.plan.planDigest !== commitment.planDigest ||
      config.plan.repositoryCommit !== commitment.repositoryCommit ||
      config.plan.protectedHoldoutManifestDigest !==
        commitment.protectedHoldoutManifestDigest ||
      config.materialCatalog.restrictedMaterialManifestDigest !==
        commitment.restrictedMaterialManifestDigest ||
      config.plan.plannedAt !== commitment.committedAt ||
      observedAtMs < Date.parse(config.plan.plannedAt) ||
      observedAtMs >= Date.parse(config.plan.expiresAt)
    ) {
      return fail('frozen-config-commitment-binding');
    }
    const artifactNamePrefix = `g4-real-model-plan-${commitment.repositoryCommit}-`;
    const artifactNameSuffix = `-${artifactBinding.sourcePlanWorkflowRunAttempt}`;
    const artifactName = artifactBinding.sourcePlanArtifactName;
    if (
      !artifactName.startsWith(artifactNamePrefix) ||
      !artifactName.endsWith(artifactNameSuffix)
    ) {
      return fail('hosted-namespace-artifact');
    }
    const evaluationId = artifactName.slice(
      artifactNamePrefix.length,
      artifactName.length - artifactNameSuffix.length
    );
    const expectedNamespaceId = `g4-${evaluationId}-${commitment.repositoryCommit.slice(0, 12)}`;
    if (
      !evaluationIdPattern.test(evaluationId) ||
      input.namespaceId !== expectedNamespaceId
    ) {
      return fail('hosted-namespace-binding');
    }
    const signer = createEnvironmentAgentEvaluationAuthoritySigner({
      environment: input.environment,
      expectedAttestation: config.attestation,
      expectedJobId: 'full_shards',
    });
    const identity = signer.identity();
    const { signatureBase64Url, ...payload } = commitment;
    const message = new TextEncoder().encode(canonicalJsonText(payload));
    try {
      if (
        identity.authorityId !== commitment.authorityId ||
        identity.keyId !== commitment.keyId ||
        identity.workflowName !== commitment.workflowName ||
        identity.workflowRunId !== commitment.workflowRunId ||
        identity.jobId !== commitment.jobId ||
        identity.environmentDigest !== commitment.environmentDigest ||
        !signer.verify({
          publicKeyBase64Url: identity.publicKeyBase64Url,
          signatureBase64Url,
          message,
        })
      ) {
        return fail('frozen-config-commitment-signature');
      }
    } finally {
      message.fill(0);
    }
    return Object.freeze({
      scope: Object.freeze({
        namespaceId: expectedNamespaceId,
        repositoryCommit: commitment.repositoryCommit,
        planDigest: commitment.planDigest,
        frozenRunDigest: commitment.frozenRunDigest,
        runConfigArtifactBindingDigest: artifactBinding.bindingDigest,
      }),
      registrationIntentBindings: hostedRegistrationIntentBindings(config.plan),
    });
  };

const cleanOwnerReceipt = Object.freeze({
  status: 'clean' as const,
  residualResourceIds: Object.freeze([]) as readonly [],
  residualCanaryIds: Object.freeze([]) as readonly [],
});

/**
 * Composes the single purpose-bound Provider runtime owner used by registration
 * health and full-attempt execution. The stateful and metadata adapters share
 * one durable journal, transport, encrypted spool authority, and close barrier.
 */
export type CreateProductionAgentEvaluationAttemptOwnerAuthorityPortsFromEnvironmentInput =
  Parameters<AgentEvaluationProductionAttemptOwnerAuthorityPortFactory>[0] &
    Readonly<{
      fetch?: typeof fetch;
      clock?: () => Date;
      providerRuntime?: Pick<
        CreateProductionAgentEvaluationCapabilityEffectProviderRuntimeTransportInput,
        'fetcher' | 'journalFor' | 'journalHealth' | 'resolveHost' | 'secrets'
      >;
    }>;

export const createProductionAgentEvaluationAttemptOwnerAuthorityPortsFromEnvironment =
  async (
    input: CreateProductionAgentEvaluationAttemptOwnerAuthorityPortsFromEnvironmentInput
  ): Promise<AgentEvaluationProductionAttemptOwnerAuthorityPorts> => {
    const stateRoot = requiredEnvironmentValue(
      input.environment,
      AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.stateDirectory
    );
    const template = await readQualificationTemplate(
      requiredEnvironmentValue(
        input.environment,
        AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.runConfigTemplatePath
      )
    );
    const namespaceId = requiredEnvironmentValue(
      input.environment,
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
    );
    const repositoryCommit = requiredEnvironmentValue(
      input.environment,
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
    );
    if (
      !isAbsolute(stateRoot) ||
      !isAgentControlIdentity(namespaceId) ||
      repositoryCommit !== template.repositoryCommit
    ) {
      return fail('environment-binding');
    }
    const expectedSourceIdentities = Object.freeze(
      template.nativeIdentities.flatMap((identity) =>
        Object.values(identity.expectedRuntimeFactSourceIdentities)
      )
    );
    if (expectedSourceIdentities.length !== 15) {
      return fail('runtime-source-identity-count');
    }

    const probeSpoolKeys =
      input.purpose === 'preplan'
        ? new EnvironmentAgentEvaluationCapabilityProbeSpoolKeyResolver({
            profile: template.capabilityProbeResponseSpoolEncryption,
            environment: input.environment,
          })
        : undefined;
    if (probeSpoolKeys) {
      await probeSpoolKeys.use(
        {
          useId: 'capability-probe-phase.startup-preflight',
          purpose: 'decrypt',
        },
        async () => true
      );
    }

    const providerRuntime =
      createProductionAgentEvaluationCapabilityEffectProviderRuntimeTransport({
        environment: input.environment,
        forbiddenCanaries: input.forbiddenCanaries,
        executionEnabled: input.purpose === 'full-attempt',
        ...(input.fetch ? { fetch: input.fetch } : {}),
        ...(input.clock ? { clock: input.clock } : {}),
        ...input.providerRuntime,
        spoolCipher:
          createAgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher(
            {
              keys: new EnvironmentAgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyResolver(
                input.environment
              ),
            }
          ),
      });
    const stateVaultHealth =
      createEnvironmentProductionAgentEvaluationNativeProviderStateVaultHealthReader(
        {
          expectedAuthority:
            template.nativeProviderStateVaultEncryption.authority,
          environment: input.environment,
          ...(input.fetch ? { fetch: input.fetch } : {}),
          ...(input.clock ? { clock: input.clock } : {}),
        }
      );
    const statefulOwner =
      createProductionAgentEvaluationSharedEffectStatefulOwner({
        expectedVaultAuthority:
          template.nativeProviderStateVaultEncryption.authority,
        stateVaultFor(binding) {
          return createEnvironmentProductionAgentEvaluationNativeProviderStateVaultClient(
            {
              planDigest: binding.toolInput.planDigest,
              repositoryCommit: binding.toolInput.repositoryCommit,
              expectedAuthority:
                template.nativeProviderStateVaultEncryption.authority,
              environment: input.environment,
              ...(input.fetch ? { fetch: input.fetch } : {}),
              forbiddenCanaries: input.forbiddenCanaries,
            }
          );
        },
        stateVaultHealth,
        transport:
          createProductionAgentEvaluationSharedEffectStatefulRuntimeTransport(
            providerRuntime
          ),
        forbiddenCanaries: input.forbiddenCanaries,
      });
    const metadataOwner =
      createProductionAgentEvaluationSharedEffectMetadataRuntimeOwner(
        providerRuntime
      );
    const hostedOwner =
      input.purpose === 'full-attempt'
        ? await (async () => {
            const binding =
              await loadProductionAgentEvaluationFullAttemptHostedRuntimeBinding(
                {
                  environment: input.environment,
                  namespaceId,
                  ...(input.clock ? { clock: input.clock } : {}),
                }
              );
            if (binding.scope.repositoryCommit !== repositoryCommit) {
              return fail('hosted-repository-binding');
            }
            const readerOwnerInstanceId = requiredEnvironmentValue(
              input.environment,
              PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME
            );
            if (!isAgentControlIdentity(readerOwnerInstanceId)) {
              return fail('hosted-reader-owner');
            }
            return createProductionAgentEvaluationSharedEffectHostedOwner({
              scope: binding.scope,
              registrationIntentBindings: binding.registrationIntentBindings,
              readerOwnerInstanceId,
              ...(input.clock ? { clock: input.clock } : {}),
              client:
                createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceClient(
                  {
                    ...binding.scope,
                    environment: input.environment,
                    ...(input.fetch ? { fetch: input.fetch } : {}),
                    ...(input.clock ? { clock: input.clock } : {}),
                    forbiddenCanaries: input.forbiddenCanaries,
                  }
                ),
              transport:
                createProductionAgentEvaluationSharedEffectHostedRuntimeTransport(
                  providerRuntime
                ),
            });
          })()
        : (() => {
            const ownerHealthBinding =
              createProductionAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthBinding(
                namespaceId
              );
            return createProductionAgentEvaluationSharedEffectHostedPreactivationOwner(
              {
                ownerHealthBinding,
                ...(input.clock ? { clock: input.clock } : {}),
                client:
                  createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceOwnerHealthClient(
                    {
                      ...ownerHealthBinding,
                      environment: input.environment,
                      ...(input.fetch ? { fetch: input.fetch } : {}),
                      ...(input.clock ? { clock: input.clock } : {}),
                      forbiddenCanaries: input.forbiddenCanaries,
                    }
                  ),
                transport:
                  createProductionAgentEvaluationSharedEffectHostedPreactivationRuntimeTransport(
                    providerRuntime
                  ),
              }
            );
          })();
    const sharedExecutor = createProductionAgentEvaluationSharedEffectExecutor({
      template,
      environment: input.environment,
      forbiddenCanaries: input.forbiddenCanaries,
      statefulOwner,
      hostedOwner,
      metadataOwner,
      ...(input.fetch ? { fetch: input.fetch } : {}),
      ...(input.clock ? { clock: input.clock } : {}),
    });
    const sharedOwner =
      await createFileProductionAgentEvaluationSharedEffectOwner({
        stateDirectory: join(stateRoot, 'shared-effect'),
        executor: sharedExecutor,
        expectedSourceIdentities,
        forbiddenCanaries: input.forbiddenCanaries,
        ...(input.clock ? { clock: input.clock } : {}),
      });
    if (input.purpose === 'full-attempt') {
      let attemptPorts: Awaited<
        ReturnType<
          typeof createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts
        >
      >;
      try {
        attemptPorts =
          await createFileProductionAgentEvaluationAttemptOwnerAuthorityPorts({
            stateDirectory: join(stateRoot, 'attempt-authority'),
            forbiddenCanaries: input.forbiddenCanaries,
            capabilityObservationSource: sharedOwner.observationSource,
          });
      } catch (caught) {
        await sharedOwner.observationSource.close().catch(() => undefined);
        throw caught;
      }
      let closePromise: ReturnType<typeof attemptPorts.close> | undefined;
      return Object.freeze({
        purpose: 'full-attempt' as const,
        providerCapability: attemptPorts.providerCapability,
        attemptGrading: attemptPorts.attemptGrading,
        close() {
          closePromise ??= attemptPorts.close();
          return closePromise;
        },
      });
    }

    let probeExecutor:
      | ReturnType<
          typeof createProductionAgentEvaluationCapabilityProbeExecutor
        >
      | undefined;
    let resourceOwner:
      | Awaited<
          ReturnType<
            typeof createProductionAgentEvaluationCapabilityProbeProviderResourceOwner
          >
        >
      | undefined;
    try {
      const probePhaseTransport =
        await createProductionAgentEvaluationCapabilityProbePhaseTransport({
          stateDirectory: join(stateRoot, 'capability-probe-phases'),
          encryptionProfile: template.capabilityProbeResponseSpoolEncryption,
          forbiddenCanaries: input.forbiddenCanaries,
          environment: input.environment,
          keys: probeSpoolKeys,
        });
      probeExecutor = createProductionAgentEvaluationCapabilityProbeExecutor({
        phaseTransport: probePhaseTransport,
        responseSpoolIngress:
          createEnvironmentAgentEvaluationCapabilityProbeResponseSpoolIngressClient(
            {
              namespaceId,
              repositoryCommit,
              forbiddenCanaries: input.forbiddenCanaries,
              environment: input.environment,
            }
          ),
        referenceIngress:
          createEnvironmentAgentEvaluationCapabilityProbeReferenceIngressClient(
            {
              namespaceId,
              repositoryCommit,
              forbiddenCanaries: input.forbiddenCanaries,
              environment: input.environment,
            }
          ),
        encryptionPolicyDigest:
          template.capabilityProbeResponseSpoolEncryption
            .encryptionPolicyDigest,
        normalizerImplementationDigest:
          PRODUCTION_AGENT_EVALUATION_CAPABILITY_PROBE_PHASE_TRANSPORT_IMPLEMENTATION_DIGEST,
      });
      resourceOwner =
        await createProductionAgentEvaluationCapabilityProbeProviderResourceOwner(
          {
            stateDirectory: join(stateRoot, 'capability-probe-resources'),
            transport:
              createEnvironmentAgentEvaluationCapabilityProbeProviderResourceTransport(
                { environment: input.environment }
              ),
            cleanupClient:
              createEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClient(
                {
                  namespaceId,
                  repositoryCommit,
                  environment: input.environment,
                  ...(input.fetch ? { fetch: input.fetch } : {}),
                }
              ),
            forbiddenCanaries: input.forbiddenCanaries,
          }
        );
    } catch (caught) {
      await Promise.allSettled([
        sharedOwner.observationSource.close(),
        probeExecutor?.close() ?? Promise.resolve(cleanOwnerReceipt),
        resourceOwner?.close() ?? Promise.resolve(cleanOwnerReceipt),
      ]);
      throw caught;
    }

    const registrationOwner =
      createProductionAgentEvaluationRuntimeFactSourceRegistrationOwner({
        expectedSourceIdentities,
        healthRegistry: sharedOwner.healthRegistry,
        ...(input.clock ? { clock: input.clock } : {}),
      });
    let closePromise:
      | Promise<
          Readonly<{
            status: 'clean';
            residualResourceIds: Readonly<{
              capabilityProbe: readonly [];
              capabilityProbeProviderResource: readonly [];
              capabilityProbeProviderResourceCleanup: readonly [];
              runtimeFactSourceRegistration: readonly [];
            }>;
            residualCanaryIds: readonly [];
          }>
        >
      | undefined;
    const close = () => {
      closePromise ??= (async () => {
        const [sharedReceipt, probeReceipt, resourceReceipt] =
          await Promise.all([
            sharedOwner.observationSource.close(),
            probeExecutor.close(),
            resourceOwner.close(),
          ]);
        if (
          !sameCanonicalJson(sharedReceipt, cleanOwnerReceipt) ||
          !sameCanonicalJson(probeReceipt, cleanOwnerReceipt) ||
          !sameCanonicalJson(resourceReceipt, cleanOwnerReceipt)
        ) {
          return fail('environment-owner-close');
        }
        return Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze({
            capabilityProbe: Object.freeze([]) as readonly [],
            capabilityProbeProviderResource: Object.freeze([]) as readonly [],
            capabilityProbeProviderResourceCleanup: Object.freeze(
              []
            ) as readonly [],
            runtimeFactSourceRegistration: Object.freeze([]) as readonly [],
          }),
          residualCanaryIds: Object.freeze([]) as readonly [],
        });
      })();
      return closePromise;
    };
    return Object.freeze({
      purpose: 'preplan' as const,
      capabilityProbe: probeExecutor.port,
      capabilityProbeProviderResource: resourceOwner.port,
      capabilityProbeProviderResourceCleanup: resourceOwner.cleanupPort,
      runtimeFactSourceRegistration: registrationOwner,
      close,
    });
  };
