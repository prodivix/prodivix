import { createHash } from 'node:crypto';

import {
  digestAgentCanonicalValue,
  isAgentActionRegistrySnapshot,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationWorkspaceFixtureMaterial,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  validateWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  assertProductionAgentEvaluationG3SandboxCanaryClean,
  type AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource,
} from './controlledWorkspaceG3CellAdapter';
import {
  createAgentEvaluationControlledWorkspaceGrant,
  validateAgentEvaluationControlledWorkspaceMaterial,
  type AgentEvaluationControlledWorkspaceGrant,
  type AgentEvaluationControlledWorkspaceSession,
} from './controlledWorkspaceRuntime';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACT_BYTES,
  AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACTS,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  type AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
  type AgentEvaluationOwnerStateBundle,
  type AgentEvaluationOwnerStateCASDescriptor,
} from './ownerState';
import type { AgentEvaluationOwnerStateQueryClient } from './ownerStateQueryClient';
import type { ProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority } from './productionControlledWorkspaceOwnerRead';
import type { AgentEvaluationOwnerAuthorityRequest } from './productionOwnerAuthoritySidecar';
import {
  PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST,
  type OwnerStateExecutionContext,
  type ProductionControlledWorkspaceOwnerEngine,
  type ProductionOwnerResourceRetirement,
} from './productionWorkspaceVerificationOwnerAuthorityPorts';

const binding = Object.freeze({
  serviceKind: 'controlled-workspace' as const,
  operation: 'session.orphans.list' as const,
});
const maximumProjectionEntries = 128;
const exactMediaTypePattern =
  /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+(?:;[\x20-\x7e]+)?$/u;
export const PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_FORMAT =
  'prodivix.agent-evaluation-controlled-workspace-checkpoint-artifact' as const;
export const PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_VERSION =
  1 as const;

export type ProductionControlledWorkspaceSessionCASArtifact = Readonly<{
  artifactRef: string;
  artifactKind: string;
  mediaType: string;
  semanticSnapshotDigest: CanonicalDigest | null;
  content: Uint8Array;
}>;

export type ProductionControlledWorkspaceSessionProjection = Readonly<{
  workspaceSnapshot: WorkspaceSnapshot;
  toolDefinitions: readonly unknown[];
  actionRegistry: unknown;
  g3VerificationPlan: unknown;
  adapterRegistry: unknown;
  finalWorkspaceSnapshotDigest: CanonicalDigest | null;
  artifactDescriptors: readonly unknown[];
  finalAuthorityReceiptDigest: CanonicalDigest | null;
  cleanupReceiptDigest: CanonicalDigest | null;
  casArtifacts: readonly ProductionControlledWorkspaceSessionCASArtifact[];
}>;

export type ProductionControlledWorkspaceOwnerStateCASReader = Readonly<{
  use<T>(
    descriptor: AgentEvaluationOwnerStateCASDescriptor,
    callback: (content: Uint8Array) => Promise<T>
  ): Promise<T>;
}>;

export type ProductionControlledWorkspaceSessionHandle = Readonly<{
  session: AgentEvaluationControlledWorkspaceSession;
  capture(): Promise<ProductionControlledWorkspaceSessionProjection>;
}>;

/**
 * Canonical transaction/session owner seam. Implementations must apply only
 * @prodivix/workspace Command/Transaction operations, durably key effects by
 * request/stage/dispatch identity, and reconstruct from the supplied bundle
 * plus callback-bound CAS bytes on every host.
 */
export interface ProductionControlledWorkspaceTransactionSessionAuthority {
  loadOrReattach(input: {
    context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>;
    material: AgentEvaluationCaseMaterial;
    fixture: AgentEvaluationWorkspaceFixtureMaterial;
    grant: AgentEvaluationControlledWorkspaceGrant;
    isolationPolicyDigest: CanonicalDigest;
    previousSnapshot: AgentEvaluationControlledWorkspaceOwnerStateSnapshot | null;
    previousBundle: AgentEvaluationOwnerStateBundle | null;
    cas: ProductionControlledWorkspaceOwnerStateCASReader;
  }): Promise<
    Readonly<{
      status: 'loaded' | 'reattached';
      handle: ProductionControlledWorkspaceSessionHandle;
    }>
  >;
  restore(input: {
    context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>;
    snapshot: AgentEvaluationControlledWorkspaceOwnerStateSnapshot;
    bundle: AgentEvaluationOwnerStateBundle;
    cas: ProductionControlledWorkspaceOwnerStateCASReader;
  }): Promise<ProductionControlledWorkspaceSessionHandle>;
  close(): Promise<ProductionOwnerResourceRetirement>;
}

export interface ProductionControlledWorkspaceStatelessOwnerAuthority {
  read(
    request: AgentEvaluationOwnerAuthorityRequest
  ): Promise<readonly unknown[]>;
  execute(
    request: AgentEvaluationOwnerAuthorityRequest
  ): Promise<readonly unknown[]>;
  reconcile(
    request: AgentEvaluationOwnerAuthorityRequest
  ): Promise<Readonly<{ facts: readonly unknown[]; reconciled: boolean }>>;
  close(): Promise<ProductionOwnerResourceRetirement>;
}

export type CreateProductionControlledWorkspaceSessionEngineInput = Readonly<{
  orphanRead: ProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority;
  ownerStateQueryFor(
    request: AgentEvaluationOwnerAuthorityRequest
  ): AgentEvaluationOwnerStateQueryClient;
  sessions: ProductionControlledWorkspaceTransactionSessionAuthority;
  stateless: ProductionControlledWorkspaceStatelessOwnerAuthority;
  forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
}>;

const fail = (code: string): never => {
  throw new TypeError(
    `G4_CONTROLLED_WORKSPACE_SESSION_ENGINE_INVALID: ${code}`
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

const nullableDigest = (value: unknown): value is CanonicalDigest | null =>
  value === null || isAgentCanonicalDigest(value);

const digestBytes = (value: Uint8Array): CanonicalDigest =>
  `sha256-${createHash('sha256').update(value).digest('hex')}` as CanonicalDigest;

const exactClean = (value: ProductionOwnerResourceRetirement): void => {
  if (
    value.status !== 'clean' ||
    value.residualResourceIds.length !== 0 ||
    value.residualCanaryIds.length !== 0
  ) {
    return fail('resource-retirement');
  }
};

const decodeGrant = (
  value: unknown
): AgentEvaluationControlledWorkspaceGrant => {
  if (!isPlainObject(value)) return fail('grant');
  try {
    const grant = value as AgentEvaluationControlledWorkspaceGrant;
    const recreated = createAgentEvaluationControlledWorkspaceGrant({
      grantId: grant.grantId,
      authorityId: grant.authorityId,
      planDigest: grant.planDigest,
      attemptId: grant.attemptId,
      descriptorDigest: grant.descriptorDigest,
      caseId: grant.caseId,
      materialDigest: grant.materialDigest,
      fixtureDigest: grant.fixtureDigest,
      baseSnapshotDigest: grant.baseSnapshotDigest,
      toolRegistryDigest: grant.toolRegistryDigest,
      actionRegistryDigest: grant.actionRegistryDigest,
      allowedToolIds: grant.allowedToolIds,
      allowedActionIds: grant.allowedActionIds,
      allowedTargetRefs: grant.allowedTargetRefs,
      generation: grant.generation,
      maximumUses: grant.maximumUses,
      issuedAt: grant.issuedAt,
      expiresAt: grant.expiresAt,
    });
    if (!sameCanonicalJson(value, recreated)) return fail('grant');
    return recreated;
  } catch {
    return fail('grant');
  }
};

const loadPayload = (
  context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>
): Readonly<{
  material: AgentEvaluationCaseMaterial;
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
  grant: AgentEvaluationControlledWorkspaceGrant;
  isolationPolicyDigest: CanonicalDigest;
}> => {
  const value = context.request.payload;
  if (
    !exactRecord(value, [
      'material',
      'fixture',
      'grant',
      'isolationPolicyDigest',
    ]) ||
    !isAgentCanonicalDigest(value.isolationPolicyDigest)
  ) {
    return fail('load-payload');
  }
  const grant = decodeGrant(value.grant);
  const material = value.material as AgentEvaluationCaseMaterial;
  let materialValidation: ReturnType<
    typeof validateAgentEvaluationControlledWorkspaceMaterial
  >;
  try {
    materialValidation = validateAgentEvaluationControlledWorkspaceMaterial(
      material,
      {
        caseId: grant.caseId,
        materialDigest: grant.materialDigest,
      }
    );
  } catch {
    return fail('load-material');
  }
  if (
    !sameCanonicalJson(value.fixture, materialValidation.fixture) ||
    grant.planDigest !== context.identity.planDigest ||
    grant.attemptId !== context.identity.attemptId ||
    grant.descriptorDigest !== context.identity.descriptorDigest ||
    grant.grantDigest !== context.identity.grantOrAuthorityDigest ||
    grant.generation !== context.identity.generation ||
    grant.materialDigest !== material.materialDigest ||
    grant.fixtureDigest !== materialValidation.fixture.fixtureDigest ||
    grant.baseSnapshotDigest !==
      materialValidation.fixture.workspaceSnapshotDigest ||
    grant.toolRegistryDigest !== materialValidation.toolRegistryDigest ||
    grant.actionRegistryDigest !== materialValidation.actionRegistryDigest ||
    grant.allowedToolIds.some(
      (toolId) =>
        !material.invocation.tools.some(
          (candidate) => candidate.toolId === toolId
        )
    ) ||
    grant.allowedActionIds.some(
      (actionId) =>
        !materialValidation.fixture.actionRegistry.some(
          (candidate) => candidate.actionId === actionId
        )
    ) ||
    grant.allowedTargetRefs.some(
      (targetRef) => !materialValidation.fixture.targetRefs.includes(targetRef)
    )
  ) {
    return fail('load-binding');
  }
  return Object.freeze({
    material,
    fixture: materialValidation.fixture,
    grant,
    isolationPolicyDigest: value.isolationPolicyDigest,
  });
};

const sessionPayload = (
  context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>,
  snapshot: AgentEvaluationControlledWorkspaceOwnerStateSnapshot
): unknown => {
  const payload = context.request.payload;
  if (
    !exactRecord(payload, [
      'sessionId',
      'attemptId',
      'grantDigest',
      'generation',
      'value',
    ]) ||
    payload.sessionId !== snapshot.sessionId ||
    payload.attemptId !== snapshot.attemptId ||
    payload.grantDigest !== snapshot.grantDigest ||
    payload.generation !== snapshot.generation ||
    context.request.sessionId !== snapshot.sessionId
  ) {
    return fail('session-payload');
  }
  return payload.value;
};

const assertSession = (
  session: AgentEvaluationControlledWorkspaceSession,
  context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>,
  snapshot: AgentEvaluationControlledWorkspaceOwnerStateSnapshot | null
): void => {
  if (
    !session ||
    !isAgentControlIdentity(session.sessionId) ||
    session.planDigest !== context.identity.planDigest ||
    session.attemptId !== context.identity.attemptId ||
    session.descriptorDigest !== context.identity.descriptorDigest ||
    session.grantDigest !== context.identity.grantOrAuthorityDigest ||
    session.generation !== context.identity.generation ||
    !isAgentCanonicalDigest(session.materialDigest) ||
    !isAgentCanonicalDigest(session.fixtureDigest) ||
    !isAgentCanonicalDigest(session.baseSnapshotDigest) ||
    !isAgentCanonicalDigest(session.toolRegistryDigest) ||
    !isAgentCanonicalDigest(session.actionRegistryDigest) ||
    !isAgentCanonicalDigest(session.isolationPolicyDigest) ||
    (snapshot !== null &&
      (session.sessionId !== snapshot.sessionId ||
        session.caseId !== snapshot.caseId ||
        session.materialDigest !== snapshot.materialDigest ||
        session.fixtureDigest !== snapshot.fixtureDigest ||
        session.isolationPolicyDigest !== snapshot.isolationPolicyDigest ||
        !sameCanonicalJson(
          session.initialCheckpoint,
          snapshot.initialCheckpoint
        ) ||
        !sameCanonicalJson(
          session.currentCheckpoint,
          snapshot.currentCheckpoint
        )))
  ) {
    return fail('session-binding');
  }
};

const assertCheckpoint = (
  checkpoint: AgentEvaluationControlledWorkspaceSession['currentCheckpoint'],
  session: AgentEvaluationControlledWorkspaceSession,
  initial: boolean
): void => {
  const required = [
    'checkpointRef',
    'attemptId',
    'grantDigest',
    'generation',
    'checkpointDigest',
    ...(initial ? [] : ['predecessorCheckpointDigest']),
    'snapshotDigest',
    'securePersistenceReceiptDigest',
  ];
  const allowed = initial
    ? required
    : required.filter(
        (key) =>
          key !== 'predecessorCheckpointDigest' ||
          checkpoint.predecessorCheckpointDigest !== undefined
      );
  if (
    !exactRecord(checkpoint, allowed) ||
    !isAgentControlIdentity(checkpoint.checkpointRef) ||
    checkpoint.attemptId !== session.attemptId ||
    checkpoint.grantDigest !== session.grantDigest ||
    checkpoint.generation !== session.generation ||
    !isAgentCanonicalDigest(checkpoint.checkpointDigest) ||
    !isAgentCanonicalDigest(checkpoint.snapshotDigest) ||
    !isAgentCanonicalDigest(checkpoint.securePersistenceReceiptDigest) ||
    (initial && checkpoint.predecessorCheckpointDigest !== undefined) ||
    (!initial &&
      checkpoint.predecessorCheckpointDigest !== undefined &&
      !isAgentCanonicalDigest(checkpoint.predecessorCheckpointDigest))
  ) {
    return fail('checkpoint');
  }
  const { checkpointDigest, ...base } = checkpoint;
  if (checkpointDigest !== digestAgentCanonicalValue(base)) {
    return fail('checkpoint-digest');
  }
};

const assertCheckpointLineage = (
  session: AgentEvaluationControlledWorkspaceSession,
  previous: AgentEvaluationControlledWorkspaceOwnerStateSnapshot | null,
  restoredCheckpoint: unknown
): void => {
  assertCheckpoint(session.initialCheckpoint, session, true);
  assertCheckpoint(session.currentCheckpoint, session, false);
  if (previous === null) {
    if (
      !sameCanonicalJson(session.currentCheckpoint, session.initialCheckpoint)
    ) {
      return fail('initial-checkpoint-lineage');
    }
    return;
  }
  if (
    !sameCanonicalJson(session.initialCheckpoint, previous.initialCheckpoint)
  ) {
    return fail('initial-checkpoint-drift');
  }
  if (restoredCheckpoint !== undefined) {
    if (!sameCanonicalJson(session.currentCheckpoint, restoredCheckpoint)) {
      return fail('restored-checkpoint-binding');
    }
    return;
  }
  if (
    !sameCanonicalJson(session.currentCheckpoint, previous.currentCheckpoint) &&
    session.currentCheckpoint.predecessorCheckpointDigest !==
      previous.currentCheckpointDigest
  ) {
    return fail('current-checkpoint-lineage');
  }
};

const sortedProjection = (
  values: readonly unknown[],
  key: string
): readonly unknown[] => {
  if (!Array.isArray(values) || values.length > maximumProjectionEntries) {
    return fail(`projection-${key}`);
  }
  const entries = values.map((value) => {
    if (
      !isPlainObject(value) ||
      typeof value[key] !== 'string' ||
      !isAgentControlIdentity(value[key])
    ) {
      return fail(`projection-${key}`);
    }
    return value;
  });
  const sorted = [...entries].sort((left, right) =>
    compareUnicodeCodePoints(String(left[key]), String(right[key]))
  );
  if (
    new Set(sorted.map((entry) => entry[key])).size !== sorted.length ||
    !sameCanonicalJson(entries, sorted)
  ) {
    return fail(`projection-${key}`);
  }
  return Object.freeze(entries);
};

const decodeCheckpointArtifact = (
  artifact: ProductionControlledWorkspaceSessionCASArtifact
): WorkspaceSnapshot => {
  let value: unknown;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(
      artifact.content
    );
    value = JSON.parse(text);
    if (text !== canonicalJsonText(value))
      return fail('checkpoint-cas-canonical');
  } catch {
    return fail('checkpoint-cas-codec');
  }
  if (
    !exactRecord(value, [
      'format',
      'version',
      'semanticSnapshotDigest',
      'workspaceSnapshot',
    ]) ||
    value.format !==
      PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_FORMAT ||
    value.version !==
      PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_VERSION ||
    !isAgentCanonicalDigest(value.semanticSnapshotDigest) ||
    value.semanticSnapshotDigest !== artifact.semanticSnapshotDigest ||
    !isPlainObject(value.workspaceSnapshot)
  ) {
    return fail('checkpoint-cas-envelope');
  }
  const workspace = value.workspaceSnapshot as WorkspaceSnapshot;
  if (
    !validateWorkspaceSnapshot(workspace).valid ||
    digestAgentCanonicalValue(workspace) !== value.semanticSnapshotDigest
  ) {
    return fail('checkpoint-cas-workspace');
  }
  return workspace;
};

const validateProjection = (
  projection: ProductionControlledWorkspaceSessionProjection,
  forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource
): ProductionControlledWorkspaceSessionProjection => {
  if (
    !projection ||
    !validateWorkspaceSnapshot(projection.workspaceSnapshot).valid ||
    !nullableDigest(projection.finalWorkspaceSnapshotDigest) ||
    !nullableDigest(projection.finalAuthorityReceiptDigest) ||
    !nullableDigest(projection.cleanupReceiptDigest) ||
    !Array.isArray(projection.casArtifacts) ||
    projection.casArtifacts.length >
      AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACTS
  ) {
    return fail('projection');
  }
  const toolDefinitions = sortedProjection(
    projection.toolDefinitions,
    'toolId'
  );
  const artifactDescriptors = sortedProjection(
    projection.artifactDescriptors,
    'artifactRef'
  );
  let previousArtifactRef: string | undefined;
  for (const artifact of projection.casArtifacts) {
    if (
      !isAgentControlIdentity(artifact.artifactRef) ||
      !isAgentControlIdentity(artifact.artifactKind) ||
      !exactMediaTypePattern.test(artifact.mediaType) ||
      !nullableDigest(artifact.semanticSnapshotDigest) ||
      !(artifact.content instanceof Uint8Array) ||
      artifact.content.byteLength < 1 ||
      artifact.content.byteLength >
        AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACT_BYTES ||
      (previousArtifactRef !== undefined &&
        compareUnicodeCodePoints(previousArtifactRef, artifact.artifactRef) >=
          0)
    ) {
      return fail('projection-cas');
    }
    if (artifact.artifactKind === 'controlled-checkpoint') {
      const workspace = decodeCheckpointArtifact(artifact);
      if (
        artifact.mediaType !== 'application/json' ||
        artifact.semanticSnapshotDigest === null ||
        digestAgentCanonicalValue(workspace) !== artifact.semanticSnapshotDigest
      ) {
        return fail('checkpoint-cas-semantic');
      }
    } else if (artifact.semanticSnapshotDigest !== null) {
      return fail('non-checkpoint-cas-semantic');
    }
    previousArtifactRef = artifact.artifactRef;
    assertProductionAgentEvaluationG3SandboxCanaryClean(
      artifact.content,
      forbiddenCanaries
    );
  }
  const value = Object.freeze({
    ...projection,
    toolDefinitions,
    artifactDescriptors,
    casArtifacts: Object.freeze([...projection.casArtifacts]),
  });
  assertProductionAgentEvaluationG3SandboxCanaryClean(
    {
      ...value,
      casArtifacts: value.casArtifacts.map(
        ({
          artifactRef,
          artifactKind,
          mediaType,
          semanticSnapshotDigest,
          content,
        }) => ({
          artifactRef,
          artifactKind,
          mediaType,
          semanticSnapshotDigest,
          byteLength: content.byteLength,
        })
      ),
    },
    forbiddenCanaries
  );
  return value;
};

export const createProductionControlledWorkspaceOwnerStateSnapshot = (
  context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>,
  session: AgentEvaluationControlledWorkspaceSession,
  projection: ProductionControlledWorkspaceSessionProjection,
  state: 'active' | 'destroyed'
): AgentEvaluationControlledWorkspaceOwnerStateSnapshot => {
  const workspaceSnapshotDigest = digestAgentCanonicalValue(
    projection.workspaceSnapshot
  );
  const toolRegistryDigest = digestAgentCanonicalValue({
    tools: projection.toolDefinitions.map((definition) => {
      if (
        !isPlainObject(definition) ||
        !isAgentControlIdentity(definition.toolId) ||
        !isAgentCanonicalDigest(definition.definitionDigest)
      ) {
        return fail('tool-registry-projection');
      }
      return Object.freeze({
        toolId: definition.toolId,
        definitionDigest: definition.definitionDigest,
      });
    }),
  });
  if (
    session.baseSnapshotDigest !== session.initialCheckpoint.snapshotDigest ||
    session.currentCheckpoint.snapshotDigest !== workspaceSnapshotDigest ||
    toolRegistryDigest !== session.toolRegistryDigest ||
    !isAgentActionRegistrySnapshot(projection.actionRegistry) ||
    projection.actionRegistry.registryDigest !== session.actionRegistryDigest ||
    projection.casArtifacts.some(
      (artifact) =>
        artifact.artifactKind === 'controlled-checkpoint' &&
        artifact.semanticSnapshotDigest !== workspaceSnapshotDigest
    ) ||
    (projection.finalWorkspaceSnapshotDigest !== null &&
      projection.finalWorkspaceSnapshotDigest !== workspaceSnapshotDigest) ||
    (state === 'active' && projection.cleanupReceiptDigest !== null) ||
    (state === 'destroyed' && projection.cleanupReceiptDigest === null)
  ) {
    return fail('checkpoint-projection-binding');
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    namespaceId: context.identity.namespaceId,
    planDigest: context.identity.planDigest,
    repositoryCommit: context.identity.repositoryCommit,
    attemptId: session.attemptId,
    descriptorDigest: session.descriptorDigest,
    caseId: session.caseId,
    materialDigest: session.materialDigest,
    fixtureDigest: session.fixtureDigest,
    grantDigest: session.grantDigest,
    generation: session.generation,
    sessionId: session.sessionId,
    isolationPolicyDigest: session.isolationPolicyDigest,
    revision: context.nextRevision,
    state,
    initialCheckpoint: session.initialCheckpoint,
    initialCheckpointDigest: session.initialCheckpoint.checkpointDigest,
    currentCheckpoint: session.currentCheckpoint,
    currentCheckpointDigest: session.currentCheckpoint.checkpointDigest,
    workspaceSnapshot: projection.workspaceSnapshot,
    workspaceSnapshotDigest,
    toolDefinitions: projection.toolDefinitions,
    toolDefinitionSetDigest: digestAgentCanonicalValue(
      projection.toolDefinitions
    ),
    actionRegistry: projection.actionRegistry,
    actionRegistryDigest: digestAgentCanonicalValue(projection.actionRegistry),
    g3VerificationPlan: projection.g3VerificationPlan,
    verificationPlanDigest: digestAgentCanonicalValue(
      projection.g3VerificationPlan
    ),
    adapterRegistry: projection.adapterRegistry,
    adapterRegistryDigest: digestAgentCanonicalValue(
      projection.adapterRegistry
    ),
    finalWorkspaceSnapshotDigest: projection.finalWorkspaceSnapshotDigest,
    artifactDescriptors: projection.artifactDescriptors,
    artifactDescriptorSetDigest: digestAgentCanonicalValue(
      projection.artifactDescriptors
    ),
    finalAuthorityReceiptDigest: projection.finalAuthorityReceiptDigest,
    cleanupReceiptDigest: projection.cleanupReceiptDigest,
  });
  return Object.freeze({
    ...base,
    snapshotDigest: digestAgentCanonicalValue(base),
  });
};

const sessionWire = (session: AgentEvaluationControlledWorkspaceSession) =>
  Object.freeze({
    sessionId: session.sessionId,
    planDigest: session.planDigest,
    attemptId: session.attemptId,
    descriptorDigest: session.descriptorDigest,
    caseId: session.caseId,
    materialDigest: session.materialDigest,
    fixtureDigest: session.fixtureDigest,
    baseSnapshotDigest: session.baseSnapshotDigest,
    grantDigest: session.grantDigest,
    toolRegistryDigest: session.toolRegistryDigest,
    actionRegistryDigest: session.actionRegistryDigest,
    generation: session.generation,
    isolationPolicyDigest: session.isolationPolicyDigest,
    initialCheckpoint: session.initialCheckpoint,
    currentCheckpoint: session.currentCheckpoint,
  });

const attachmentFact = (
  status: 'loaded' | 'reattached',
  session: AgentEvaluationControlledWorkspaceSession
) => {
  const base = Object.freeze({
    status,
    sessionId: session.sessionId,
    attemptId: session.attemptId,
    grantDigest: session.grantDigest,
    generation: session.generation,
    currentCheckpointDigest: session.currentCheckpoint.checkpointDigest,
  });
  return Object.freeze({
    ...base,
    session: sessionWire(session),
    attachmentReceiptDigest: digestAgentCanonicalValue(base),
  });
};

const uploadCAS = async (
  context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>,
  projection: ProductionControlledWorkspaceSessionProjection
): Promise<readonly AgentEvaluationOwnerStateCASDescriptor[]> => {
  const descriptors = new Map(
    (context.previousBundle?.casArtifacts ?? []).map((descriptor) => [
      descriptor.artifactRef,
      descriptor,
    ])
  );
  for (const artifact of projection.casArtifacts) {
    const bytes = Uint8Array.from(artifact.content);
    try {
      const descriptor = await context.ingress.uploadArtifact({
        serviceKind: 'controlled-workspace',
        requestDigest: context.request.requestDigest,
        ownerImplementationDigest:
          PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST,
        stageDigest: context.stageDigest,
        ownerStateId: context.ownerStateId,
        artifactRef: artifact.artifactRef,
        artifactKind: artifact.artifactKind,
        mediaType: artifact.mediaType,
        content: bytes,
      });
      if (
        descriptor.artifactRef !== artifact.artifactRef ||
        descriptor.artifactKind !== artifact.artifactKind ||
        descriptor.mediaType !== artifact.mediaType ||
        descriptor.artifactDigest !== digestBytes(bytes) ||
        descriptor.byteLength !== bytes.byteLength
      ) {
        return fail('cas-upload-binding');
      }
      const previous = descriptors.get(descriptor.artifactRef);
      if (previous && !sameCanonicalJson(previous, descriptor)) {
        return fail('cas-replacement');
      }
      descriptors.set(descriptor.artifactRef, descriptor);
    } finally {
      bytes.fill(0);
    }
  }
  const result = [...descriptors.values()].sort((left, right) =>
    compareUnicodeCodePoints(left.artifactRef, right.artifactRef)
  );
  if (result.length > AGENT_EVALUATION_OWNER_STATE_MAXIMUM_CAS_ARTIFACTS) {
    return fail('cas-capacity');
  }
  return Object.freeze(result);
};

const durableCAS = async (
  context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>,
  query: AgentEvaluationOwnerStateQueryClient
): Promise<
  Readonly<{
    bundle: AgentEvaluationOwnerStateBundle | null;
    reader: ProductionControlledWorkspaceOwnerStateCASReader;
  }>
> => {
  if (context.prior.revision === 0) {
    return Object.freeze({
      bundle: null,
      reader: Object.freeze({
        async use() {
          return fail('initial-cas-read');
        },
      }),
    });
  }
  if (!context.previousBundle || !context.previousSnapshot) {
    return fail('prior-bundle');
  }
  const state = await query.read(binding, context.ownerStateId);
  if (
    state.ownerStateRevision !== context.prior.revision ||
    state.ownerStateRootDigest !== context.prior.rootDigest ||
    !sameCanonicalJson(state.ownerStateBundle, context.previousBundle)
  ) {
    return fail('prior-read-race');
  }
  const reader: ProductionControlledWorkspaceOwnerStateCASReader =
    Object.freeze({
      async use<T>(
        descriptor: AgentEvaluationOwnerStateCASDescriptor,
        callback: (content: Uint8Array) => Promise<T>
      ): Promise<T> {
        const artifact = await query.readArtifact(binding, state, descriptor);
        const content = Uint8Array.from(artifact.content);
        try {
          return await callback(content);
        } finally {
          content.fill(0);
          artifact.content.fill(0);
        }
      },
    });
  return Object.freeze({ bundle: state.ownerStateBundle, reader });
};

const restorationFact = (checkpointDigest: CanonicalDigest) => {
  const base = Object.freeze({ status: 'restored' as const, checkpointDigest });
  return Object.freeze({
    ...base,
    restorationReceiptDigest: digestAgentCanonicalValue(base),
  });
};

const assertCleanupReceipt = (
  value: unknown,
  session: AgentEvaluationControlledWorkspaceSession,
  request: Parameters<AgentEvaluationControlledWorkspaceSession['destroy']>[0]
): CanonicalDigest => {
  if (!isPlainObject(value)) return fail('cleanup-receipt');
  const required = [
    'attemptId',
    'grantDigest',
    'generation',
    'sessionId',
    'reason',
    'cleanupIntentDigest',
    'cleanupDispatchReceiptDigest',
    'cleanupReceiptDigest',
    'sourceReferencesRevoked',
    'sandboxDestroyed',
    'residualReferenceCount',
    ...(Object.hasOwn(value, 'reverseCleanupReceiptDigest')
      ? ['reverseCleanupReceiptDigest']
      : []),
  ];
  if (
    !exactRecord(value, required) ||
    value.attemptId !== session.attemptId ||
    value.grantDigest !== session.grantDigest ||
    value.generation !== session.generation ||
    value.sessionId !== session.sessionId ||
    value.reason !== request.reason ||
    value.cleanupIntentDigest !== request.cleanupIntentDigest ||
    value.cleanupDispatchReceiptDigest !==
      request.cleanupDispatchReceiptDigest ||
    !isAgentCanonicalDigest(value.cleanupReceiptDigest) ||
    value.sourceReferencesRevoked !== true ||
    value.sandboxDestroyed !== true ||
    value.residualReferenceCount !== 0 ||
    (value.reverseCleanupReceiptDigest !== undefined &&
      !isAgentCanonicalDigest(value.reverseCleanupReceiptDigest))
  ) {
    return fail('cleanup-receipt-binding');
  }
  const { cleanupReceiptDigest, ...base } = value;
  if (cleanupReceiptDigest !== digestAgentCanonicalValue(base)) {
    return fail('cleanup-receipt-digest');
  }
  return cleanupReceiptDigest;
};

export const executeProductionControlledWorkspaceStatefulSession = async (
  input: Pick<
    CreateProductionControlledWorkspaceSessionEngineInput,
    'ownerStateQueryFor' | 'sessions' | 'forbiddenCanaries'
  >,
  context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>
) => {
  const query = input.ownerStateQueryFor(context.request);
  const durable = await durableCAS(context, query);
  let handle: ProductionControlledWorkspaceSessionHandle;
  let facts: readonly unknown[];
  let destroyed = false;
  let restoredCheckpoint: unknown;
  let destroyInput:
    | Parameters<AgentEvaluationControlledWorkspaceSession['destroy']>[0]
    | undefined;
  if (context.request.operation === 'session.load-or-reattach') {
    const payload = loadPayload(context);
    const loaded = await input.sessions.loadOrReattach({
      context,
      ...payload,
      previousSnapshot: context.previousSnapshot,
      previousBundle: durable.bundle,
      cas: durable.reader,
    });
    if (
      (context.previousSnapshot === null && loaded.status !== 'loaded') ||
      (context.previousSnapshot !== null &&
        (context.previousSnapshot.state !== 'active' ||
          loaded.status !== 'reattached'))
    ) {
      return fail('load-status');
    }
    handle = loaded.handle;
    assertSession(handle.session, context, context.previousSnapshot);
    if (
      handle.session.caseId !== payload.grant.caseId ||
      handle.session.materialDigest !== payload.grant.materialDigest ||
      handle.session.fixtureDigest !== payload.grant.fixtureDigest ||
      handle.session.baseSnapshotDigest !== payload.grant.baseSnapshotDigest ||
      handle.session.toolRegistryDigest !== payload.grant.toolRegistryDigest ||
      handle.session.actionRegistryDigest !==
        payload.grant.actionRegistryDigest ||
      handle.session.isolationPolicyDigest !== payload.isolationPolicyDigest
    ) {
      return fail('loaded-session-binding');
    }
    facts = Object.freeze([attachmentFact(loaded.status, handle.session)]);
  } else {
    if (
      !context.previousSnapshot ||
      context.previousSnapshot.state !== 'active' ||
      !durable.bundle
    ) {
      return fail('session-prior');
    }
    handle = await input.sessions.restore({
      context,
      snapshot: context.previousSnapshot,
      bundle: durable.bundle,
      cas: durable.reader,
    });
    assertSession(handle.session, context, context.previousSnapshot);
    const value = sessionPayload(context, context.previousSnapshot);
    switch (context.request.operation) {
      case 'session.preflight':
        facts = Object.freeze([
          await handle.session.preflight(
            value as Parameters<
              AgentEvaluationControlledWorkspaceSession['preflight']
            >[0]
          ),
        ]);
        break;
      case 'session.restore-checkpoint': {
        const checkpoint = value as Parameters<
          AgentEvaluationControlledWorkspaceSession['restoreCheckpoint']
        >[0];
        await handle.session.restoreCheckpoint(checkpoint);
        restoredCheckpoint = checkpoint;
        facts = Object.freeze([
          restorationFact(handle.session.currentCheckpoint.checkpointDigest),
        ]);
        break;
      }
      case 'session.execute':
        facts = Object.freeze([
          await handle.session.execute(
            value as Parameters<
              AgentEvaluationControlledWorkspaceSession['execute']
            >[0]
          ),
        ]);
        break;
      case 'session.reconcile-dispatched':
        facts = Object.freeze([
          await handle.session.reconcileDispatched(
            value as Parameters<
              AgentEvaluationControlledWorkspaceSession['reconcileDispatched']
            >[0]
          ),
        ]);
        break;
      case 'session.artifact.resolve':
        facts = Object.freeze([
          await handle.session.resolveArtifact(
            value as Parameters<
              AgentEvaluationControlledWorkspaceSession['resolveArtifact']
            >[0]
          ),
        ]);
        break;
      case 'session.assess-final':
        facts = Object.freeze([
          await handle.session.assessFinal(
            value as Parameters<
              AgentEvaluationControlledWorkspaceSession['assessFinal']
            >[0]
          ),
        ]);
        break;
      case 'session.destroy':
        destroyInput = value as Parameters<
          AgentEvaluationControlledWorkspaceSession['destroy']
        >[0];
        facts = Object.freeze([await handle.session.destroy(destroyInput)]);
        destroyed = true;
        break;
      default:
        return fail('operation');
    }
  }
  assertProductionAgentEvaluationG3SandboxCanaryClean(
    facts,
    input.forbiddenCanaries
  );
  assertCheckpointLineage(
    handle.session,
    context.previousSnapshot,
    restoredCheckpoint
  );
  const projection = validateProjection(
    await handle.capture(),
    input.forbiddenCanaries
  );
  if (destroyed) {
    const cleanupReceiptDigest = assertCleanupReceipt(
      facts[0],
      handle.session,
      destroyInput!
    );
    if (cleanupReceiptDigest !== projection.cleanupReceiptDigest) {
      return fail('cleanup-projection-binding');
    }
  }
  const snapshot = createProductionControlledWorkspaceOwnerStateSnapshot(
    context,
    handle.session,
    projection,
    destroyed ? 'destroyed' : 'active'
  );
  const casArtifacts = await uploadCAS(context, projection);
  if (
    !casArtifacts.some(
      (descriptor) =>
        descriptor.artifactRef ===
          handle.session.currentCheckpoint.checkpointRef &&
        descriptor.artifactKind === 'controlled-checkpoint'
    )
  ) {
    return fail('current-checkpoint-cas');
  }
  return Object.freeze({ facts, snapshot, casArtifacts });
};

export const createProductionControlledWorkspaceSessionEngine = (
  input: CreateProductionControlledWorkspaceSessionEngineInput
): ProductionControlledWorkspaceOwnerEngine => {
  if (
    typeof input.orphanRead?.read !== 'function' ||
    typeof input.ownerStateQueryFor !== 'function' ||
    typeof input.sessions?.loadOrReattach !== 'function' ||
    typeof input.sessions?.restore !== 'function' ||
    typeof input.sessions?.close !== 'function' ||
    typeof input.stateless?.read !== 'function' ||
    typeof input.stateless?.execute !== 'function' ||
    typeof input.stateless?.reconcile !== 'function' ||
    typeof input.stateless?.close !== 'function' ||
    typeof input.forbiddenCanaries !== 'function'
  ) {
    return fail('factory');
  }
  let closePromise: Promise<ProductionOwnerResourceRetirement> | undefined;
  return Object.freeze({
    read(request: AgentEvaluationOwnerAuthorityRequest) {
      return request.operation === 'session.orphans.list'
        ? input.orphanRead.read(request)
        : input.stateless.read(request);
    },
    execute(
      context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>
    ) {
      return executeProductionControlledWorkspaceStatefulSession(
        input,
        context
      );
    },
    executeStateless(request: AgentEvaluationOwnerAuthorityRequest) {
      return input.stateless.execute(request);
    },
    reconcileStateless(request: AgentEvaluationOwnerAuthorityRequest) {
      return input.stateless.reconcile(request);
    },
    close() {
      closePromise ??= (async () => {
        const [sessionRetirement, statelessRetirement] = await Promise.all([
          input.sessions.close(),
          input.stateless.close(),
        ]);
        exactClean(sessionRetirement);
        exactClean(statelessRetirement);
        return Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze([]) as readonly [],
          residualCanaryIds: Object.freeze([]) as readonly [],
        });
      })();
      return closePromise;
    },
  });
};
