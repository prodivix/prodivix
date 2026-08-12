import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  assertProductionAgentEvaluationG3SandboxCanaryClean,
  type AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource,
} from './controlledWorkspaceG3CellAdapter';
import type {
  AgentEvaluationControlledWorkspaceCleanupReceipt,
  AgentEvaluationControlledWorkspaceOrphanSession,
} from './controlledWorkspaceRuntime';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
  digestAgentEvaluationControlledWorkspaceServiceRequest,
} from './controlledWorkspaceRuntimeService';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
  createAgentEvaluationOwnerStateIdentity,
  digestAgentEvaluationOwnerStateStage,
  type AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
  type AgentEvaluationOwnerStateIdentityInput,
  type AgentEvaluationOwnerStatePrior,
} from './ownerState';
import type { AgentEvaluationOwnerStateIngressClient } from './ownerStateIngressClient';
import type { AgentEvaluationOwnerStateQueryClient } from './ownerStateQueryClient';
import {
  executeProductionControlledWorkspaceStatefulSession,
  type ProductionControlledWorkspaceTransactionSessionAuthority,
} from './productionControlledWorkspaceSessionEngine';
import type { ProductionControlledWorkspaceOrphanRetirementAuthority } from './productionControlledWorkspaceDirectAuthority';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import {
  PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST,
  createProductionAgentEvaluationOwnerStateBundle,
  type OwnerStateExecutionContext,
  type ProductionOwnerResourceRetirement,
} from './productionWorkspaceVerificationOwnerAuthorityPorts';

const binding = Object.freeze({
  serviceKind: 'controlled-workspace' as const,
  operation: 'session.orphans.list' as const,
});
const destroyOperation = 'session.destroy' as const;
const destroyRouteBinding = 'sessions/{sessionId}/destroy' as const;
const repositoryCommitPattern = /^[a-f0-9]{40}$/u;

export type CreateProductionControlledWorkspaceOrphanRetirementAuthorityInput =
  Readonly<{
    sessions: ProductionControlledWorkspaceTransactionSessionAuthority;
    ownerStateQueryFor(
      request: AgentEvaluationOwnerAuthorityRequest
    ): AgentEvaluationOwnerStateQueryClient;
    createIngressClient(
      request: AgentEvaluationOwnerAuthorityRequest
    ): AgentEvaluationOwnerStateIngressClient;
    forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
  }>;

type DestroyPayload = Readonly<{
  orphan: AgentEvaluationControlledWorkspaceOrphanSession;
  cleanupIntentDigest: CanonicalDigest;
  cleanupDispatchReceiptDigest: CanonicalDigest;
  idempotencyKey: string;
}>;

const fail = (code: string): never => {
  throw new TypeError(
    `G4_CONTROLLED_WORKSPACE_ORPHAN_RETIREMENT_INVALID: ${code}`
  );
};

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  keys.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && keys.includes(key)
  );

const checkpointValid = (
  value: AgentEvaluationControlledWorkspaceOrphanSession['currentCheckpoint'],
  orphan: Pick<
    AgentEvaluationControlledWorkspaceOrphanSession,
    'attemptId' | 'grantDigest' | 'generation'
  >
): boolean => {
  if (!isPlainObject(value)) return false;
  const { checkpointDigest, ...base } = value;
  return (
    isAgentControlIdentity(value.checkpointRef) &&
    value.attemptId === orphan.attemptId &&
    value.grantDigest === orphan.grantDigest &&
    value.generation === orphan.generation &&
    isAgentCanonicalDigest(value.snapshotDigest) &&
    isAgentCanonicalDigest(value.securePersistenceReceiptDigest) &&
    isAgentCanonicalDigest(checkpointDigest) &&
    checkpointDigest === digestAgentCanonicalValue(base)
  );
};

const decodePayload = (
  request: AgentEvaluationOwnerAuthorityRequest,
  mode: 'execute' | 'reconcile'
): DestroyPayload => {
  if (
    request.serviceKind !== 'controlled-workspace' ||
    request.mode !== mode ||
    request.operation !== 'session.orphan.destroy' ||
    request.routeBinding !== 'sessions/orphans/destroy' ||
    !isAgentControlIdentity(request.namespaceId) ||
    !isAgentCanonicalDigest(request.planDigest) ||
    !repositoryCommitPattern.test(request.repositoryCommit) ||
    !exactRecord(request.payload, [
      'orphan',
      'cleanupIntentDigest',
      'cleanupDispatchReceiptDigest',
      'idempotencyKey',
    ]) ||
    !isPlainObject(request.payload.orphan) ||
    !isAgentCanonicalDigest(request.payload.cleanupIntentDigest) ||
    !isAgentCanonicalDigest(request.payload.cleanupDispatchReceiptDigest) ||
    !isAgentControlIdentity(request.payload.idempotencyKey)
  ) {
    return fail('request');
  }
  const orphan = request.payload
    .orphan as unknown as AgentEvaluationControlledWorkspaceOrphanSession;
  const { orphanReceiptDigest, ...orphanBase } = orphan;
  if (
    !exactRecord(orphan, [
      'planDigest',
      'attemptId',
      'modelDescriptorDigest',
      'caseId',
      'materialDigest',
      'grantDigest',
      'generation',
      'sessionId',
      'currentCheckpoint',
      'orphanReceiptDigest',
    ]) ||
    orphan.planDigest !== request.planDigest ||
    !isAgentControlIdentity(orphan.attemptId) ||
    !isAgentCanonicalDigest(orphan.modelDescriptorDigest) ||
    !isAgentControlIdentity(orphan.caseId) ||
    !isAgentCanonicalDigest(orphan.materialDigest) ||
    !isAgentCanonicalDigest(orphan.grantDigest) ||
    !Number.isSafeInteger(orphan.generation) ||
    orphan.generation < 1 ||
    !isAgentControlIdentity(orphan.sessionId) ||
    !checkpointValid(orphan.currentCheckpoint, orphan) ||
    !isAgentCanonicalDigest(orphanReceiptDigest) ||
    orphanReceiptDigest !== digestAgentCanonicalValue(orphanBase)
  ) {
    return fail('orphan');
  }
  return Object.freeze({
    orphan,
    cleanupIntentDigest: request.payload.cleanupIntentDigest,
    cleanupDispatchReceiptDigest: request.payload.cleanupDispatchReceiptDigest,
    idempotencyKey: request.payload.idempotencyKey,
  });
};

const identityFor = (
  request: AgentEvaluationOwnerAuthorityRequest,
  orphan: AgentEvaluationControlledWorkspaceOrphanSession
): AgentEvaluationOwnerStateIdentityInput =>
  Object.freeze({
    serviceKind: 'controlled-workspace',
    namespaceId: request.namespaceId,
    planDigest: orphan.planDigest,
    repositoryCommit: request.repositoryCommit,
    attemptId: orphan.attemptId,
    descriptorDigest: orphan.modelDescriptorDigest,
    generation: orphan.generation,
    grantOrAuthorityDigest: orphan.grantDigest,
  });

const cleanupReceipt = (
  payload: DestroyPayload
): AgentEvaluationControlledWorkspaceCleanupReceipt => {
  const base = Object.freeze({
    attemptId: payload.orphan.attemptId,
    grantDigest: payload.orphan.grantDigest,
    generation: payload.orphan.generation,
    sessionId: payload.orphan.sessionId,
    reason: 'orphaned' as const,
    cleanupIntentDigest: payload.cleanupIntentDigest,
    cleanupDispatchReceiptDigest: payload.cleanupDispatchReceiptDigest,
    sourceReferencesRevoked: true as const,
    sandboxDestroyed: true as const,
    residualReferenceCount: 0 as const,
  });
  return Object.freeze({
    ...base,
    cleanupReceiptDigest: digestAgentCanonicalValue(base),
  });
};

const assertPriorBinding = (
  request: AgentEvaluationOwnerAuthorityRequest,
  payload: DestroyPayload,
  ownerStateId: CanonicalDigest,
  snapshot: AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
  stateOwnerId: CanonicalDigest
): void => {
  const orphan = payload.orphan;
  if (
    stateOwnerId !== ownerStateId ||
    snapshot.format !==
      AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT ||
    snapshot.namespaceId !== request.namespaceId ||
    snapshot.planDigest !== orphan.planDigest ||
    snapshot.repositoryCommit !== request.repositoryCommit ||
    snapshot.attemptId !== orphan.attemptId ||
    snapshot.descriptorDigest !== orphan.modelDescriptorDigest ||
    snapshot.caseId !== orphan.caseId ||
    snapshot.materialDigest !== orphan.materialDigest ||
    snapshot.grantDigest !== orphan.grantDigest ||
    snapshot.generation !== orphan.generation ||
    snapshot.sessionId !== orphan.sessionId ||
    !sameCanonicalJson(snapshot.currentCheckpoint, orphan.currentCheckpoint)
  ) {
    return fail('prior-binding');
  }
};

const syntheticDestroyRequest = (
  outer: AgentEvaluationOwnerAuthorityRequest,
  payload: DestroyPayload,
  state: Readonly<{
    ownerStateRevision: number;
    ownerStateRootDigest: CanonicalDigest;
    ownerStateBundle: import('./ownerState').AgentEvaluationOwnerStateBundle;
  }>,
  ownerStateId: CanonicalDigest
): Readonly<{
  request: AgentEvaluationOwnerAuthorityRequest;
  context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>;
}> => {
  const value = Object.freeze({
    reason: 'orphaned' as const,
    cleanupIntentDigest: payload.cleanupIntentDigest,
    cleanupDispatchReceiptDigest: payload.cleanupDispatchReceiptDigest,
    idempotencyKey: payload.idempotencyKey,
  });
  const servicePayload = Object.freeze({
    sessionId: payload.orphan.sessionId,
    attemptId: payload.orphan.attemptId,
    grantDigest: payload.orphan.grantDigest,
    generation: payload.orphan.generation,
    value,
  });
  const inner = Object.freeze({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
    version: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
    operation: destroyOperation,
    namespaceId: outer.namespaceId,
    planDigest: payload.orphan.planDigest,
    repositoryCommit: outer.repositoryCommit,
    payload: servicePayload,
  });
  const requestDigest =
    digestAgentEvaluationControlledWorkspaceServiceRequest(inner);
  const identity = identityFor(outer, payload.orphan);
  const prior: AgentEvaluationOwnerStatePrior = Object.freeze({
    ownerStateId,
    revision: state.ownerStateRevision,
    bundle: state.ownerStateBundle,
    rootDigest: state.ownerStateRootDigest,
  });
  const stageDigest = digestAgentEvaluationOwnerStateStage({
    serviceKind: 'controlled-workspace',
    operation: destroyOperation,
    routeBinding: destroyRouteBinding,
    requestDigest,
    ownerImplementationDigest:
      PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST,
    ownerStateId,
    priorOwnerStateRevision: prior.revision,
    priorOwnerStateRootDigest: prior.rootDigest,
  });
  const request: AgentEvaluationOwnerAuthorityRequest = Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: 'controlled-workspace',
    mode: 'execute',
    namespaceId: outer.namespaceId,
    planDigest: payload.orphan.planDigest,
    repositoryCommit: outer.repositoryCommit,
    operation: destroyOperation,
    routeBinding: destroyRouteBinding,
    sessionId: payload.orphan.sessionId,
    requestDigest,
    attemptId: payload.orphan.attemptId,
    descriptorDigest: payload.orphan.modelDescriptorDigest,
    generation: payload.orphan.generation,
    controlledWorkspaceGrantDigest: payload.orphan.grantDigest,
    ownerImplementationDigest:
      PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST,
    stageDigest,
    ownerStateRevision: prior.revision,
    ownerStateBundle: state.ownerStateBundle,
    ownerStateRootDigest: prior.rootDigest,
    claimGeneration: 1,
    payload: servicePayload,
  });
  return Object.freeze({
    request,
    context: Object.freeze({
      request,
      identity,
      prior,
      ownerStateId,
      nextRevision: prior.revision + 1,
      stageDigest,
      ingress: undefined as never,
      previousBundle: state.ownerStateBundle,
      previousSnapshot: state.ownerStateBundle
        .snapshot as AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
    }),
  });
};

const exactClean = (value: ProductionOwnerResourceRetirement): void => {
  if (
    value.status !== 'clean' ||
    value.residualResourceIds.length !== 0 ||
    value.residualCanaryIds.length !== 0
  ) {
    return fail('resource-retirement');
  }
};

/**
 * Retires an orphan by restoring its exact durable owner-state/CAS session,
 * sealing a `session.destroy` owner-state transition, and only then returning
 * the cleanup fact to the independent stateless ledger. Reconciliation reads
 * the destroyed snapshot and performs zero session effects.
 */
export const createProductionControlledWorkspaceOrphanRetirementAuthority = (
  input: CreateProductionControlledWorkspaceOrphanRetirementAuthorityInput
): ProductionControlledWorkspaceOrphanRetirementAuthority => {
  if (
    typeof input.sessions?.restore !== 'function' ||
    typeof input.ownerStateQueryFor !== 'function' ||
    typeof input.createIngressClient !== 'function' ||
    typeof input.forbiddenCanaries !== 'function'
  ) {
    return fail('factory');
  }
  let closed = false;
  const readState = async (
    request: AgentEvaluationOwnerAuthorityRequest,
    payload: DestroyPayload
  ) => {
    const identity = identityFor(request, payload.orphan);
    const ownerStateId = createAgentEvaluationOwnerStateIdentity(identity);
    const query = input.ownerStateQueryFor(request);
    const state = await query.read(binding, ownerStateId);
    const snapshot = state.ownerStateBundle
      .snapshot as AgentEvaluationControlledWorkspaceOwnerStateSnapshot;
    assertPriorBinding(
      request,
      payload,
      ownerStateId,
      snapshot,
      state.ownerStateId
    );
    return Object.freeze({ identity, ownerStateId, query, state, snapshot });
  };
  const reconstruct = async (
    request: AgentEvaluationOwnerAuthorityRequest,
    mode: 'execute' | 'reconcile'
  ): Promise<readonly unknown[]> => {
    if (closed) return fail('closed');
    const payload = decodePayload(request, mode);
    const prior = await readState(request, payload);
    if (prior.snapshot.state === 'destroyed') {
      const receipt = cleanupReceipt(payload);
      if (
        receipt.cleanupReceiptDigest !== prior.snapshot.cleanupReceiptDigest
      ) {
        return fail('destroyed-receipt-binding');
      }
      return Object.freeze([receipt]);
    }
    if (prior.snapshot.state !== 'active' || mode === 'reconcile') {
      return fail('unsealed-retirement');
    }
    const synthetic = syntheticDestroyRequest(
      request,
      payload,
      prior.state,
      prior.ownerStateId
    );
    const ingress = input.createIngressClient(request);
    const context = Object.freeze({ ...synthetic.context, ingress });
    const result = await executeProductionControlledWorkspaceStatefulSession(
      {
        sessions: input.sessions,
        ownerStateQueryFor: () => prior.query,
        forbiddenCanaries: input.forbiddenCanaries,
      },
      context
    );
    const facts = Object.freeze([...result.facts]);
    const receipt = cleanupReceipt(payload);
    if (
      facts.length !== 1 ||
      !sameCanonicalJson(facts[0], receipt) ||
      result.snapshot.state !== 'destroyed' ||
      result.snapshot.cleanupReceiptDigest !== receipt.cleanupReceiptDigest
    ) {
      return fail('destroy-result');
    }
    const publicResult = Object.freeze({ facts });
    const ownerStateBundle = createProductionAgentEvaluationOwnerStateBundle({
      ...context,
      publicResult,
      snapshot: result.snapshot,
      casArtifacts: result.casArtifacts,
    });
    assertProductionAgentEvaluationG3SandboxCanaryClean(
      ownerStateBundle,
      input.forbiddenCanaries
    );
    const transition = await ingress.commitTransition({
      identity: context.identity,
      operation: synthetic.request.operation,
      routeBinding: synthetic.request.routeBinding,
      requestDigest: synthetic.request.requestDigest,
      ownerImplementationDigest:
        PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST,
      priorOwnerStateRevision: context.prior.revision,
      priorOwnerStateRootDigest: context.prior.rootDigest,
      stageDigest: context.stageDigest,
      publicResult,
      ownerStateBundle,
    });
    if (
      !sameCanonicalJson(transition.publicResult, publicResult) ||
      !sameCanonicalJson(transition.ownerStateBundle, ownerStateBundle)
    ) {
      return fail('transition-binding');
    }
    return facts;
  };
  return Object.freeze({
    execute: (request) => reconstruct(request, 'execute'),
    reconstruct: (request) => reconstruct(request, 'reconcile'),
    async close() {
      closed = true;
      const result = Object.freeze({
        status: 'clean' as const,
        residualResourceIds: Object.freeze([]) as readonly [],
        residualCanaryIds: Object.freeze([]) as readonly [],
      });
      exactClean(result);
      return result;
    },
  });
};
