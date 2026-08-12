import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import {
  AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  createAgentEvaluationOwnerStateIdentity,
  decodeAgentEvaluationOwnerStatePrior,
  decodeAgentEvaluationOwnerStateTransition,
  digestAgentEvaluationOwnerStateStage,
  type AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
  type AgentEvaluationOwnerStateBundle,
  type AgentEvaluationOwnerStateCASDescriptor,
  type AgentEvaluationOwnerStateIdentityInput,
  type AgentEvaluationOwnerStatePrior,
  type AgentEvaluationOwnerStateSnapshot,
  type AgentEvaluationOwnerStateTransition,
  type AgentEvaluationVerificationEvidenceOwnerStateSnapshot,
} from './ownerState';
import {
  createEnvironmentAgentEvaluationOwnerStateIngressClient,
  type AgentEvaluationOwnerStateIngressClient,
} from './ownerStateIngressClient';
import type { AgentEvaluationProductionWorkspaceVerificationOwnerAuthorityPorts } from './productionOwnerAuthorityComposition';
import {
  createAgentEvaluationOwnerAuthorityDurability,
  type AgentEvaluationControlledWorkspaceOwnerAuthorityPort,
  type AgentEvaluationOwnerAuthorityRequest,
  type AgentEvaluationVerificationEvidenceOwnerAuthorityPort,
} from './productionOwnerAuthoritySidecar';
import type { AgentEvaluationProductionOwnerAuthorityPortFactoryInput } from './productionOwnerAuthoritySidecarEnvironment';

const CONTROLLED_WORKSPACE_AUTHORITY_ID =
  'evaluation.controlled-workspace.owner.v1' as const;
const VERIFICATION_EVIDENCE_AUTHORITY_ID =
  'evaluation.verification-evidence.owner.v1' as const;

export const PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-production-owner-implementation',
    version: 1,
    serviceKind: 'controlled-workspace',
    state: '8790-owner-state-bundle-cas',
    transactionOwner: '@prodivix/workspace',
    reconciliation: 'sealed-transition-no-effect',
  });

export const PRODUCTION_AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-production-owner-implementation',
    version: 1,
    serviceKind: 'verification-evidence',
    state: '8790-owner-state-bundle-cas',
    promotionOwner: '@prodivix/verification',
    secretLifecycle: 'callback-bound-reconstruction',
  });

export type OwnerStateExecutionContext<
  TSnapshot extends AgentEvaluationOwnerStateSnapshot,
> = Readonly<{
  request: AgentEvaluationOwnerAuthorityRequest;
  identity: AgentEvaluationOwnerStateIdentityInput;
  prior: AgentEvaluationOwnerStatePrior;
  ownerStateId: CanonicalDigest;
  nextRevision: number;
  stageDigest: CanonicalDigest;
  ingress: AgentEvaluationOwnerStateIngressClient;
  previousBundle: AgentEvaluationOwnerStateBundle | null;
  previousSnapshot: TSnapshot | null;
}>;

export type ProductionControlledWorkspaceOwnerExecution = Readonly<{
  facts: readonly unknown[];
  snapshot: AgentEvaluationControlledWorkspaceOwnerStateSnapshot;
  casArtifacts?: readonly AgentEvaluationOwnerStateCASDescriptor[];
}>;

export type ProductionVerificationEvidenceOwnerExecution = Readonly<{
  response: unknown;
  publicResult: unknown;
  snapshot: AgentEvaluationVerificationEvidenceOwnerStateSnapshot;
  casArtifacts?: readonly AgentEvaluationOwnerStateCASDescriptor[];
}>;

export type ProductionOwnerResourceRetirement = Readonly<{
  status: 'clean';
  residualResourceIds: readonly [];
  residualCanaryIds: readonly [];
}>;

type ProductionWorkspaceVerificationResourceRetirement = Readonly<{
  status: 'clean';
  residualResourceIds: Readonly<{
    controlledWorkspace: readonly [];
    verificationEvidence: readonly [];
  }>;
  residualCanaryIds: readonly [];
}>;

/**
 * Transport-neutral local Workspace owner. Stateful methods receive only the
 * sealed request plus the scanner-safe prior bundle. Raw initial material may
 * be consumed during load, while later operations must rebuild from snapshot
 * and CAS descriptors in this context.
 */
export interface ProductionControlledWorkspaceOwnerEngine {
  read(
    request: AgentEvaluationOwnerAuthorityRequest
  ): Promise<readonly unknown[]>;
  execute(
    context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>
  ): Promise<ProductionControlledWorkspaceOwnerExecution>;
  executeStateless(
    request: AgentEvaluationOwnerAuthorityRequest
  ): Promise<readonly unknown[]>;
  reconcileStateless(
    request: AgentEvaluationOwnerAuthorityRequest
  ): Promise<Readonly<{ facts: readonly unknown[]; reconciled: boolean }>>;
  close(): Promise<ProductionOwnerResourceRetirement>;
}

/**
 * Transport-neutral Verification owner. Reconciliation receives the durable
 * public result and scanner-safe snapshot; it may reconstruct callback-bound
 * capability/nonce values, and may not repeat the promotion side effect.
 */
export interface ProductionVerificationEvidenceOwnerEngine {
  read(request: AgentEvaluationOwnerAuthorityRequest): Promise<unknown>;
  execute(
    context: OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>
  ): Promise<ProductionVerificationEvidenceOwnerExecution>;
  reconstructResponse(
    input: Readonly<{
      request: AgentEvaluationOwnerAuthorityRequest;
      transition: AgentEvaluationOwnerStateTransition;
      snapshot: AgentEvaluationVerificationEvidenceOwnerStateSnapshot;
    }>
  ): Promise<unknown>;
  close(): Promise<ProductionOwnerResourceRetirement>;
}

export type CreateProductionWorkspaceVerificationOwnerAuthorityPortsInput =
  AgentEvaluationProductionOwnerAuthorityPortFactoryInput &
    Readonly<{
      controlledWorkspace: ProductionControlledWorkspaceOwnerEngine;
      verificationEvidence: ProductionVerificationEvidenceOwnerEngine;
      createIngressClient?: (
        request: AgentEvaluationOwnerAuthorityRequest
      ) => AgentEvaluationOwnerStateIngressClient;
    }>;

const fail = (code: string): never => {
  throw new TypeError(
    `G4_WORKSPACE_VERIFICATION_OWNER_AUTHORITY_INVALID: ${code}`
  );
};

const identityFor = (
  request: AgentEvaluationOwnerAuthorityRequest
): AgentEvaluationOwnerStateIdentityInput => {
  const grantOrAuthorityDigest =
    request.serviceKind === 'controlled-workspace'
      ? request.controlledWorkspaceGrantDigest
      : request.serviceKind === 'verification-evidence'
        ? request.authorityDigest
        : undefined;
  if (
    (request.serviceKind !== 'controlled-workspace' &&
      request.serviceKind !== 'verification-evidence') ||
    !isAgentControlIdentity(request.namespaceId) ||
    !isAgentCanonicalDigest(request.planDigest) ||
    !/^[a-f0-9]{40}$/u.test(request.repositoryCommit) ||
    !isAgentControlIdentity(request.attemptId) ||
    !isAgentCanonicalDigest(request.descriptorDigest) ||
    !Number.isSafeInteger(request.generation) ||
    request.generation! < 1 ||
    !isAgentCanonicalDigest(grantOrAuthorityDigest)
  ) {
    return fail('owner-state-identity');
  }
  return Object.freeze({
    serviceKind: request.serviceKind,
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    attemptId: request.attemptId,
    descriptorDigest: request.descriptorDigest,
    generation: request.generation!,
    grantOrAuthorityDigest,
  });
};

const priorFor = (
  request: AgentEvaluationOwnerAuthorityRequest,
  identity: AgentEvaluationOwnerStateIdentityInput
): AgentEvaluationOwnerStatePrior =>
  decodeAgentEvaluationOwnerStatePrior(
    {
      revision: request.ownerStateRevision,
      bundle: request.ownerStateBundle,
      rootDigest: request.ownerStateRootDigest,
    },
    identity
  );

const stageFor = (
  request: AgentEvaluationOwnerAuthorityRequest,
  identity: AgentEvaluationOwnerStateIdentityInput,
  prior: AgentEvaluationOwnerStatePrior,
  implementationDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentEvaluationOwnerStateStage({
    serviceKind: identity.serviceKind,
    operation: request.operation,
    routeBinding: request.routeBinding,
    requestDigest: request.requestDigest,
    ownerImplementationDigest: implementationDigest,
    ownerStateId: prior.ownerStateId,
    priorOwnerStateRevision: prior.revision,
    priorOwnerStateRootDigest: prior.rootDigest,
  });

const canonicalCAS = (
  prior: AgentEvaluationOwnerStatePrior,
  additions: readonly AgentEvaluationOwnerStateCASDescriptor[] = []
): readonly AgentEvaluationOwnerStateCASDescriptor[] => {
  const byRef = new Map<string, AgentEvaluationOwnerStateCASDescriptor>();
  for (const descriptor of [
    ...(prior.bundle?.casArtifacts ?? []),
    ...additions,
  ]) {
    const existing = byRef.get(descriptor.artifactRef);
    if (existing && existing.descriptorDigest !== descriptor.descriptorDigest) {
      return fail('cas-artifact-ref-drift');
    }
    byRef.set(descriptor.artifactRef, descriptor);
  }
  return Object.freeze(
    [...byRef.values()].sort((left, right) =>
      compareUnicodeCodePoints(left.artifactRef, right.artifactRef)
    )
  );
};

const operationRecordFor = (input: {
  request: AgentEvaluationOwnerAuthorityRequest;
  prior: AgentEvaluationOwnerStatePrior;
  stageDigest: CanonicalDigest;
  publicResult: unknown;
}) => {
  const priorOperations = input.prior.bundle?.recentOperations ?? [];
  const sequence = (priorOperations.at(-1)?.sequence ?? 0) + 1;
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    sequence,
    operation: input.request.operation,
    routeBinding: input.request.routeBinding,
    requestDigest: input.request.requestDigest,
    stageDigest: input.stageDigest,
    responseDigest: digestAgentCanonicalValue(input.publicResult),
  });
  return Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
};

export const createProductionAgentEvaluationOwnerStateBundle = (input: {
  identity: AgentEvaluationOwnerStateIdentityInput;
  prior: AgentEvaluationOwnerStatePrior;
  request: AgentEvaluationOwnerAuthorityRequest;
  stageDigest: CanonicalDigest;
  publicResult: unknown;
  snapshot: AgentEvaluationOwnerStateSnapshot;
  casArtifacts?: readonly AgentEvaluationOwnerStateCASDescriptor[];
}): AgentEvaluationOwnerStateBundle => {
  const revision = input.prior.revision + 1;
  if (
    input.snapshot.revision !== revision ||
    input.snapshot.snapshotDigest !==
      digestAgentCanonicalValue(
        Object.fromEntries(
          Object.entries(input.snapshot).filter(
            ([key]) => key !== 'snapshotDigest'
          )
        )
      )
  ) {
    return fail('snapshot-revision-or-digest');
  }
  const casArtifacts = canonicalCAS(input.prior, input.casArtifacts);
  const operation = operationRecordFor(input);
  const recentOperations = Object.freeze(
    [...(input.prior.bundle?.recentOperations ?? []), operation].slice(-4)
  );
  const bundle = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: input.identity.serviceKind,
    namespaceId: input.identity.namespaceId,
    planDigest: input.identity.planDigest,
    repositoryCommit: input.identity.repositoryCommit,
    ownerStateId: input.prior.ownerStateId,
    revision,
    previousOwnerStateRootDigest: input.prior.rootDigest,
    snapshotKind: input.identity.serviceKind,
    snapshot: input.snapshot,
    snapshotDigest: input.snapshot.snapshotDigest,
    casArtifacts,
    casArtifactSetDigest: digestAgentCanonicalValue(casArtifacts),
    recentOperations,
    recentOperationSetDigest: digestAgentCanonicalValue(recentOperations),
  });
  return bundle as AgentEvaluationOwnerStateBundle;
};

const transitionFromReconcileRequest = (
  request: AgentEvaluationOwnerAuthorityRequest,
  implementationDigest: CanonicalDigest
): AgentEvaluationOwnerStateTransition => {
  const identity = identityFor(request);
  if (
    request.sealedOwnerOperation === undefined ||
    request.ownerStateBundle === undefined ||
    request.ownerStateBundle === null ||
    !Number.isSafeInteger(request.ownerStateRevision) ||
    request.ownerStateRevision! < 1 ||
    !isAgentCanonicalDigest(request.ownerStateRootDigest)
  ) {
    return fail('reconcile-sealed-state');
  }
  const sealed = request.sealedOwnerOperation;
  return decodeAgentEvaluationOwnerStateTransition(
    Object.freeze({ ...sealed, ownerStateBundle: request.ownerStateBundle }),
    {
      ...identity,
      operation: request.operation,
      routeBinding: request.routeBinding,
      requestDigest: request.requestDigest,
      ownerImplementationDigest: implementationDigest,
      priorOwnerStateRevision: sealed.priorOwnerStateRevision,
      priorOwnerStateRootDigest: sealed.priorOwnerStateRootDigest,
    }
  );
};

const defaultIngressFactory = (
  input: AgentEvaluationProductionOwnerAuthorityPortFactoryInput,
  request: AgentEvaluationOwnerAuthorityRequest
): AgentEvaluationOwnerStateIngressClient => {
  if (!isAgentCanonicalDigest(request.planDigest)) {
    return fail('ingress-plan-digest');
  }
  return createEnvironmentAgentEvaluationOwnerStateIngressClient({
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    forbiddenCanaries: input.forbiddenCanaries,
    environment: input.environment,
  });
};

const statefulExecutionContext = <
  TSnapshot extends AgentEvaluationOwnerStateSnapshot,
>(
  request: AgentEvaluationOwnerAuthorityRequest,
  implementationDigest: CanonicalDigest,
  ingress: AgentEvaluationOwnerStateIngressClient
): OwnerStateExecutionContext<TSnapshot> => {
  const identity = identityFor(request);
  const prior = priorFor(request, identity);
  const stageDigest = stageFor(request, identity, prior, implementationDigest);
  if (request.stageDigest !== stageDigest) return fail('execute-stage-digest');
  return Object.freeze({
    request,
    identity,
    prior,
    ownerStateId: createAgentEvaluationOwnerStateIdentity(identity),
    nextRevision: prior.revision + 1,
    stageDigest,
    ingress,
    previousBundle: prior.bundle,
    previousSnapshot: (prior.bundle?.snapshot ?? null) as TSnapshot | null,
  });
};

const exactCleanRetirement = (value: ProductionOwnerResourceRetirement) => {
  if (
    value.status !== 'clean' ||
    value.residualResourceIds.length !== 0 ||
    value.residualCanaryIds.length !== 0
  ) {
    return fail('resource-retirement-residual');
  }
};

export const createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPorts =
  (
    input: CreateProductionWorkspaceVerificationOwnerAuthorityPortsInput
  ): AgentEvaluationProductionWorkspaceVerificationOwnerAuthorityPorts => {
    const durability = createAgentEvaluationOwnerAuthorityDurability();
    const ingressFor =
      input.createIngressClient ??
      ((request: AgentEvaluationOwnerAuthorityRequest) =>
        defaultIngressFactory(input, request));

    const controlledWorkspace = Object.freeze({
      authorityId: CONTROLLED_WORKSPACE_AUTHORITY_ID,
      implementationDigest:
        PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST,
      durability,
      async stage(request) {
        const identity = identityFor(request);
        const prior = priorFor(request, identity);
        return stageFor(
          request,
          identity,
          prior,
          PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST
        );
      },
      async read(request) {
        const facts = await input.controlledWorkspace.read(request);
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          facts,
          input.forbiddenCanaries
        );
        return Object.freeze([...facts]);
      },
      async execute(request) {
        if (request.ownerStateRevision === undefined) {
          const facts =
            await input.controlledWorkspace.executeStateless(request);
          assertProductionAgentEvaluationG3SandboxCanaryClean(
            facts,
            input.forbiddenCanaries
          );
          return Object.freeze([...facts]);
        }
        const context =
          statefulExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>(
            request,
            PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST,
            ingressFor(request)
          );
        const result = await input.controlledWorkspace.execute(context);
        const facts = Object.freeze([...result.facts]);
        const publicResult = Object.freeze({ facts });
        const ownerStateBundle =
          createProductionAgentEvaluationOwnerStateBundle({
            ...context,
            publicResult,
            snapshot: result.snapshot,
            casArtifacts: result.casArtifacts,
          });
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          ownerStateBundle,
          input.forbiddenCanaries
        );
        return context.ingress.commitTransition({
          identity: context.identity,
          operation: request.operation,
          routeBinding: request.routeBinding,
          requestDigest: request.requestDigest,
          ownerImplementationDigest:
            PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST,
          priorOwnerStateRevision: context.prior.revision,
          priorOwnerStateRootDigest: context.prior.rootDigest,
          stageDigest: context.stageDigest,
          publicResult,
          ownerStateBundle,
        });
      },
      async reconcile(request) {
        if (request.ownerStateRevision !== undefined) {
          return fail('controlled-stateful-reconcile-must-use-sealed-state');
        }
        return input.controlledWorkspace.reconcileStateless(request);
      },
    }) satisfies AgentEvaluationControlledWorkspaceOwnerAuthorityPort;

    const verificationEvidence = Object.freeze({
      authorityId: VERIFICATION_EVIDENCE_AUTHORITY_ID,
      implementationDigest:
        PRODUCTION_AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_IMPLEMENTATION_DIGEST,
      durability,
      async stage(request) {
        const identity = identityFor(request);
        const prior = priorFor(request, identity);
        return stageFor(
          request,
          identity,
          prior,
          PRODUCTION_AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_IMPLEMENTATION_DIGEST
        );
      },
      async read(request) {
        const response = await input.verificationEvidence.read(request);
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          response,
          input.forbiddenCanaries
        );
        return response;
      },
      async execute(request) {
        const context =
          statefulExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>(
            request,
            PRODUCTION_AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_IMPLEMENTATION_DIGEST,
            ingressFor(request)
          );
        const result = await input.verificationEvidence.execute(context);
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          result.publicResult,
          input.forbiddenCanaries
        );
        const ownerStateBundle =
          createProductionAgentEvaluationOwnerStateBundle({
            ...context,
            publicResult: result.publicResult,
            snapshot: result.snapshot,
            casArtifacts: result.casArtifacts,
          });
        const transition = await context.ingress.commitTransition({
          identity: context.identity,
          operation: request.operation,
          routeBinding: request.routeBinding,
          requestDigest: request.requestDigest,
          ownerImplementationDigest:
            PRODUCTION_AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_IMPLEMENTATION_DIGEST,
          priorOwnerStateRevision: context.prior.revision,
          priorOwnerStateRootDigest: context.prior.rootDigest,
          stageDigest: context.stageDigest,
          publicResult: result.publicResult,
          ownerStateBundle,
        });
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          { transition, response: result.response },
          input.forbiddenCanaries
        );
        return Object.freeze({ transition, response: result.response });
      },
      async reconcile(request) {
        const transition = transitionFromReconcileRequest(
          request,
          PRODUCTION_AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_IMPLEMENTATION_DIGEST
        );
        const snapshot = transition.ownerStateBundle.snapshot;
        if (
          snapshot.format !==
          'prodivix.agent-evaluation-verification-evidence-owner-state-snapshot'
        ) {
          return fail('verification-reconcile-snapshot-kind');
        }
        const response = await input.verificationEvidence.reconstructResponse({
          request,
          transition,
          snapshot,
        });
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          response,
          input.forbiddenCanaries
        );
        return Object.freeze({ response, reconciled: true });
      },
    }) satisfies AgentEvaluationVerificationEvidenceOwnerAuthorityPort;

    let closePromise:
      Promise<ProductionWorkspaceVerificationResourceRetirement> | undefined;
    return Object.freeze({
      controlledWorkspace,
      verificationEvidence,
      close() {
        closePromise ??= (async () => {
          const [controlled, verification] = await Promise.all([
            input.controlledWorkspace.close(),
            input.verificationEvidence.close(),
          ]);
          exactCleanRetirement(controlled);
          exactCleanRetirement(verification);
          return Object.freeze({
            status: 'clean' as const,
            residualResourceIds: Object.freeze({
              controlledWorkspace: Object.freeze([]) as readonly [],
              verificationEvidence: Object.freeze([]) as readonly [],
            }),
            residualCanaryIds: Object.freeze([]) as readonly [],
          });
        })();
        return closePromise;
      },
    });
  };
