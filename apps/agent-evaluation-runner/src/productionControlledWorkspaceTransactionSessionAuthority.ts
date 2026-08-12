import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type AgentEvaluationControlledPersistedArtifactRef,
  type AgentEvaluationResultArtifactKind,
  type AgentEvaluationResultArtifactRef,
  type AgentEvaluationToolInputMaterial,
  type AgentEvaluationWorkspaceFixtureMaterial,
  type AgentJsonValue,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  WORKSPACE_AGENT_ACTION_REGISTRY,
  applyWorkspaceTransaction,
  validateWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  assertProductionAgentEvaluationG3SandboxCanaryClean,
  type AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource,
} from './controlledWorkspaceG3CellAdapter';
import {
  type AgentEvaluationControlledWorkspaceCheckpoint,
  type AgentEvaluationControlledWorkspaceCleanupReceipt,
  type AgentEvaluationControlledWorkspaceEffect,
  type AgentEvaluationControlledWorkspaceFinalAuthority,
  type AgentEvaluationControlledWorkspacePreflightReceipt,
  type AgentEvaluationControlledWorkspacePublicScanReceipt,
  type AgentEvaluationControlledWorkspaceSession,
  type AgentEvaluationControlledWorkspaceGrant,
  createAgentEvaluationControlledWorkspaceGrant,
  validateAgentEvaluationControlledWorkspaceMaterial,
} from './controlledWorkspaceRuntime';
import { validateControlledWorkspaceToolArguments } from './controlledWorkspaceRuntimeSchema';
import {
  createAgentEvaluationControlledWorkspaceDomainPlan,
  type AgentEvaluationControlledWorkspaceG3Result,
} from './controlledWorkspaceRuntimeOwners';
import {
  PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_FORMAT,
  PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_VERSION,
  type ProductionControlledWorkspaceOwnerStateCASReader,
  type ProductionControlledWorkspaceSessionHandle,
  type ProductionControlledWorkspaceSessionProjection,
  type ProductionControlledWorkspaceTransactionSessionAuthority,
} from './productionControlledWorkspaceSessionEngine';
import type {
  AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
  AgentEvaluationOwnerStateBundle,
  AgentEvaluationOwnerStateCASDescriptor,
} from './ownerState';
import type {
  OwnerStateExecutionContext,
  ProductionOwnerResourceRetirement,
} from './productionWorkspaceVerificationOwnerAuthorityPorts';

export const PRODUCTION_CONTROLLED_WORKSPACE_TRANSACTION_SESSION_STATE_FORMAT =
  'prodivix.agent-evaluation-controlled-workspace-transaction-session-state' as const;
export const PRODUCTION_CONTROLLED_WORKSPACE_TRANSACTION_SESSION_STATE_VERSION =
  1 as const;

type G3EvaluationInput = Readonly<{
  namespaceId: string;
  evaluationPlanDigest: CanonicalDigest;
  repositoryCommit: string;
  descriptorDigest: CanonicalDigest;
  capabilityDescriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  grant: AgentEvaluationControlledWorkspaceGrant;
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
  baseWorkspace: WorkspaceSnapshot;
  finalWorkspace: WorkspaceSnapshot;
  baseSnapshotRef: string;
  finalSnapshotRef: string;
  isolationPolicyDigest: CanonicalDigest;
  operationReceiptDigests: readonly CanonicalDigest[];
  commandReceiptDigests: readonly CanonicalDigest[];
  transactionReceiptDigests: readonly CanonicalDigest[];
}>;

/**
 * Production G3 owner seam. Implementations bind the frozen attempt descriptor,
 * AttemptGrants, compiler/toolchain/Chromium and the independent Verification
 * authority. The transaction session never manufactures Evidence.
 */
export interface ProductionControlledWorkspaceTransactionG3Authority {
  evaluate(
    input: G3EvaluationInput
  ): Promise<AgentEvaluationControlledWorkspaceG3Result>;
  close(): Promise<ProductionOwnerResourceRetirement>;
}

export type CreateProductionControlledWorkspaceTransactionSessionAuthorityInput =
  Readonly<{
    g3: ProductionControlledWorkspaceTransactionG3Authority;
    forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
  }>;

type SanitizedMaterial = Readonly<{
  caseId: string;
  materialDigest: CanonicalDigest;
  capabilityDescriptorDigest: CanonicalDigest;
  tools: readonly AgentEvaluationToolInputMaterial[];
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
}>;

type StoredArtifact = Readonly<{
  descriptor: AgentEvaluationControlledPersistedArtifactRef;
  mediaType: 'application/json';
  value: AgentJsonValue;
}>;

type ProposalState = Readonly<{
  artifactRef: string;
  artifactDigest: CanonicalDigest;
  typedProposalValidationReceiptDigest: CanonicalDigest;
  transactionPlanDigest: CanonicalDigest;
  reverseTransactionDigest: CanonicalDigest;
  actionId: string;
  targetRef: string;
}>;

type VerificationState = Readonly<{
  planArtifactRef: string;
  planArtifactDigest: CanonicalDigest;
  verificationPlanReceiptDigest: CanonicalDigest;
  closureArtifactRef: string;
  closureDigest: CanonicalDigest;
  verdict: 'passed' | 'failed';
  verificationAttemptGrantReceiptDigests: readonly CanonicalDigest[];
  authorityReceiptDigests: readonly CanonicalDigest[];
}>;

type SessionStateEnvelope = Readonly<{
  format: typeof PRODUCTION_CONTROLLED_WORKSPACE_TRANSACTION_SESSION_STATE_FORMAT;
  version: typeof PRODUCTION_CONTROLLED_WORKSPACE_TRANSACTION_SESSION_STATE_VERSION;
  sessionId: string;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  sanitizedMaterial: SanitizedMaterial;
  grant: AgentEvaluationControlledWorkspaceGrant;
  isolationPolicyDigest: CanonicalDigest;
  initialCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  currentCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  workspace: WorkspaceSnapshot;
  checkpointSnapshots: readonly Readonly<{
    checkpoint: AgentEvaluationControlledWorkspaceCheckpoint;
    workspace: WorkspaceSnapshot;
  }>[];
  effects: readonly Readonly<{
    dispatchReceiptDigest: CanonicalDigest;
    inputDigest: CanonicalDigest;
    effect: AgentEvaluationControlledWorkspaceEffect;
  }>[];
  artifacts: readonly StoredArtifact[];
  proposal: ProposalState | null;
  verification: VerificationState | null;
  finalAuthorityReceiptDigest: CanonicalDigest | null;
  cleanupReceiptDigest: CanonicalDigest | null;
  stateDigest: CanonicalDigest;
}>;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const repositoryCommitPattern = /^[a-f0-9]{40}$/u;

const fail = (code: string): never => {
  throw new TypeError(
    `G4_CONTROLLED_WORKSPACE_TRANSACTION_SESSION_INVALID: ${code}`
  );
};

const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);

const canonicalDigests = (
  values: readonly CanonicalDigest[],
  allowEmpty = true
): readonly CanonicalDigest[] => {
  if (
    (!allowEmpty && values.length === 0) ||
    values.some((value) => !isAgentCanonicalDigest(value)) ||
    new Set(values).size !== values.length
  ) {
    return fail('digest-set');
  }
  return Object.freeze([...values].sort(compareUnicodeCodePoints));
};

const clean = (value: ProductionOwnerResourceRetirement): void => {
  if (
    value.status !== 'clean' ||
    value.residualResourceIds.length !== 0 ||
    value.residualCanaryIds.length !== 0
  ) {
    return fail('resource-retirement');
  }
};

const withoutProtectedOracles = (
  fixture: AgentEvaluationWorkspaceFixtureMaterial
): AgentEvaluationWorkspaceFixtureMaterial => {
  const {
    visualOracle: _visualOracle,
    documentOracle: _documentOracle,
    ...safeFixture
  } = fixture;
  return Object.freeze(safeFixture);
};

const checkpoint = (
  sessionId: string,
  grant: AgentEvaluationControlledWorkspaceGrant,
  workspace: WorkspaceSnapshot,
  sequence: number,
  predecessorCheckpointDigest?: CanonicalDigest
): AgentEvaluationControlledWorkspaceCheckpoint => {
  const snapshotDigest = digest(workspace);
  const checkpointRef = `checkpoint.${sessionId.slice(8)}.${sequence}`;
  const securePersistenceReceiptDigest = digest({
    kind: 'controlled-workspace-checkpoint-persistence',
    checkpointRef,
    snapshotDigest,
    predecessorCheckpointDigest: predecessorCheckpointDigest ?? null,
  });
  const base = Object.freeze({
    checkpointRef,
    attemptId: grant.attemptId,
    grantDigest: grant.grantDigest,
    generation: grant.generation,
    ...(predecessorCheckpointDigest ? { predecessorCheckpointDigest } : {}),
    snapshotDigest,
    securePersistenceReceiptDigest,
  });
  return Object.freeze({ ...base, checkpointDigest: digest(base) });
};

const assertCheckpointBinding = (
  value: AgentEvaluationControlledWorkspaceCheckpoint,
  grant: AgentEvaluationControlledWorkspaceGrant,
  workspace: WorkspaceSnapshot,
  predecessorCheckpointDigest: CanonicalDigest | undefined
): void => {
  const { checkpointDigest, ...base } = value;
  if (
    !isAgentControlIdentity(value.checkpointRef) ||
    value.attemptId !== grant.attemptId ||
    value.grantDigest !== grant.grantDigest ||
    value.generation !== grant.generation ||
    value.snapshotDigest !== digest(workspace) ||
    value.predecessorCheckpointDigest !== predecessorCheckpointDigest ||
    !isAgentCanonicalDigest(value.securePersistenceReceiptDigest) ||
    checkpointDigest !== digest(base)
  ) {
    return fail('checkpoint-binding');
  }
};

const recreatedGrant = (
  value: AgentEvaluationControlledWorkspaceGrant
): AgentEvaluationControlledWorkspaceGrant =>
  createAgentEvaluationControlledWorkspaceGrant({
    grantId: value.grantId,
    authorityId: value.authorityId,
    planDigest: value.planDigest,
    attemptId: value.attemptId,
    descriptorDigest: value.descriptorDigest,
    caseId: value.caseId,
    materialDigest: value.materialDigest,
    fixtureDigest: value.fixtureDigest,
    baseSnapshotDigest: value.baseSnapshotDigest,
    toolRegistryDigest: value.toolRegistryDigest,
    actionRegistryDigest: value.actionRegistryDigest,
    allowedToolIds: value.allowedToolIds,
    allowedActionIds: value.allowedActionIds,
    allowedTargetRefs: value.allowedTargetRefs,
    generation: value.generation,
    maximumUses: value.maximumUses,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
  });

const checkpointBytes = (
  workspace: WorkspaceSnapshot,
  semanticSnapshotDigest: CanonicalDigest
): Uint8Array =>
  textEncoder.encode(
    canonicalJsonText(
      Object.freeze({
        format: PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_FORMAT,
        version: PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_VERSION,
        semanticSnapshotDigest,
        workspaceSnapshot: workspace,
      })
    )
  );

const persistedArtifact = (
  artifactKind: AgentEvaluationResultArtifactKind,
  semanticDigest: CanonicalDigest,
  value: AgentJsonValue
): StoredArtifact => {
  const artifactRef = `${artifactKind}.${semanticDigest.slice(7, 47)}`;
  const bytes = textEncoder.encode(canonicalJsonText(value));
  if (bytes.byteLength > 2_097_152) return fail('artifact-size');
  const descriptorBase = Object.freeze({
    artifactKind,
    artifactRef,
    artifactDigest: semanticDigest,
    byteLength: bytes.byteLength,
  });
  return Object.freeze({
    descriptor: Object.freeze({
      ...descriptorBase,
      persistenceReceiptDigest: digest({
        kind: 'controlled-workspace-result-artifact-persistence',
        ...descriptorBase,
        rawArtifactDigest: digest(value),
      }),
    }),
    mediaType: 'application/json',
    value,
  });
};

const publicScan = (
  intentDigest: CanonicalDigest,
  candidate: AgentJsonValue,
  canaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource
): AgentEvaluationControlledWorkspacePublicScanReceipt => {
  assertProductionAgentEvaluationG3SandboxCanaryClean(candidate, canaries);
  const candidateDigest = digest(candidate);
  const fingerprintDigest = digest({
    scanner: 'controlled-workspace-public-result.v1',
    candidateDigest,
  });
  const base = Object.freeze({
    intentDigest,
    candidateDigest,
    safe: true as const,
    canarySetDigest: digest({
      scanner: 'callback-bound-forbidden-canary-source.v1',
      count: canaries().length,
    }),
    fingerprintDigest,
  });
  return Object.freeze({ ...base, scanReceiptDigest: digest(base) });
};

const effectCandidate = (
  effect: Omit<
    AgentEvaluationControlledWorkspaceEffect,
    'authorityReceiptDigests' | 'publicScan' | 'effectReceiptDigest'
  >
): AgentJsonValue =>
  Object.freeze({
    result: effect.result,
    persistedArtifacts: effect.persistedArtifacts,
    changedDocumentIds: effect.changedDocumentIds,
    snapshotBeforeDigest: effect.snapshotBeforeDigest,
    snapshotAfterDigest: effect.snapshotAfterDigest,
    checkpoint: effect.checkpoint,
    ...(effect.domainDryRun ? { domainDryRun: effect.domainDryRun } : {}),
    ...(effect.g3Verification ? { g3Verification: effect.g3Verification } : {}),
    ...(effect.controlledPreview
      ? { controlledPreview: effect.controlledPreview }
      : {}),
  }) as AgentJsonValue;

const completeEffect = (
  base: Omit<
    AgentEvaluationControlledWorkspaceEffect,
    'authorityReceiptDigests' | 'publicScan' | 'effectReceiptDigest'
  >,
  leafReceipts: readonly CanonicalDigest[],
  canaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource
): AgentEvaluationControlledWorkspaceEffect => {
  const scan = publicScan(base.intentDigest, effectCandidate(base), canaries);
  const authorityReceiptDigests = canonicalDigests(
    [...leafReceipts, scan.fingerprintDigest, scan.scanReceiptDigest],
    false
  );
  const withReceipts = Object.freeze({
    ...base,
    authorityReceiptDigests,
    publicScan: scan,
  });
  return Object.freeze({
    ...withReceipts,
    effectReceiptDigest: digest(withReceipts),
  });
};

const stateBase = (
  state: Omit<SessionStateEnvelope, 'stateDigest'>
): Omit<SessionStateEnvelope, 'stateDigest'> => state;

const decodeState = (bytes: Uint8Array): SessionStateEnvelope => {
  let value: unknown;
  try {
    const source = textDecoder.decode(bytes);
    value = JSON.parse(source) as unknown;
    if (canonicalJsonText(value) !== source) return fail('state-canonical');
  } catch {
    return fail('state-json');
  }
  if (
    !isPlainObject(value) ||
    value.format !==
      PRODUCTION_CONTROLLED_WORKSPACE_TRANSACTION_SESSION_STATE_FORMAT ||
    value.version !==
      PRODUCTION_CONTROLLED_WORKSPACE_TRANSACTION_SESSION_STATE_VERSION ||
    !isAgentCanonicalDigest(value.stateDigest)
  ) {
    return fail('state-shape');
  }
  const { stateDigest, ...base } = value;
  if (digest(base) !== stateDigest) return fail('state-digest');
  return Object.freeze(value) as unknown as SessionStateEnvelope;
};

const stateDescriptorRef = (
  snapshot: AgentEvaluationControlledWorkspaceOwnerStateSnapshot
): string => {
  const descriptor = snapshot.artifactDescriptors.find(
    (candidate) =>
      isPlainObject(candidate) &&
      candidate.artifactKind === 'controlled-session-state' &&
      isAgentControlIdentity(candidate.artifactRef)
  );
  if (
    !isPlainObject(descriptor) ||
    !isAgentControlIdentity(descriptor.artifactRef)
  ) {
    return fail('state-descriptor');
  }
  return descriptor.artifactRef;
};

const descriptorFor = (
  bundle: AgentEvaluationOwnerStateBundle,
  artifactRef: string,
  artifactKind: string
): AgentEvaluationOwnerStateCASDescriptor => {
  const descriptor = bundle.casArtifacts.find(
    (candidate) =>
      candidate.artifactRef === artifactRef &&
      candidate.artifactKind === artifactKind
  );
  return descriptor ?? fail('cas-descriptor');
};

const assertRestoredState = (state: SessionStateEnvelope): void => {
  if (
    !isAgentControlIdentity(state.sessionId) ||
    !repositoryCommitPattern.test(state.repositoryCommit) ||
    !isAgentCanonicalDigest(state.planDigest) ||
    !isAgentCanonicalDigest(state.descriptorDigest) ||
    !isAgentCanonicalDigest(state.isolationPolicyDigest) ||
    !Array.isArray(state.sanitizedMaterial?.tools) ||
    !Array.isArray(state.sanitizedMaterial?.fixture?.actionRegistry) ||
    !Array.isArray(state.checkpointSnapshots) ||
    state.checkpointSnapshots.length < 1 ||
    state.checkpointSnapshots.length > 2 ||
    !Array.isArray(state.effects) ||
    !Array.isArray(state.artifacts) ||
    state.sanitizedMaterial.caseId !== state.grant?.caseId ||
    state.sanitizedMaterial.materialDigest !== state.grant?.materialDigest ||
    state.sanitizedMaterial.fixture.fixtureDigest !==
      state.grant?.fixtureDigest ||
    state.grant.planDigest !== state.planDigest ||
    state.grant.attemptId !== state.attemptId ||
    state.grant.descriptorDigest !== state.descriptorDigest ||
    state.grant.baseSnapshotDigest !==
      state.initialCheckpoint?.snapshotDigest ||
    state.currentCheckpoint?.snapshotDigest !== digest(state.workspace) ||
    !validateWorkspaceSnapshot(state.workspace).valid
  ) {
    return fail('state-binding');
  }
  let grant: AgentEvaluationControlledWorkspaceGrant;
  try {
    grant = recreatedGrant(state.grant);
  } catch {
    return fail('state-grant');
  }
  if (!sameCanonicalJson(grant, state.grant)) return fail('state-grant');
  const seen = new Set<string>();
  for (const item of state.checkpointSnapshots) {
    if (
      !item ||
      !isPlainObject(item.checkpoint) ||
      !isPlainObject(item.workspace) ||
      seen.has(item.checkpoint.checkpointDigest)
    ) {
      return fail('state-checkpoints');
    }
    seen.add(item.checkpoint.checkpointDigest);
    assertCheckpointBinding(
      item.checkpoint,
      grant,
      item.workspace,
      sameCanonicalJson(item.checkpoint, state.initialCheckpoint)
        ? undefined
        : item.checkpoint.predecessorCheckpointDigest
    );
  }
  const initial = state.checkpointSnapshots.find(({ checkpoint: candidate }) =>
    sameCanonicalJson(candidate, state.initialCheckpoint)
  );
  const current = state.checkpointSnapshots.find(({ checkpoint: candidate }) =>
    sameCanonicalJson(candidate, state.currentCheckpoint)
  );
  if (
    !initial ||
    !current ||
    !sameCanonicalJson(
      initial.workspace,
      state.sanitizedMaterial.fixture.workspaceSnapshot
    ) ||
    !sameCanonicalJson(current.workspace, state.workspace) ||
    (state.currentCheckpoint.checkpointDigest ===
    state.initialCheckpoint.checkpointDigest
      ? state.checkpointSnapshots.length !== 1 ||
        state.currentCheckpoint.predecessorCheckpointDigest !== undefined
      : state.checkpointSnapshots.length !== 2 ||
        state.currentCheckpoint.predecessorCheckpointDigest !==
          state.initialCheckpoint.checkpointDigest)
  ) {
    return fail('state-checkpoint-lineage');
  }
};

class ProductionTransactionSession implements AgentEvaluationControlledWorkspaceSession {
  readonly sessionId: string;
  readonly planDigest: CanonicalDigest;
  readonly attemptId: string;
  readonly descriptorDigest: CanonicalDigest;
  readonly caseId: string;
  readonly materialDigest: CanonicalDigest;
  readonly fixtureDigest: CanonicalDigest;
  readonly baseSnapshotDigest: CanonicalDigest;
  readonly grantDigest: CanonicalDigest;
  readonly toolRegistryDigest: CanonicalDigest;
  readonly actionRegistryDigest: CanonicalDigest;
  readonly generation: number;
  readonly isolationPolicyDigest: CanonicalDigest;
  readonly initialCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;

  #currentCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  #workspace: WorkspaceSnapshot;
  readonly #namespaceId: string;
  readonly #repositoryCommit: string;
  readonly #material: SanitizedMaterial;
  readonly #grant: AgentEvaluationControlledWorkspaceGrant;
  readonly #g3: ProductionControlledWorkspaceTransactionG3Authority;
  readonly #forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
  readonly #checkpointSnapshots = new Map<string, WorkspaceSnapshot>();
  readonly #effects = new Map<
    CanonicalDigest,
    Readonly<{
      inputDigest: CanonicalDigest;
      effect: AgentEvaluationControlledWorkspaceEffect;
    }>
  >();
  readonly #artifacts = new Map<string, StoredArtifact>();
  #proposal: ProposalState | null = null;
  #verification: VerificationState | null = null;
  #finalAuthorityReceiptDigest: CanonicalDigest | null = null;
  #cleanupReceiptDigest: CanonicalDigest | null = null;
  #destroyed = false;

  constructor(
    input: Readonly<{
      namespaceId: string;
      repositoryCommit: string;
      sessionId: string;
      material: SanitizedMaterial;
      grant: AgentEvaluationControlledWorkspaceGrant;
      isolationPolicyDigest: CanonicalDigest;
      initialCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
      currentCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
      workspace: WorkspaceSnapshot;
      checkpointSnapshots?: readonly Readonly<{
        checkpoint: AgentEvaluationControlledWorkspaceCheckpoint;
        workspace: WorkspaceSnapshot;
      }>[];
      effects?: SessionStateEnvelope['effects'];
      artifacts?: readonly StoredArtifact[];
      proposal?: ProposalState | null;
      verification?: VerificationState | null;
      finalAuthorityReceiptDigest?: CanonicalDigest | null;
      cleanupReceiptDigest?: CanonicalDigest | null;
      g3: ProductionControlledWorkspaceTransactionG3Authority;
      forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
    }>
  ) {
    this.#namespaceId = input.namespaceId;
    this.#repositoryCommit = input.repositoryCommit;
    this.sessionId = input.sessionId;
    this.planDigest = input.grant.planDigest;
    this.attemptId = input.grant.attemptId;
    this.descriptorDigest = input.grant.descriptorDigest;
    this.caseId = input.material.caseId;
    this.materialDigest = input.material.materialDigest;
    this.fixtureDigest = input.material.fixture.fixtureDigest;
    this.baseSnapshotDigest = input.grant.baseSnapshotDigest;
    this.grantDigest = input.grant.grantDigest;
    this.toolRegistryDigest = input.grant.toolRegistryDigest;
    this.actionRegistryDigest = input.grant.actionRegistryDigest;
    this.generation = input.grant.generation;
    this.isolationPolicyDigest = input.isolationPolicyDigest;
    this.initialCheckpoint = input.initialCheckpoint;
    this.#currentCheckpoint = input.currentCheckpoint;
    this.#workspace = input.workspace;
    this.#material = input.material;
    this.#grant = input.grant;
    this.#g3 = input.g3;
    this.#forbiddenCanaries = input.forbiddenCanaries;
    for (const item of input.checkpointSnapshots ?? [
      Object.freeze({
        checkpoint: input.currentCheckpoint,
        workspace: input.workspace,
      }),
    ]) {
      this.#checkpointSnapshots.set(
        item.checkpoint.checkpointDigest,
        item.workspace
      );
    }
    for (const record of input.effects ?? []) {
      this.#effects.set(
        record.dispatchReceiptDigest,
        Object.freeze({
          inputDigest: record.inputDigest,
          effect: record.effect,
        })
      );
    }
    for (const artifact of input.artifacts ?? []) {
      this.#artifacts.set(artifact.descriptor.artifactRef, artifact);
    }
    this.#proposal = input.proposal ?? null;
    this.#verification = input.verification ?? null;
    this.#finalAuthorityReceiptDigest =
      input.finalAuthorityReceiptDigest ?? null;
    this.#cleanupReceiptDigest = input.cleanupReceiptDigest ?? null;
  }

  get currentCheckpoint(): AgentEvaluationControlledWorkspaceCheckpoint {
    return this.#currentCheckpoint;
  }

  #assertLive(): void {
    if (this.#destroyed) return fail('destroyed');
  }

  async preflight(
    input: Parameters<AgentEvaluationControlledWorkspaceSession['preflight']>[0]
  ): Promise<AgentEvaluationControlledWorkspacePreflightReceipt> {
    this.#assertLive();
    const tool = this.#material.tools.find(
      ({ toolId }) => toolId === input.toolId
    );
    let status: 'ready' | 'rejected' = 'ready';
    let code: AgentEvaluationControlledWorkspacePreflightReceipt['code'];
    let action:
      | AgentEvaluationWorkspaceFixtureMaterial['actionRegistry'][number]
      | undefined;
    let targetRef: string | undefined;
    if (
      input.argumentsDigest !== digest(input.arguments) ||
      input.grantDigest !== this.grantDigest ||
      input.generation !== this.generation
    ) {
      status = 'rejected';
      code = 'grant-denied';
    } else if (!tool || !this.#grant.allowedToolIds.includes(input.toolId)) {
      status = 'rejected';
      code = 'unknown-tool';
    } else if (
      !validateControlledWorkspaceToolArguments(
        tool.inputSchema,
        input.arguments
      ).ok
    ) {
      status = 'rejected';
      code = 'arguments-invalid';
    } else if (tool.effect === 'proposal-only') {
      const record = input.arguments as Readonly<{
        actionId?: string;
        target?: Readonly<{ id?: string }>;
        targetRef?: string;
      }>;
      action = this.#material.fixture.actionRegistry.find(
        ({ actionId }) => actionId === record.actionId
      );
      targetRef = record.targetRef ?? record.target?.id;
      if (!action) {
        status = 'rejected';
        code = 'unknown-action';
      } else if (
        !targetRef ||
        !this.#grant.allowedActionIds.includes(action.actionId) ||
        !this.#grant.allowedTargetRefs.includes(targetRef) ||
        targetRef !== action.targetRef
      ) {
        status = 'rejected';
        code = 'scope-denied';
      }
    }
    const base = Object.freeze({
      toolId: input.toolId,
      argumentsDigest: input.argumentsDigest,
      grantDigest: input.grantDigest,
      generation: input.generation,
      status,
      ...(code ? { code } : {}),
      ...(status === 'ready' && tool ? { effect: tool.effect } : {}),
      toolDefinitionDigest: tool?.definitionDigest ?? digest('unknown-tool'),
      inputSchemaDigest: tool
        ? digest(tool.inputSchema)
        : digest('unknown-schema'),
      ...(status === 'ready' && action && targetRef
        ? {
            actionId: action.actionId,
            actionDescriptorDigest: action.descriptorDigest,
            targetRef,
          }
        : {}),
    });
    return Object.freeze({ ...base, preflightReceiptDigest: digest(base) });
  }

  async restoreCheckpoint(
    value: AgentEvaluationControlledWorkspaceCheckpoint
  ): Promise<void> {
    this.#assertLive();
    const workspace = this.#checkpointSnapshots.get(value.checkpointDigest);
    if (!workspace || digest(workspace) !== value.snapshotDigest)
      return fail('checkpoint-restore');
    this.#workspace = workspace;
    this.#currentCheckpoint = value;
  }

  async execute(
    input: Parameters<AgentEvaluationControlledWorkspaceSession['execute']>[0]
  ): Promise<AgentEvaluationControlledWorkspaceEffect> {
    this.#assertLive();
    const effectCanaries = (): readonly string[] =>
      Object.freeze([...this.#forbiddenCanaries(), ...input.secretCanaries]);
    const inputDigest = digest(input);
    const replay = this.#effects.get(input.dispatchReceiptDigest);
    if (replay) {
      if (replay.inputDigest !== inputDigest)
        return fail('dispatch-replay-swap');
      return replay.effect;
    }
    const expectedPreflight = await this.preflight({
      toolId: input.preflight.toolId,
      arguments: input.arguments,
      argumentsDigest: digest(input.arguments),
      grantDigest: this.grantDigest,
      generation: this.generation,
    });
    if (!sameCanonicalJson(expectedPreflight, input.preflight))
      return fail('preflight-swap');
    const before = this.#currentCheckpoint;
    const common = {
      intentDigest: input.intentDigest,
      dispatchReceiptDigest: input.dispatchReceiptDigest,
      grantDigest: this.grantDigest,
      generation: this.generation,
      snapshotBeforeDigest: before.snapshotDigest,
      canonicalWriteObserved: false as const,
      repairRoundCount: 0,
    };
    let effect: AgentEvaluationControlledWorkspaceEffect;
    if (input.preflight.status === 'rejected') {
      effect = completeEffect(
        {
          ...common,
          status: 'rejected',
          effectKind: 'rejected',
          result: Object.freeze({
            status: 'rejected',
            code: input.preflight.code ?? 'grant-denied',
          }),
          snapshotAfterDigest: before.snapshotDigest,
          persistedArtifacts: Object.freeze([]),
          commandReceiptDigests: Object.freeze([]),
          transactionReceiptDigests: Object.freeze([]),
          changedDocumentIds: Object.freeze([]),
          checkpoint: before,
        },
        Object.freeze([input.preflight.preflightReceiptDigest]),
        effectCanaries
      );
    } else if (input.preflight.effect === 'read-only') {
      const result = Object.freeze({
        status: 'inspected',
        workspaceId: this.#workspace.id,
        workspaceRevision: this.#workspace.workspaceRev,
        snapshotDigest: before.snapshotDigest,
        targetRefs: this.#material.fixture.targetRefs,
      });
      effect = completeEffect(
        {
          ...common,
          status: 'succeeded',
          effectKind: 'read',
          result,
          snapshotAfterDigest: before.snapshotDigest,
          persistedArtifacts: Object.freeze([]),
          commandReceiptDigests: Object.freeze([]),
          transactionReceiptDigests: Object.freeze([]),
          changedDocumentIds: Object.freeze([]),
          checkpoint: before,
        },
        Object.freeze([input.preflight.preflightReceiptDigest, digest(result)]),
        effectCanaries
      );
    } else if (input.preflight.effect === 'proposal-only') {
      const planned = createAgentEvaluationControlledWorkspaceDomainPlan({
        caseId: this.caseId,
        attemptId: this.attemptId,
        fixture: this.#material.fixture,
        issuedAt: this.#grant.issuedAt,
        expiresAt: this.#grant.expiresAt,
      });
      if (
        planned.status !== 'ready' ||
        !input.preflight.actionId ||
        !input.preflight.targetRef
      ) {
        return fail('proposal-plan');
      }
      const artifact = persistedArtifact(
        'proposal',
        planned.transactionPlanDigest,
        Object.freeze({
          status: 'proposal-ready',
          plan: planned.plan,
          typedProposalValidationReceiptDigest:
            planned.typedProposalValidationReceiptDigest,
          transactionPlanDigest: planned.transactionPlanDigest,
          reverseTransactionDigest: planned.reverseTransactionDigest,
        }) as AgentJsonValue
      );
      this.#artifacts.set(artifact.descriptor.artifactRef, artifact);
      this.#proposal = Object.freeze({
        artifactRef: artifact.descriptor.artifactRef,
        artifactDigest: artifact.descriptor.artifactDigest,
        typedProposalValidationReceiptDigest:
          planned.typedProposalValidationReceiptDigest,
        transactionPlanDigest: planned.transactionPlanDigest,
        reverseTransactionDigest: planned.reverseTransactionDigest,
        actionId: input.preflight.actionId,
        targetRef: input.preflight.targetRef,
      });
      const result = Object.freeze({
        status: 'proposal-ready',
        proposalRef: artifact.descriptor.artifactRef,
        proposalDigest: artifact.descriptor.artifactDigest,
      });
      effect = completeEffect(
        {
          ...common,
          status: 'succeeded',
          effectKind: 'proposal-dry-run',
          result,
          snapshotAfterDigest: before.snapshotDigest,
          persistedArtifacts: Object.freeze([artifact.descriptor]),
          commandReceiptDigests: Object.freeze([]),
          transactionReceiptDigests: Object.freeze([]),
          changedDocumentIds: Object.freeze([]),
          domainDryRun: Object.freeze({
            actionId: input.preflight.actionId,
            targetRef: input.preflight.targetRef,
            typedProposalValidationReceiptDigest:
              planned.typedProposalValidationReceiptDigest,
            transactionPlanDigest: planned.transactionPlanDigest,
            reverseTransactionDigest: planned.reverseTransactionDigest,
          }),
          checkpoint: before,
        },
        planned.ownerAuthorityReceiptDigests,
        effectCanaries
      );
    } else if (input.preflight.toolId === 'verification.plan.request') {
      if (this.#verification) return fail('verification-repeat');
      const argumentsRecord = input.arguments as Readonly<{
        proposalRef?: string;
        proposalDigest?: CanonicalDigest;
      }>;
      const planned = createAgentEvaluationControlledWorkspaceDomainPlan({
        caseId: this.caseId,
        attemptId: this.attemptId,
        fixture: this.#material.fixture,
        issuedAt: this.#grant.issuedAt,
        expiresAt: this.#grant.expiresAt,
      });
      if (
        planned.status !== 'ready' ||
        !this.#proposal ||
        argumentsRecord.proposalRef !== this.#proposal.artifactRef ||
        argumentsRecord.proposalDigest !== this.#proposal.artifactDigest
      ) {
        return fail('verification-proposal-binding');
      }
      const applied = applyWorkspaceTransaction(
        this.#workspace,
        planned.plan.transaction
      );
      if (
        !applied.ok ||
        !sameCanonicalJson(applied.snapshot, planned.plan.candidateSnapshot)
      ) {
        return fail('transaction-apply');
      }
      const commandReceiptDigests = canonicalDigests(
        planned.plan.transaction.commands.map((command) =>
          digest({
            kind: 'controlled-workspace-command-apply',
            command,
            transactionId: planned.plan.transaction.id,
          })
        ),
        false
      );
      const transactionReceiptDigests = Object.freeze([
        digest({
          kind: 'controlled-workspace-transaction-apply',
          transaction: planned.plan.transaction,
          snapshotBeforeDigest: before.snapshotDigest,
          snapshotAfterDigest: digest(applied.snapshot),
        }),
      ]);
      const nextCheckpoint = checkpoint(
        this.sessionId,
        this.#grant,
        applied.snapshot,
        this.#checkpointSnapshots.size,
        before.checkpointDigest
      );
      const g3 = await this.#g3.evaluate({
        namespaceId: this.#namespaceId,
        evaluationPlanDigest: this.planDigest,
        repositoryCommit: this.#repositoryCommit,
        descriptorDigest: this.descriptorDigest,
        capabilityDescriptorDigest: this.#material.capabilityDescriptorDigest,
        caseId: this.caseId,
        materialDigest: this.materialDigest,
        grant: this.#grant,
        fixture: this.#material.fixture,
        baseWorkspace: this.#checkpointSnapshots.get(
          this.initialCheckpoint.checkpointDigest
        )!,
        finalWorkspace: applied.snapshot,
        baseSnapshotRef: this.initialCheckpoint.checkpointRef,
        finalSnapshotRef: nextCheckpoint.checkpointRef,
        isolationPolicyDigest: this.isolationPolicyDigest,
        operationReceiptDigests: Object.freeze([
          input.preflight.preflightReceiptDigest,
        ]),
        commandReceiptDigests,
        transactionReceiptDigests,
      });
      if (g3.status !== 'ready') return fail(`g3-${g3.reason}`);
      const planArtifact = persistedArtifact(
        'verification-plan',
        g3.plan.planDigest as CanonicalDigest,
        g3.plan as unknown as AgentJsonValue
      );
      const closureArtifact = persistedArtifact(
        'verification-closure',
        g3.closure.closureDigest as CanonicalDigest,
        g3.closure as unknown as AgentJsonValue
      );
      this.#artifacts.set(planArtifact.descriptor.artifactRef, planArtifact);
      this.#artifacts.set(
        closureArtifact.descriptor.artifactRef,
        closureArtifact
      );
      const verificationAttemptGrantReceiptDigests = canonicalDigests(
        g3.verificationAttemptGrantReceiptDigests,
        false
      );
      this.#verification = Object.freeze({
        planArtifactRef: planArtifact.descriptor.artifactRef,
        planArtifactDigest: planArtifact.descriptor.artifactDigest,
        verificationPlanReceiptDigest: g3.verificationPlanReceiptDigest,
        closureArtifactRef: closureArtifact.descriptor.artifactRef,
        closureDigest: closureArtifact.descriptor.artifactDigest,
        verdict: g3.closure.verdict === 'satisfied' ? 'passed' : 'failed',
        verificationAttemptGrantReceiptDigests,
        authorityReceiptDigests: g3.ownerAuthorityReceiptDigests,
      });
      this.#workspace = applied.snapshot;
      this.#currentCheckpoint = nextCheckpoint;
      this.#checkpointSnapshots.set(
        nextCheckpoint.checkpointDigest,
        applied.snapshot
      );
      const result = Object.freeze({
        status: 'verified',
        planRef: planArtifact.descriptor.artifactRef,
        closureRef: closureArtifact.descriptor.artifactRef,
        verdict: this.#verification.verdict,
      });
      effect = completeEffect(
        {
          ...common,
          status: 'succeeded',
          effectKind: 'verification-transaction',
          result,
          snapshotAfterDigest: nextCheckpoint.snapshotDigest,
          persistedArtifacts: Object.freeze([
            planArtifact.descriptor,
            closureArtifact.descriptor,
          ]),
          commandReceiptDigests,
          transactionReceiptDigests,
          repairRoundCount: 0,
          changedDocumentIds: Object.freeze(
            [
              ...this.#material.fixture.expectedOutcome.transaction
                .changedDocumentIds,
            ].sort(compareUnicodeCodePoints)
          ),
          g3Verification: Object.freeze({
            verificationPlanReceiptDigest:
              this.#verification.verificationPlanReceiptDigest,
            verificationClosureDigest: this.#verification.closureDigest,
            verdict: this.#verification.verdict,
            verificationAttemptGrantReceiptDigests,
          }),
          checkpoint: nextCheckpoint,
        },
        Object.freeze([
          ...planned.ownerAuthorityReceiptDigests,
          ...g3.ownerAuthorityReceiptDigests,
          ...verificationAttemptGrantReceiptDigests,
          ...commandReceiptDigests,
          ...transactionReceiptDigests,
        ]),
        effectCanaries
      );
    } else {
      return fail('unsupported-production-tool');
    }
    if (
      textEncoder.encode(canonicalJsonText(effect)).byteLength >
      input.maximumResultBytes
    ) {
      return fail('effect-size');
    }
    this.#effects.set(
      input.dispatchReceiptDigest,
      Object.freeze({ inputDigest, effect })
    );
    return effect;
  }

  async reconcileDispatched(
    input: Parameters<
      AgentEvaluationControlledWorkspaceSession['reconcileDispatched']
    >[0]
  ): ReturnType<
    AgentEvaluationControlledWorkspaceSession['reconcileDispatched']
  > {
    this.#assertLive();
    const record = this.#effects.get(input.dispatchReceiptDigest);
    if (
      record &&
      record.effect.intentDigest === input.intentDigest &&
      record.effect.grantDigest === input.grantDigest &&
      record.effect.generation === input.generation
    ) {
      return Object.freeze({
        status: 'completed' as const,
        effect: record.effect,
      });
    }
    const base = Object.freeze({
      status: 'unknown' as const,
      intentDigest: input.intentDigest,
      dispatchReceiptDigest: input.dispatchReceiptDigest,
      grantDigest: input.grantDigest,
      generation: input.generation,
      reconciliationReceiptDigest: digest({
        kind: 'controlled-workspace-dispatch-unknown',
        ...input,
      }),
      cleanupReceiptDigest: digest({
        kind: 'controlled-workspace-dispatch-unknown-cleanup',
        ...input,
      }),
    });
    return base;
  }

  async resolveArtifact(
    input: AgentEvaluationResultArtifactRef
  ): Promise<AgentEvaluationControlledPersistedArtifactRef> {
    this.#assertLive();
    const artifact = this.#artifacts.get(input.artifactRef);
    if (!artifact || !sameCanonicalJson(artifact.descriptor, input))
      return fail('artifact-resolve');
    return artifact.descriptor;
  }

  async assessFinal(
    input: Parameters<
      AgentEvaluationControlledWorkspaceSession['assessFinal']
    >[0]
  ): Promise<AgentEvaluationControlledWorkspaceFinalAuthority> {
    this.#assertLive();
    if (!this.#proposal || !this.#verification)
      return fail('final-prerequisite');
    if (
      input.submission.plan.planRef !== this.#verification.planArtifactRef ||
      input.submission.plan.planDigest !==
        this.#verification.planArtifactDigest ||
      input.submission.closure.closureRef !==
        this.#verification.closureArtifactRef ||
      input.submission.closure.closureDigest !==
        this.#verification.closureDigest ||
      input.submission.closure.verdict !== this.#verification.verdict
    ) {
      return fail('final-submission-binding');
    }
    const proposalValidation = Object.freeze({
      verdict: 'passed' as const,
      typedProposalValidationReceiptDigest:
        this.#proposal.typedProposalValidationReceiptDigest,
    });
    const g3Verification = Object.freeze({
      verificationPlanArtifactRef: this.#verification.planArtifactRef,
      verificationPlanArtifactDigest: this.#verification.planArtifactDigest,
      verificationPlanReceiptDigest:
        this.#verification.verificationPlanReceiptDigest,
      verificationClosureArtifactRef: this.#verification.closureArtifactRef,
      verificationClosureDigest: this.#verification.closureDigest,
      verdict: this.#verification.verdict,
      verificationAttemptGrantReceiptDigests:
        this.#verification.verificationAttemptGrantReceiptDigests,
    });
    const candidate = Object.freeze({
      attemptId: this.attemptId,
      finalSnapshotDigest: this.#currentCheckpoint.snapshotDigest,
      finalCheckpointDigest: this.#currentCheckpoint.checkpointDigest,
      proposalValidation,
      g3Verification,
      repairRoundCount: 0,
    }) as AgentJsonValue;
    const scan = publicScan(input.finalAssessmentIntentDigest, candidate, () =>
      Object.freeze([...this.#forbiddenCanaries(), ...input.secretCanaries])
    );
    const authorityReceiptDigests = canonicalDigests(
      [
        ...this.#verification.authorityReceiptDigests,
        ...this.#verification.verificationAttemptGrantReceiptDigests,
        this.#proposal.typedProposalValidationReceiptDigest,
        scan.fingerprintDigest,
        scan.scanReceiptDigest,
      ],
      false
    );
    const base = Object.freeze({
      attemptId: this.attemptId,
      grantDigest: this.grantDigest,
      generation: this.generation,
      finalSnapshotDigest: this.#currentCheckpoint.snapshotDigest,
      finalCheckpointDigest: this.#currentCheckpoint.checkpointDigest,
      proposalValidation,
      g3Verification,
      repairRoundCount: 0,
      authorityReceiptDigests,
      authorityReceiptSetDigest: digest({ authorityReceiptDigests }),
      publicScan: scan,
    });
    const result = Object.freeze({
      ...base,
      finalAuthorityReceiptDigest: digest(base),
    });
    this.#finalAuthorityReceiptDigest = result.finalAuthorityReceiptDigest;
    return result;
  }

  async destroy(
    input: Parameters<AgentEvaluationControlledWorkspaceSession['destroy']>[0]
  ): Promise<AgentEvaluationControlledWorkspaceCleanupReceipt> {
    if (this.#cleanupReceiptDigest)
      return fail('destroy-replay-requires-sealed-state');
    const base = Object.freeze({
      attemptId: this.attemptId,
      grantDigest: this.grantDigest,
      generation: this.generation,
      sessionId: this.sessionId,
      reason: input.reason,
      cleanupIntentDigest: input.cleanupIntentDigest,
      cleanupDispatchReceiptDigest: input.cleanupDispatchReceiptDigest,
      sourceReferencesRevoked: true as const,
      sandboxDestroyed: true as const,
      residualReferenceCount: 0 as const,
    });
    const result = Object.freeze({
      ...base,
      cleanupReceiptDigest: digest(base),
    });
    this.#cleanupReceiptDigest = result.cleanupReceiptDigest;
    this.#destroyed = true;
    return result;
  }

  async capture(): Promise<ProductionControlledWorkspaceSessionProjection> {
    const checkpointSnapshots = Object.freeze(
      [...this.#checkpointSnapshots.entries()]
        .map(([checkpointDigest, workspace]) => {
          const checkpointValue =
            checkpointDigest === this.initialCheckpoint.checkpointDigest
              ? this.initialCheckpoint
              : checkpointDigest === this.#currentCheckpoint.checkpointDigest
                ? this.#currentCheckpoint
                : fail('checkpoint-state');
          return Object.freeze({ checkpoint: checkpointValue, workspace });
        })
        .sort((left, right) =>
          compareUnicodeCodePoints(
            left.checkpoint.checkpointDigest,
            right.checkpoint.checkpointDigest
          )
        )
    );
    const effects = Object.freeze(
      [...this.#effects.entries()]
        .map(([dispatchReceiptDigest, record]) =>
          Object.freeze({ dispatchReceiptDigest, ...record })
        )
        .sort((left, right) =>
          compareUnicodeCodePoints(
            left.dispatchReceiptDigest,
            right.dispatchReceiptDigest
          )
        )
    );
    const artifacts = Object.freeze(
      [...this.#artifacts.values()].sort((left, right) =>
        compareUnicodeCodePoints(
          left.descriptor.artifactRef,
          right.descriptor.artifactRef
        )
      )
    );
    const stateWithoutDigest = Object.freeze({
      format: PRODUCTION_CONTROLLED_WORKSPACE_TRANSACTION_SESSION_STATE_FORMAT,
      version:
        PRODUCTION_CONTROLLED_WORKSPACE_TRANSACTION_SESSION_STATE_VERSION,
      sessionId: this.sessionId,
      namespaceId: this.#namespaceId,
      planDigest: this.planDigest,
      repositoryCommit: this.#repositoryCommit,
      attemptId: this.attemptId,
      descriptorDigest: this.descriptorDigest,
      sanitizedMaterial: this.#material,
      grant: this.#grant,
      isolationPolicyDigest: this.isolationPolicyDigest,
      initialCheckpoint: this.initialCheckpoint,
      currentCheckpoint: this.#currentCheckpoint,
      workspace: this.#workspace,
      checkpointSnapshots,
      effects,
      artifacts,
      proposal: this.#proposal,
      verification: this.#verification,
      finalAuthorityReceiptDigest: this.#finalAuthorityReceiptDigest,
      cleanupReceiptDigest: this.#cleanupReceiptDigest,
    });
    const state: SessionStateEnvelope = Object.freeze({
      ...stateWithoutDigest,
      stateDigest: digest(stateBase(stateWithoutDigest)),
    });
    const stateContent = textEncoder.encode(canonicalJsonText(state));
    const stateRef = `session-state.${state.stateDigest.slice(7, 47)}`;
    const checkpointContent = checkpointBytes(
      this.#workspace,
      this.#currentCheckpoint.snapshotDigest
    );
    const casArtifacts = [
      Object.freeze({
        artifactRef: this.#currentCheckpoint.checkpointRef,
        artifactKind: 'controlled-checkpoint',
        mediaType: 'application/json',
        semanticSnapshotDigest: this.#currentCheckpoint.snapshotDigest,
        content: checkpointContent,
      }),
      Object.freeze({
        artifactRef: stateRef,
        artifactKind: 'controlled-session-state',
        mediaType: 'application/json',
        semanticSnapshotDigest: null,
        content: stateContent,
      }),
      ...artifacts.map((artifact) =>
        Object.freeze({
          artifactRef: artifact.descriptor.artifactRef,
          artifactKind: 'controlled-result-artifact',
          mediaType: artifact.mediaType,
          semanticSnapshotDigest: null,
          content: textEncoder.encode(canonicalJsonText(artifact.value)),
        })
      ),
    ].sort((left, right) =>
      compareUnicodeCodePoints(left.artifactRef, right.artifactRef)
    );
    assertProductionAgentEvaluationG3SandboxCanaryClean(
      state,
      this.#forbiddenCanaries
    );
    return Object.freeze({
      workspaceSnapshot: this.#workspace,
      toolDefinitions: this.#material.tools,
      actionRegistry: WORKSPACE_AGENT_ACTION_REGISTRY,
      g3VerificationPlan: this.#material.fixture.verificationFixture,
      adapterRegistry: this.#material.fixture.verificationFixture.adapters,
      finalWorkspaceSnapshotDigest: this.#verification
        ? this.#currentCheckpoint.snapshotDigest
        : null,
      artifactDescriptors: Object.freeze([
        ...artifacts.map(({ descriptor }) => descriptor),
        Object.freeze({
          artifactKind: 'controlled-session-state',
          artifactRef: stateRef,
          artifactDigest: state.stateDigest,
          byteLength: stateContent.byteLength,
        }),
      ]),
      finalAuthorityReceiptDigest: this.#finalAuthorityReceiptDigest,
      cleanupReceiptDigest: this.#cleanupReceiptDigest,
      casArtifacts: Object.freeze(casArtifacts),
    });
  }
}

const restoredSession = async (
  input: Readonly<{
    context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>;
    snapshot: AgentEvaluationControlledWorkspaceOwnerStateSnapshot;
    bundle: AgentEvaluationOwnerStateBundle;
    cas: ProductionControlledWorkspaceOwnerStateCASReader;
    g3: ProductionControlledWorkspaceTransactionG3Authority;
    forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
  }>
): Promise<ProductionControlledWorkspaceSessionHandle> => {
  const stateRef = stateDescriptorRef(input.snapshot);
  const stateDescriptor = descriptorFor(
    input.bundle,
    stateRef,
    'controlled-session-state'
  );
  const state = await input.cas.use(stateDescriptor, async (content) =>
    decodeState(content)
  );
  assertRestoredState(state);
  const stateProjection = input.snapshot.artifactDescriptors.find(
    (candidate) =>
      isPlainObject(candidate) &&
      candidate.artifactKind === 'controlled-session-state' &&
      candidate.artifactRef === stateRef
  );
  if (
    !isPlainObject(stateProjection) ||
    stateProjection.artifactDigest !== state.stateDigest ||
    stateRef !== `session-state.${state.stateDigest.slice(7, 47)}` ||
    state.namespaceId !== input.context.identity.namespaceId ||
    state.planDigest !== input.context.identity.planDigest ||
    state.repositoryCommit !== input.context.identity.repositoryCommit ||
    state.attemptId !== input.snapshot.attemptId ||
    state.descriptorDigest !== input.snapshot.descriptorDigest ||
    state.sanitizedMaterial.caseId !== input.snapshot.caseId ||
    state.sanitizedMaterial.materialDigest !== input.snapshot.materialDigest ||
    state.sanitizedMaterial.fixture.fixtureDigest !==
      input.snapshot.fixtureDigest ||
    state.grant.grantDigest !== input.snapshot.grantDigest ||
    state.grant.generation !== input.snapshot.generation ||
    !sameCanonicalJson(
      state.initialCheckpoint,
      input.snapshot.initialCheckpoint
    ) ||
    !sameCanonicalJson(
      state.currentCheckpoint,
      input.snapshot.currentCheckpoint
    ) ||
    state.currentCheckpoint.checkpointDigest !==
      input.snapshot.currentCheckpointDigest ||
    digest(state.workspace) !== input.snapshot.workspaceSnapshotDigest ||
    !validateWorkspaceSnapshot(state.workspace).valid
  ) {
    return fail('restore-binding');
  }
  assertProductionAgentEvaluationG3SandboxCanaryClean(
    state,
    input.forbiddenCanaries
  );
  const checkpointDescriptor = descriptorFor(
    input.bundle,
    state.currentCheckpoint.checkpointRef,
    'controlled-checkpoint'
  );
  await input.cas.use(checkpointDescriptor, async (content) => {
    let decoded: unknown;
    try {
      const source = textDecoder.decode(content);
      decoded = JSON.parse(source) as unknown;
      if (canonicalJsonText(decoded) !== source) {
        return fail('restore-checkpoint-canonical');
      }
    } catch {
      return fail('restore-checkpoint-json');
    }
    if (
      !isPlainObject(decoded) ||
      decoded.format !==
        PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_FORMAT ||
      decoded.version !==
        PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_VERSION ||
      decoded.semanticSnapshotDigest !==
        state.currentCheckpoint.snapshotDigest ||
      !sameCanonicalJson(decoded.workspaceSnapshot, state.workspace)
    ) {
      return fail('restore-checkpoint-binding');
    }
  });
  for (const artifact of state.artifacts) {
    const descriptor = descriptorFor(
      input.bundle,
      artifact.descriptor.artifactRef,
      'controlled-result-artifact'
    );
    await input.cas.use(descriptor, async (content) => {
      if (textDecoder.decode(content) !== canonicalJsonText(artifact.value)) {
        return fail('restore-artifact-binding');
      }
    });
  }
  const session = new ProductionTransactionSession({
    namespaceId: state.namespaceId,
    repositoryCommit: state.repositoryCommit,
    sessionId: state.sessionId,
    material: state.sanitizedMaterial,
    grant: state.grant,
    isolationPolicyDigest: state.isolationPolicyDigest,
    initialCheckpoint: state.initialCheckpoint,
    currentCheckpoint: state.currentCheckpoint,
    workspace: state.workspace,
    checkpointSnapshots: state.checkpointSnapshots,
    effects: state.effects,
    artifacts: state.artifacts,
    proposal: state.proposal,
    verification: state.verification,
    finalAuthorityReceiptDigest: state.finalAuthorityReceiptDigest,
    cleanupReceiptDigest: state.cleanupReceiptDigest,
    g3: input.g3,
    forbiddenCanaries: input.forbiddenCanaries,
  });
  return Object.freeze({
    session,
    capture: () => session.capture(),
  });
};

/**
 * Repo-owned disposable Workspace session. It applies only the frozen
 * Workspace Action Registry transaction, persists content-addressed checkpoint
 * and sanitized session state through owner-state CAS, and delegates G3 to a
 * separately pinned production authority.
 */
export const createProductionControlledWorkspaceTransactionSessionAuthority = (
  input: CreateProductionControlledWorkspaceTransactionSessionAuthorityInput
): ProductionControlledWorkspaceTransactionSessionAuthority => {
  if (
    typeof input.g3?.evaluate !== 'function' ||
    typeof input.g3?.close !== 'function' ||
    typeof input.forbiddenCanaries !== 'function'
  ) {
    return fail('factory');
  }
  let closed = false;
  let closePromise: Promise<ProductionOwnerResourceRetirement> | undefined;
  return Object.freeze({
    async loadOrReattach(
      loadInput: Parameters<
        ProductionControlledWorkspaceTransactionSessionAuthority['loadOrReattach']
      >[0]
    ) {
      if (closed) return fail('closed');
      if (loadInput.previousSnapshot && loadInput.previousBundle) {
        return Object.freeze({
          status: 'reattached' as const,
          handle: await restoredSession({
            context: loadInput.context,
            snapshot: loadInput.previousSnapshot,
            bundle: loadInput.previousBundle,
            cas: loadInput.cas,
            g3: input.g3,
            forbiddenCanaries: input.forbiddenCanaries,
          }),
        });
      }
      if (
        loadInput.previousSnapshot ||
        loadInput.previousBundle ||
        !repositoryCommitPattern.test(
          loadInput.context.identity.repositoryCommit
        ) ||
        !isAgentCanonicalDigest(loadInput.isolationPolicyDigest)
      ) {
        return fail('load-binding');
      }
      let materialValidation: ReturnType<
        typeof validateAgentEvaluationControlledWorkspaceMaterial
      >;
      try {
        materialValidation = validateAgentEvaluationControlledWorkspaceMaterial(
          loadInput.material,
          {
            caseId: loadInput.grant.caseId,
            materialDigest: loadInput.grant.materialDigest,
          }
        );
      } catch {
        return fail('load-material');
      }
      if (
        !sameCanonicalJson(loadInput.fixture, materialValidation.fixture) ||
        !sameCanonicalJson(loadInput.grant, recreatedGrant(loadInput.grant)) ||
        loadInput.grant.planDigest !== loadInput.context.identity.planDigest ||
        loadInput.grant.attemptId !== loadInput.context.identity.attemptId ||
        loadInput.grant.descriptorDigest !==
          loadInput.context.identity.descriptorDigest ||
        loadInput.grant.grantDigest !==
          loadInput.context.identity.grantOrAuthorityDigest ||
        loadInput.grant.generation !== loadInput.context.identity.generation ||
        loadInput.grant.caseId !== loadInput.material.caseId ||
        loadInput.grant.materialDigest !== loadInput.material.materialDigest ||
        loadInput.grant.fixtureDigest !==
          materialValidation.fixture.fixtureDigest ||
        loadInput.grant.baseSnapshotDigest !==
          materialValidation.fixture.workspaceSnapshotDigest ||
        loadInput.grant.toolRegistryDigest !==
          materialValidation.toolRegistryDigest ||
        loadInput.grant.actionRegistryDigest !==
          materialValidation.actionRegistryDigest ||
        !validateWorkspaceSnapshot(
          materialValidation.fixture.workspaceSnapshot as WorkspaceSnapshot
        ).valid ||
        digest(materialValidation.fixture.workspaceSnapshot) !==
          loadInput.grant.baseSnapshotDigest
      ) {
        return fail('load-binding');
      }
      const material: SanitizedMaterial = Object.freeze({
        caseId: loadInput.material.caseId,
        materialDigest: loadInput.material.materialDigest,
        capabilityDescriptorDigest:
          loadInput.material.capabilityDescriptorDigest,
        tools: Object.freeze([...loadInput.material.invocation.tools]),
        fixture: withoutProtectedOracles(materialValidation.fixture),
      });
      assertProductionAgentEvaluationG3SandboxCanaryClean(
        material,
        input.forbiddenCanaries
      );
      const workspace = loadInput.fixture
        .workspaceSnapshot as WorkspaceSnapshot;
      const sessionId = `session.${digest({
        attemptId: loadInput.grant.attemptId,
        grantDigest: loadInput.grant.grantDigest,
      }).slice(7, 47)}`;
      const initialCheckpoint = checkpoint(
        sessionId,
        loadInput.grant,
        workspace,
        0
      );
      assertCheckpointBinding(
        initialCheckpoint,
        loadInput.grant,
        workspace,
        undefined
      );
      const session = new ProductionTransactionSession({
        namespaceId: loadInput.context.identity.namespaceId,
        repositoryCommit: loadInput.context.identity.repositoryCommit,
        sessionId,
        material,
        grant: loadInput.grant,
        isolationPolicyDigest: loadInput.isolationPolicyDigest,
        initialCheckpoint,
        currentCheckpoint: initialCheckpoint,
        workspace,
        g3: input.g3,
        forbiddenCanaries: input.forbiddenCanaries,
      });
      return Object.freeze({
        status: 'loaded' as const,
        handle: Object.freeze({
          session,
          capture: () => session.capture(),
        }),
      });
    },
    restore(
      restoreInput: Parameters<
        ProductionControlledWorkspaceTransactionSessionAuthority['restore']
      >[0]
    ) {
      if (closed) return fail('closed');
      return restoredSession({
        ...restoreInput,
        g3: input.g3,
        forbiddenCanaries: input.forbiddenCanaries,
      });
    },
    close() {
      closePromise ??= input.g3.close().then((result) => {
        clean(result);
        closed = true;
        return Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze([]) as readonly [],
          residualCanaryIds: Object.freeze([]) as readonly [],
        });
      });
      return closePromise;
    },
  });
};
