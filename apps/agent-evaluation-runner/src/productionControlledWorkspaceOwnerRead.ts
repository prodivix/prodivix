import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  assertProductionAgentEvaluationG3SandboxCanaryClean,
  type AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource,
} from './controlledWorkspaceG3CellAdapter';
import type { AgentEvaluationControlledWorkspaceOrphanSession } from './controlledWorkspaceRuntime';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
  type AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
} from './ownerState';
import {
  createEnvironmentAgentEvaluationOwnerStateQueryClient,
  type AgentEvaluationOwnerStateMetadata,
  type AgentEvaluationOwnerStateQueryClient,
  type AgentEvaluationOwnerStateReadResult,
} from './ownerStateQueryClient';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';

export const PRODUCTION_AGENT_EVALUATION_MAXIMUM_OWNER_STATES = 14_040;
export const PRODUCTION_AGENT_EVALUATION_MAXIMUM_ORPHAN_FACTS = 128;
const ownerStatePageLimit = 128;
const maximumOwnerStatePages = Math.ceil(
  PRODUCTION_AGENT_EVALUATION_MAXIMUM_OWNER_STATES / ownerStatePageLimit
);
const repositoryCommitPattern = /^[a-f0-9]{40}$/u;
const binding = Object.freeze({
  serviceKind: 'controlled-workspace' as const,
  operation: 'session.orphans.list' as const,
});

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type ProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority =
  Readonly<{
    read(
      request: AgentEvaluationOwnerAuthorityRequest
    ): Promise<readonly AgentEvaluationControlledWorkspaceOrphanSession[]>;
  }>;

export type CreateProductionAgentEvaluationControlledWorkspaceOwnerReadAuthorityInput =
  Readonly<{
    ownerStateQueryFor(
      request: AgentEvaluationOwnerAuthorityRequest
    ): AgentEvaluationOwnerStateQueryClient;
    forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
  }>;

export type CreateEnvironmentProductionAgentEvaluationControlledWorkspaceOwnerReadAuthorityInput =
  Readonly<{
    forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
    environment?: Environment;
    fetch?: typeof fetch;
  }>;

const fail = (code: string): never => {
  throw new TypeError(`G4_CONTROLLED_WORKSPACE_OWNER_READ_INVALID: ${code}`);
};

const assertReadRequest = (
  request: AgentEvaluationOwnerAuthorityRequest
): Readonly<{
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
}> => {
  if (
    request.format !== AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT ||
    request.version !== AGENT_EVALUATION_OWNER_AUTHORITY_VERSION ||
    request.serviceKind !== 'controlled-workspace' ||
    request.mode !== 'read' ||
    request.operation !== binding.operation ||
    request.routeBinding !== 'sessions/orphans/list' ||
    !isAgentControlIdentity(request.namespaceId) ||
    !isAgentCanonicalDigest(request.planDigest) ||
    !repositoryCommitPattern.test(request.repositoryCommit) ||
    !isAgentCanonicalDigest(request.requestDigest) ||
    request.claimGeneration !== 0 ||
    !isPlainObject(request.payload) ||
    Object.keys(request.payload).length !== 0 ||
    Object.getOwnPropertySymbols(request.payload).length !== 0 ||
    request.sessionId !== undefined ||
    request.attemptId !== undefined ||
    request.descriptorDigest !== undefined ||
    request.generation !== undefined ||
    request.controlledWorkspaceGrantDigest !== undefined ||
    request.ownerStateRevision !== undefined ||
    request.ownerStateBundle !== undefined ||
    request.ownerStateRootDigest !== undefined ||
    request.sealedOwnerOperation !== undefined
  ) {
    return fail('request-binding');
  }
  return Object.freeze({
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
  });
};

const metadataMatchesRead = (
  metadata: AgentEvaluationOwnerStateMetadata,
  state: AgentEvaluationOwnerStateReadResult
): boolean =>
  metadata.ownerStateId === state.ownerStateId &&
  metadata.ownerStateRevision === state.ownerStateRevision &&
  metadata.ownerStateRootDigest === state.ownerStateRootDigest &&
  metadata.snapshotKind === state.snapshotKind &&
  metadata.snapshotDigest === state.snapshotDigest &&
  metadata.snapshotState === state.snapshotState &&
  metadata.updatedAt === state.updatedAt;

const controlledSnapshot = (
  state: AgentEvaluationOwnerStateReadResult,
  expected: Readonly<{
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
  }>
): AgentEvaluationControlledWorkspaceOwnerStateSnapshot => {
  const snapshot = state.ownerStateBundle.snapshot;
  if (
    state.serviceKind !== 'controlled-workspace' ||
    state.operation !== 'session.orphans.list' ||
    state.snapshotKind !== 'controlled-workspace' ||
    snapshot.format !==
      AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT ||
    snapshot.namespaceId !== expected.namespaceId ||
    snapshot.planDigest !== expected.planDigest ||
    snapshot.repositoryCommit !== expected.repositoryCommit ||
    snapshot.state !== 'active' ||
    snapshot.initialCheckpoint === null ||
    snapshot.currentCheckpoint === null
  ) {
    return fail('durable-snapshot-binding');
  }
  return snapshot;
};

const orphanFor = (
  snapshot: AgentEvaluationControlledWorkspaceOwnerStateSnapshot
): AgentEvaluationControlledWorkspaceOrphanSession => {
  const currentCheckpoint =
    snapshot.currentCheckpoint ?? fail('current-checkpoint');
  const base = Object.freeze({
    planDigest: snapshot.planDigest,
    attemptId: snapshot.attemptId,
    modelDescriptorDigest: snapshot.descriptorDigest,
    caseId: snapshot.caseId,
    materialDigest: snapshot.materialDigest,
    grantDigest: snapshot.grantDigest,
    generation: snapshot.generation,
    sessionId: snapshot.sessionId,
    currentCheckpoint,
  });
  return Object.freeze({
    ...base,
    orphanReceiptDigest: digestAgentCanonicalValue(base),
  });
};

export const createProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority =
  (
    input: CreateProductionAgentEvaluationControlledWorkspaceOwnerReadAuthorityInput
  ): ProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority => {
    if (
      typeof input.ownerStateQueryFor !== 'function' ||
      typeof input.forbiddenCanaries !== 'function'
    ) {
      return fail('factory');
    }
    return Object.freeze({
      async read(request: AgentEvaluationOwnerAuthorityRequest) {
        const expected = assertReadRequest(request);
        const query = input.ownerStateQueryFor(request);
        if (
          !query ||
          typeof query.list !== 'function' ||
          typeof query.read !== 'function' ||
          typeof query.readArtifact !== 'function'
        ) {
          return fail('query-authority');
        }
        const ownerStateIds = new Set<CanonicalDigest>();
        const sessionIds = new Set<string>();
        const cursors = new Set<CanonicalDigest>();
        const orphans: AgentEvaluationControlledWorkspaceOrphanSession[] = [];
        let cursor: CanonicalDigest | undefined;
        let previousOwnerStateId: CanonicalDigest | undefined;
        let stateCount = 0;
        let pageCount = 0;
        for (;;) {
          pageCount += 1;
          if (pageCount > maximumOwnerStatePages) {
            return fail('owner-state-page-capacity');
          }
          const page = await query.list(binding, {
            limit: ownerStatePageLimit,
            ...(cursor ? { cursor } : {}),
          });
          if (
            page.serviceKind !== binding.serviceKind ||
            page.operation !== binding.operation ||
            page.cursor !== (cursor ?? null) ||
            (page.nextCursor !== null &&
              page.states.length !== ownerStatePageLimit)
          ) {
            return fail('owner-state-page-binding');
          }
          stateCount += page.states.length;
          if (stateCount > PRODUCTION_AGENT_EVALUATION_MAXIMUM_OWNER_STATES) {
            return fail('owner-state-capacity');
          }
          for (const metadata of page.states) {
            if (
              ownerStateIds.has(metadata.ownerStateId) ||
              (previousOwnerStateId !== undefined &&
                compareUnicodeCodePoints(
                  previousOwnerStateId,
                  metadata.ownerStateId
                ) >= 0)
            ) {
              return fail('owner-state-order');
            }
            ownerStateIds.add(metadata.ownerStateId);
            previousOwnerStateId = metadata.ownerStateId;
            if (metadata.snapshotState !== 'active') continue;
            if (
              orphans.length >= PRODUCTION_AGENT_EVALUATION_MAXIMUM_ORPHAN_FACTS
            ) {
              return fail('orphan-capacity');
            }
            const state = await query.read(binding, metadata.ownerStateId);
            if (!metadataMatchesRead(metadata, state)) {
              return fail('owner-state-read-race');
            }
            const orphan = orphanFor(controlledSnapshot(state, expected));
            if (sessionIds.has(orphan.sessionId)) {
              return fail('duplicate-session');
            }
            sessionIds.add(orphan.sessionId);
            orphans.push(orphan);
          }
          if (page.nextCursor === null) break;
          if (
            stateCount === PRODUCTION_AGENT_EVALUATION_MAXIMUM_OWNER_STATES ||
            cursors.has(page.nextCursor)
          ) {
            return fail('owner-state-cursor');
          }
          cursors.add(page.nextCursor);
          cursor = page.nextCursor;
        }
        const result = Object.freeze([...orphans]);
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          result,
          input.forbiddenCanaries
        );
        return result;
      },
    });
  };

export const createEnvironmentProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority =
  (
    input: CreateEnvironmentProductionAgentEvaluationControlledWorkspaceOwnerReadAuthorityInput
  ): ProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority =>
    createProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority({
      forbiddenCanaries: input.forbiddenCanaries,
      ownerStateQueryFor(request) {
        const expected = assertReadRequest(request);
        return createEnvironmentAgentEvaluationOwnerStateQueryClient({
          ...expected,
          forbiddenCanaries: input.forbiddenCanaries,
          ...(input.environment ? { environment: input.environment } : {}),
          ...(input.fetch ? { fetch: input.fetch } : {}),
        });
      },
    });
