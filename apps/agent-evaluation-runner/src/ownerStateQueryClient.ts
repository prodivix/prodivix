import { createHash } from 'node:crypto';

import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  createEnvironmentAgentEvaluationLedgerClient,
  type AgentEvaluationLedgerRequestOptions,
} from './ledgerClient';
import {
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACT_BYTES,
  decodeAgentEvaluationOwnerStateBundle,
  decodeAgentEvaluationOwnerStateCASDescriptor,
  type AgentEvaluationOwnerStateBundle,
  type AgentEvaluationOwnerStateCASDescriptor,
  type AgentEvaluationOwnerStateIdentityInput,
  type AgentEvaluationOwnerStateServiceKind,
} from './ownerState';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';

export const AGENT_EVALUATION_OWNER_STATE_LIST_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-owner-state-list-response' as const;
export const AGENT_EVALUATION_OWNER_STATE_READ_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-owner-state-read-response' as const;
export const AGENT_EVALUATION_OWNER_STATE_CAS_READ_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-owner-state-cas-read-response' as const;

const repositoryCommitPattern = /^[a-f0-9]{40}$/u;

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationOwnerStateQueryBinding =
  | Readonly<{
      serviceKind: 'controlled-workspace';
      operation: 'session.orphans.list';
    }>
  | Readonly<{
      serviceKind: 'verification-evidence';
      operation: 'verified-view.resolve';
    }>;

export type AgentEvaluationOwnerStateMetadata = Readonly<{
  ownerStateId: CanonicalDigest;
  ownerStateRevision: number;
  ownerStateRootDigest: CanonicalDigest;
  snapshotKind: AgentEvaluationOwnerStateServiceKind;
  snapshotDigest: CanonicalDigest;
  snapshotState:
    'active' | 'destroyed' | 'prepared' | 'finalized' | 'registered';
  updatedAt: string;
}>;

export type AgentEvaluationOwnerStateListPage = Readonly<{
  serviceKind: AgentEvaluationOwnerStateServiceKind;
  operation: AgentEvaluationOwnerStateQueryBinding['operation'];
  cursor: CanonicalDigest | null;
  states: readonly AgentEvaluationOwnerStateMetadata[];
  stateSetDigest: CanonicalDigest;
  nextCursor: CanonicalDigest | null;
  responseDigest: CanonicalDigest;
}>;

export type AgentEvaluationOwnerStateReadResult =
  AgentEvaluationOwnerStateMetadata &
    Readonly<{
      serviceKind: AgentEvaluationOwnerStateServiceKind;
      operation: AgentEvaluationOwnerStateQueryBinding['operation'];
      ownerStateBundle: AgentEvaluationOwnerStateBundle;
      responseDigest: CanonicalDigest;
    }>;

export type AgentEvaluationOwnerStateCASReadResult = Readonly<{
  serviceKind: AgentEvaluationOwnerStateServiceKind;
  operation: AgentEvaluationOwnerStateQueryBinding['operation'];
  ownerStateId: CanonicalDigest;
  ownerStateRevision: number;
  ownerStateRootDigest: CanonicalDigest;
  descriptor: AgentEvaluationOwnerStateCASDescriptor;
  content: Uint8Array;
  responseDigest: CanonicalDigest;
}>;

export interface AgentEvaluationOwnerStateQueryClient {
  list(
    binding: AgentEvaluationOwnerStateQueryBinding,
    input: Readonly<{ limit: number; cursor?: CanonicalDigest }>,
    options?: AgentEvaluationLedgerRequestOptions
  ): Promise<AgentEvaluationOwnerStateListPage>;
  read(
    binding: AgentEvaluationOwnerStateQueryBinding,
    ownerStateId: CanonicalDigest,
    options?: AgentEvaluationLedgerRequestOptions
  ): Promise<AgentEvaluationOwnerStateReadResult>;
  readArtifact(
    binding: AgentEvaluationOwnerStateQueryBinding,
    ownerState: AgentEvaluationOwnerStateReadResult,
    descriptor: AgentEvaluationOwnerStateCASDescriptor,
    options?: AgentEvaluationLedgerRequestOptions
  ): Promise<AgentEvaluationOwnerStateCASReadResult>;
}

export type CreateEnvironmentAgentEvaluationOwnerStateQueryClientInput =
  Readonly<{
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    forbiddenCanaries: () => readonly string[];
    environment?: Environment;
    fetch?: typeof fetch;
  }>;

const responseInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
};

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionCompositionUnavailable
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

const positiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

const nullableDigest = (value: unknown): value is CanonicalDigest | null =>
  value === null || isAgentCanonicalDigest(value);

const validBinding = (value: AgentEvaluationOwnerStateQueryBinding): boolean =>
  (value.serviceKind === 'controlled-workspace' &&
    value.operation === 'session.orphans.list') ||
  (value.serviceKind === 'verification-evidence' &&
    value.operation === 'verified-view.resolve');

const validSnapshotState = (
  serviceKind: AgentEvaluationOwnerStateServiceKind,
  value: unknown
): value is AgentEvaluationOwnerStateMetadata['snapshotState'] =>
  serviceKind === 'controlled-workspace'
    ? value === 'active' || value === 'destroyed'
    : value === 'registered' ||
      value === 'active' ||
      value === 'prepared' ||
      value === 'finalized' ||
      value === 'destroyed';

const metadataKeys = Object.freeze([
  'ownerStateId',
  'ownerStateRevision',
  'ownerStateRootDigest',
  'snapshotKind',
  'snapshotDigest',
  'snapshotState',
  'updatedAt',
] as const);

const decodeMetadata = (
  value: unknown,
  serviceKind: AgentEvaluationOwnerStateServiceKind
): AgentEvaluationOwnerStateMetadata => {
  if (
    !exactRecord(value, metadataKeys) ||
    !isAgentCanonicalDigest(value.ownerStateId) ||
    !positiveInteger(value.ownerStateRevision) ||
    !isAgentCanonicalDigest(value.ownerStateRootDigest) ||
    value.snapshotKind !== serviceKind ||
    !isAgentCanonicalDigest(value.snapshotDigest) ||
    !validSnapshotState(serviceKind, value.snapshotState) ||
    !isAgentControlInstant(value.updatedAt)
  ) {
    return responseInvalid();
  }
  return Object.freeze({
    ownerStateId: value.ownerStateId,
    ownerStateRevision: value.ownerStateRevision,
    ownerStateRootDigest: value.ownerStateRootDigest,
    snapshotKind: serviceKind,
    snapshotDigest: value.snapshotDigest,
    snapshotState: value.snapshotState,
    updatedAt: value.updatedAt,
  });
};

const identityFromBundle = (
  value: unknown,
  expected: Readonly<{
    serviceKind: AgentEvaluationOwnerStateServiceKind;
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
  }>
): AgentEvaluationOwnerStateIdentityInput &
  Readonly<{
    revision: number;
    previousOwnerStateRootDigest: CanonicalDigest | null;
  }> => {
  if (!isPlainObject(value) || !isPlainObject(value.snapshot)) {
    return responseInvalid();
  }
  const snapshot = value.snapshot;
  const grantOrAuthorityDigest =
    expected.serviceKind === 'controlled-workspace'
      ? snapshot.grantDigest
      : snapshot.authorityDigest;
  if (
    value.serviceKind !== expected.serviceKind ||
    value.namespaceId !== expected.namespaceId ||
    value.planDigest !== expected.planDigest ||
    value.repositoryCommit !== expected.repositoryCommit ||
    snapshot.namespaceId !== expected.namespaceId ||
    snapshot.planDigest !== expected.planDigest ||
    snapshot.repositoryCommit !== expected.repositoryCommit ||
    !isAgentControlIdentity(snapshot.attemptId) ||
    !isAgentCanonicalDigest(snapshot.descriptorDigest) ||
    !positiveInteger(snapshot.generation) ||
    !isAgentCanonicalDigest(grantOrAuthorityDigest) ||
    !positiveInteger(value.revision) ||
    !nullableDigest(value.previousOwnerStateRootDigest)
  ) {
    return responseInvalid();
  }
  return Object.freeze({
    serviceKind: expected.serviceKind,
    namespaceId: expected.namespaceId,
    planDigest: expected.planDigest,
    repositoryCommit: expected.repositoryCommit,
    attemptId: snapshot.attemptId,
    descriptorDigest: snapshot.descriptorDigest,
    generation: snapshot.generation,
    grantOrAuthorityDigest,
    revision: value.revision,
    previousOwnerStateRootDigest: value.previousOwnerStateRootDigest,
  });
};

const decodeListPage = (
  value: unknown,
  binding: AgentEvaluationOwnerStateQueryBinding,
  input: Readonly<{ limit: number; cursor?: CanonicalDigest }>
): AgentEvaluationOwnerStateListPage => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'serviceKind',
      'operation',
      'cursor',
      'states',
      'stateSetDigest',
      'nextCursor',
      'responseDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_OWNER_STATE_LIST_RESPONSE_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_STATE_VERSION ||
    value.serviceKind !== binding.serviceKind ||
    value.operation !== binding.operation ||
    value.cursor !== (input.cursor ?? null) ||
    !Array.isArray(value.states) ||
    value.states.length > input.limit ||
    !nullableDigest(value.nextCursor) ||
    !isAgentCanonicalDigest(value.stateSetDigest) ||
    !isAgentCanonicalDigest(value.responseDigest)
  ) {
    return responseInvalid();
  }
  const states = Object.freeze(
    value.states.map((entry) => decodeMetadata(entry, binding.serviceKind))
  );
  const ordered = [...states].sort((left, right) =>
    compareUnicodeCodePoints(left.ownerStateId, right.ownerStateId)
  );
  if (
    new Set(states.map(({ ownerStateId }) => ownerStateId)).size !==
      states.length ||
    !sameCanonicalJson(states, ordered) ||
    value.stateSetDigest !== digestAgentCanonicalValue(states)
  ) {
    return responseInvalid();
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_LIST_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: binding.serviceKind,
    operation: binding.operation,
    cursor: input.cursor ?? null,
    states,
    stateSetDigest: value.stateSetDigest,
    nextCursor: value.nextCursor,
  });
  if (value.responseDigest !== digestAgentCanonicalValue(base)) {
    return responseInvalid();
  }
  return Object.freeze({ ...base, responseDigest: value.responseDigest });
};

const decodeReadResult = (
  value: unknown,
  binding: AgentEvaluationOwnerStateQueryBinding,
  expected: Readonly<{
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    ownerStateId: CanonicalDigest;
  }>
): AgentEvaluationOwnerStateReadResult => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'serviceKind',
      'operation',
      ...metadataKeys,
      'ownerStateBundle',
      'responseDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_OWNER_STATE_READ_RESPONSE_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_STATE_VERSION ||
    value.serviceKind !== binding.serviceKind ||
    value.operation !== binding.operation ||
    value.ownerStateId !== expected.ownerStateId ||
    !isAgentCanonicalDigest(value.responseDigest)
  ) {
    return responseInvalid();
  }
  const metadata = decodeMetadata(
    Object.fromEntries(metadataKeys.map((key) => [key, value[key]])),
    binding.serviceKind
  );
  let ownerStateBundle: AgentEvaluationOwnerStateBundle;
  try {
    ownerStateBundle = decodeAgentEvaluationOwnerStateBundle(
      value.ownerStateBundle,
      identityFromBundle(value.ownerStateBundle, {
        serviceKind: binding.serviceKind,
        namespaceId: expected.namespaceId,
        planDigest: expected.planDigest,
        repositoryCommit: expected.repositoryCommit,
      })
    );
  } catch {
    return responseInvalid();
  }
  if (
    metadata.ownerStateId !== ownerStateBundle.ownerStateId ||
    metadata.ownerStateRevision !== ownerStateBundle.revision ||
    metadata.ownerStateRootDigest !==
      digestAgentCanonicalValue(ownerStateBundle) ||
    metadata.snapshotKind !== ownerStateBundle.snapshotKind ||
    metadata.snapshotDigest !== ownerStateBundle.snapshotDigest ||
    metadata.snapshotState !== ownerStateBundle.snapshot.state
  ) {
    return responseInvalid();
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_READ_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: binding.serviceKind,
    operation: binding.operation,
    ...metadata,
    ownerStateBundle,
  });
  if (value.responseDigest !== digestAgentCanonicalValue(base)) {
    return responseInvalid();
  }
  return Object.freeze({ ...base, responseDigest: value.responseDigest });
};

const maximumCASBase64Length =
  Math.ceil(AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACT_BYTES / 3) * 4;
const canonicalBase64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

const decodeCanonicalBase64 = (value: unknown): Uint8Array => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maximumCASBase64Length ||
    !canonicalBase64Pattern.test(value)
  ) {
    return responseInvalid();
  }
  const buffer = Buffer.from(value, 'base64');
  try {
    if (
      buffer.byteLength === 0 ||
      buffer.byteLength >
        AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACT_BYTES ||
      buffer.toString('base64') !== value
    ) {
      return responseInvalid();
    }
    return Uint8Array.from(buffer);
  } finally {
    buffer.fill(0);
  }
};

const sha256Digest = (value: Uint8Array): CanonicalDigest =>
  `sha256-${createHash('sha256').update(value).digest('hex')}` as CanonicalDigest;

const decodeCASReadResult = (
  value: unknown,
  binding: AgentEvaluationOwnerStateQueryBinding,
  ownerState: AgentEvaluationOwnerStateReadResult,
  requestedDescriptor: AgentEvaluationOwnerStateCASDescriptor
): AgentEvaluationOwnerStateCASReadResult => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'serviceKind',
      'operation',
      'ownerStateId',
      'ownerStateRevision',
      'ownerStateRootDigest',
      'descriptor',
      'contentBase64',
      'responseDigest',
    ]) ||
    value.format !== AGENT_EVALUATION_OWNER_STATE_CAS_READ_RESPONSE_FORMAT ||
    value.version !== AGENT_EVALUATION_OWNER_STATE_VERSION ||
    value.serviceKind !== binding.serviceKind ||
    value.operation !== binding.operation ||
    value.ownerStateId !== ownerState.ownerStateId ||
    value.ownerStateRevision !== ownerState.ownerStateRevision ||
    value.ownerStateRootDigest !== ownerState.ownerStateRootDigest ||
    !isAgentCanonicalDigest(value.responseDigest)
  ) {
    return responseInvalid();
  }
  let descriptor: AgentEvaluationOwnerStateCASDescriptor;
  try {
    descriptor = decodeAgentEvaluationOwnerStateCASDescriptor(value.descriptor);
  } catch {
    return responseInvalid();
  }
  if (!sameCanonicalJson(descriptor, requestedDescriptor)) {
    return responseInvalid();
  }
  const content = decodeCanonicalBase64(value.contentBase64);
  if (
    content.byteLength !== descriptor.byteLength ||
    sha256Digest(content) !== descriptor.artifactDigest
  ) {
    content.fill(0);
    return responseInvalid();
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_CAS_READ_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: binding.serviceKind,
    operation: binding.operation,
    ownerStateId: ownerState.ownerStateId,
    ownerStateRevision: ownerState.ownerStateRevision,
    ownerStateRootDigest: ownerState.ownerStateRootDigest,
    descriptor,
    contentBase64: value.contentBase64,
  });
  if (value.responseDigest !== digestAgentCanonicalValue(base)) {
    content.fill(0);
    return responseInvalid();
  }
  return Object.freeze({
    serviceKind: binding.serviceKind,
    operation: binding.operation,
    ownerStateId: ownerState.ownerStateId,
    ownerStateRevision: ownerState.ownerStateRevision,
    ownerStateRootDigest: ownerState.ownerStateRootDigest,
    descriptor,
    content,
    responseDigest: value.responseDigest,
  });
};

export const createEnvironmentAgentEvaluationOwnerStateQueryClient = (
  input: CreateEnvironmentAgentEvaluationOwnerStateQueryClientInput
): AgentEvaluationOwnerStateQueryClient => {
  if (
    !isAgentControlIdentity(input.namespaceId) ||
    !isAgentCanonicalDigest(input.planDigest) ||
    !repositoryCommitPattern.test(input.repositoryCommit) ||
    typeof input.forbiddenCanaries !== 'function'
  ) {
    return unavailable();
  }
  const ledger = createEnvironmentAgentEvaluationLedgerClient({
    planDigest: input.planDigest,
    ...(input.environment ? { environment: input.environment } : {}),
    ...(input.fetch ? { fetch: input.fetch } : {}),
  });
  if (
    ledger.scope.namespace !== input.namespaceId ||
    ledger.scope.planDigest !== input.planDigest ||
    ledger.scope.repositoryCommit !== input.repositoryCommit
  ) {
    return unavailable();
  }
  const client: AgentEvaluationOwnerStateQueryClient = {
    async list(binding, page, options) {
      if (
        !validBinding(binding) ||
        !positiveInteger(page.limit) ||
        page.limit > 128 ||
        (page.cursor !== undefined && !isAgentCanonicalDigest(page.cursor))
      ) {
        return responseInvalid();
      }
      const value = await ledger.listOwnerStates(
        { ...binding, ...page },
        options
      );
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        value,
        input.forbiddenCanaries
      );
      return decodeListPage(value, binding, page);
    },
    async read(binding, ownerStateId, options) {
      if (!validBinding(binding) || !isAgentCanonicalDigest(ownerStateId)) {
        return responseInvalid();
      }
      const value = await ledger.getOwnerState(ownerStateId, binding, options);
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        value,
        input.forbiddenCanaries
      );
      return decodeReadResult(value, binding, {
        namespaceId: input.namespaceId,
        planDigest: input.planDigest,
        repositoryCommit: input.repositoryCommit,
        ownerStateId,
      });
    },
    async readArtifact(binding, ownerState, descriptorValue, options) {
      let descriptor: AgentEvaluationOwnerStateCASDescriptor;
      try {
        descriptor =
          decodeAgentEvaluationOwnerStateCASDescriptor(descriptorValue);
      } catch {
        return responseInvalid();
      }
      const referencedDescriptor =
        ownerState.ownerStateBundle.casArtifacts.find(
          ({ artifactRef }) => artifactRef === descriptor.artifactRef
        );
      if (
        !validBinding(binding) ||
        ownerState.serviceKind !== binding.serviceKind ||
        ownerState.operation !== binding.operation ||
        ownerState.ownerStateBundle.serviceKind !== binding.serviceKind ||
        ownerState.ownerStateBundle.ownerStateId !== ownerState.ownerStateId ||
        ownerState.ownerStateBundle.revision !==
          ownerState.ownerStateRevision ||
        digestAgentCanonicalValue(ownerState.ownerStateBundle) !==
          ownerState.ownerStateRootDigest ||
        !referencedDescriptor ||
        !sameCanonicalJson(referencedDescriptor, descriptor)
      ) {
        return responseInvalid();
      }
      const value = await ledger.getOwnerStateCASArtifact(
        ownerState.ownerStateId,
        {
          ...binding,
          artifactRef: descriptor.artifactRef,
          descriptorDigest: descriptor.descriptorDigest,
        },
        options
      );
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        value,
        input.forbiddenCanaries
      );
      const result = decodeCASReadResult(
        value,
        binding,
        ownerState,
        descriptor
      );
      try {
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          result.content,
          input.forbiddenCanaries
        );
      } catch (error) {
        result.content.fill(0);
        throw error;
      }
      return result;
    },
  };
  return Object.freeze(client);
};
