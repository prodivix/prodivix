import {
  canonicalAgentEvaluationVerificationAttemptGrantReceipts,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentModelEvaluationAttemptDescriptor,
  validateAgentModelEvaluationPlan,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationWorkspaceFixtureMaterial,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  createVerificationAdapterRegistrySnapshot,
  digestVerificationValue,
  executeVerificationAdapterLifecycle,
  normalizeVerificationCheckReport,
  type VerificationAdapterArtifactRetirementPort,
  type VerificationAdapterFactory,
  type VerificationAdapterLifecycleContext,
  type VerificationAdapterLifecycleResult,
  type VerificationAdapterPrepareInput,
  type VerificationAdapterRegistration,
  type VerificationAdapterRegistrySnapshot,
  type VerificationEvidenceCandidateArtifactMetadata,
  type VerificationEvidenceCandidateProvenance,
  type VerificationEvidenceSourceTrace,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  createAgentEvaluationG3ExecutionEvidenceAuthorityResult,
  createAgentEvaluationControlledWorkspaceDomainPlan,
  createAgentEvaluationControlledWorkspaceG3PlanProjection,
  type AgentEvaluationG3ExecutionEvidenceAuthority,
  type AgentEvaluationG3ExecutionEvidenceAuthorityInput,
} from './controlledWorkspaceRuntimeOwners';
import { validateAgentEvaluationControlledWorkspaceMaterial } from './controlledWorkspaceRuntime';
import {
  createAgentEvaluationVerificationEvidenceBridgeAuthority,
  type AgentEvaluationVerificationEvidenceArtifactSource,
  type AgentEvaluationVerificationEvidenceAttestationAuthority,
  type AgentEvaluationVerificationEvidenceBridge,
} from './evaluationVerificationEvidenceBridge';
import {
  isAgentEvaluationVerificationAttemptGrantReceiptBoundToIssue,
  type AgentEvaluationVerificationAttemptGrantIssueInput,
  type AgentEvaluationVerificationAttemptGrantIssuer,
  type AgentEvaluationVerificationAttemptGrantRunIdentity,
} from './verificationAttemptGrantClient';
import type { WorkspaceSnapshot } from '@prodivix/workspace';

export const AGENT_EVALUATION_CONTROLLED_WORKSPACE_VERIFICATION_CAPABILITY_ID =
  'agent-evaluation.controlled-workspace-runtime' as const;
export const AGENT_EVALUATION_CONTROLLED_WORKSPACE_G3_AUTHORITY_ID =
  'g4-evaluation-controlled-workspace-g3-authority' as const;
export const AGENT_EVALUATION_CONTROLLED_WORKSPACE_G3_AUTHORITY_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    packageName: '@prodivix/agent-evaluation-runner',
    owner: 'controlled-workspace-g3-production-authority',
    version: 1,
    lifecycle: 'executeVerificationAdapterLifecycle',
    normalization: 'normalizeVerificationCheckReport',
    evidenceBridge: 'server-only-evaluation-verification-evidence',
  });

const maximumCells = 128;
const maximumInputBytes = 8_388_608;
const defaultGrantLifetimeMs = 10 * 60 * 1_000;

export type AgentEvaluationControlledWorkspaceG3CellCompletion = Readonly<{
  timing: Readonly<{
    startedAt: string;
    completedAt: string;
    durationMs: number;
  }>;
  artifacts: readonly VerificationEvidenceCandidateArtifactMetadata[];
  sourceTraces: readonly VerificationEvidenceSourceTrace[];
  dependencyLockDigest: CanonicalDigest;
  provenance: VerificationEvidenceCandidateProvenance;
  redaction: Readonly<{
    policyId: string;
    scannerSetDigest: CanonicalDigest;
    droppedFieldCounts: Readonly<Record<string, number>>;
    secretCanaries?: readonly string[];
  }>;
  scenario?: Readonly<{
    id: string;
    revision: number;
    digest: CanonicalDigest;
    programDigest: CanonicalDigest;
  }>;
}>;

export type AgentEvaluationControlledWorkspaceG3CellRuntimeBinding = Readonly<{
  runtimeAuthorityId: string;
  runtimeImplementationDigest: CanonicalDigest;
  finalWorkspaceSnapshotDigest: CanonicalDigest;
  compilerProjectionReceiptDigest: CanonicalDigest;
  artifactSourceAuthorityDigest: CanonicalDigest;
  attestationAuthorityDigest: CanonicalDigest;
  factory: VerificationAdapterFactory;
  providerKind: VerificationAdapterPrepareInput['providerKind'];
  context: VerificationAdapterLifecycleContext;
  artifactRetirement: VerificationAdapterArtifactRetirementPort;
  artifactSource: AgentEvaluationVerificationEvidenceArtifactSource;
  attestationAuthority: AgentEvaluationVerificationEvidenceAttestationAuthority;
  run: AgentEvaluationVerificationAttemptGrantRunIdentity;
  complete(
    result: Extract<VerificationAdapterLifecycleResult, { status: 'reported' }>
  ): Promise<AgentEvaluationControlledWorkspaceG3CellCompletion>;
}>;

/**
 * Production implementation binds the already-created disposable sandbox to
 * one real adapter cell. `bind` is admission-only: it cannot dispatch an
 * adapter/provider or mutate/stage artifacts before every cell grant is sealed.
 */
export interface AgentEvaluationControlledWorkspaceG3CellRuntimeAuthority {
  bind(input: {
    authorityInput: AgentEvaluationG3ExecutionEvidenceAuthorityInput;
    registrySnapshot: VerificationAdapterRegistrySnapshot;
    cell: VerificationPlanCell;
  }): Promise<AgentEvaluationControlledWorkspaceG3CellRuntimeBinding>;
}

export type AgentEvaluationControlledWorkspaceG3AdmissionInput = Readonly<{
  namespaceId: string;
  evaluationPlanDigest: CanonicalDigest;
  repositoryCommit: string;
  projectId: string;
  descriptor: AgentModelEvaluationAttemptDescriptor;
  generation: number;
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
  finalWorkspaceSnapshotDigest: CanonicalDigest;
  plan: AgentEvaluationG3ExecutionEvidenceAuthorityInput['plan'];
  registrySnapshot: VerificationAdapterRegistrySnapshot;
  cell: VerificationPlanCell;
}>;

export type AgentEvaluationControlledWorkspaceG3Admission = Readonly<{
  run: AgentEvaluationVerificationAttemptGrantRunIdentity;
  admissionReceiptDigest: CanonicalDigest;
}>;

/** Admission owns stable Run identity and performs no adapter lifecycle work. */
export interface AgentEvaluationControlledWorkspaceG3AdmissionAuthority {
  admit(
    input: AgentEvaluationControlledWorkspaceG3AdmissionInput
  ): Promise<AgentEvaluationControlledWorkspaceG3Admission>;
}

export type AgentEvaluationVerificationGrantPreparationMaterialSource =
  Readonly<{
    use<T>(
      input: Readonly<{
        plan: AgentModelEvaluationPlan;
        descriptor: AgentModelEvaluationAttemptDescriptor;
      }>,
      callback: (material: AgentEvaluationCaseMaterial) => Promise<T>
    ): Promise<T>;
  }>;

export type CreateProductionAgentEvaluationVerificationAttemptGrantPreparationAuthorityInput =
  Readonly<{
    materialSource: AgentEvaluationVerificationGrantPreparationMaterialSource;
    admissionAuthority: AgentEvaluationControlledWorkspaceG3AdmissionAuthority;
    projectId?: string;
    now?: () => string;
    grantLifetimeMs?: number;
  }>;

export type AgentEvaluationVerificationAttemptGrantPreparationAuthority =
  Readonly<{
    prepare: import('./durableShardRunner').AgentEvaluationDurableAttemptExecutorFactory['prepareVerificationAttemptGrants'];
  }>;

export type CreateProductionAgentEvaluationControlledWorkspaceG3AuthorityInput =
  Readonly<{
    namespaceId: string;
    evaluationPlanDigest: CanonicalDigest;
    repositoryCommit: string;
    projectId: string;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    generation: number;
    controlledWorkspaceGrantDigest: CanonicalDigest;
    sandboxPolicyDigest: CanonicalDigest;
    fixture: AgentEvaluationWorkspaceFixtureMaterial;
    verificationAttemptGrantIssuer: AgentEvaluationVerificationAttemptGrantIssuer;
    cellRuntimeAuthority: AgentEvaluationControlledWorkspaceG3CellRuntimeAuthority;
    evidenceBridge: AgentEvaluationVerificationEvidenceBridge;
    now?: () => string;
    grantLifetimeMs?: number;
  }>;

const productionFail = (): never => {
  throw new TypeError('G4_CONTROLLED_WORKSPACE_G3_PRODUCTION_UNAVAILABLE');
};

const canonicalInstant = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const exactRunBinding = (
  run: AgentEvaluationVerificationAttemptGrantRunIdentity,
  cell: VerificationPlanCell,
  attemptId: string
): boolean =>
  isAgentControlIdentity(run.runId) &&
  isAgentControlIdentity(run.providerId) &&
  (run.jobId === undefined || isAgentControlIdentity(run.jobId)) &&
  (run.sessionId === undefined || isAgentControlIdentity(run.sessionId)) &&
  run.parentAttemptId === attemptId &&
  run.surface === cell.surface &&
  run.frameworkTarget === cell.frameworkTarget &&
  run.runtimeZone === 'sandbox' &&
  run.browserEngine === cell.browserEngine &&
  sameCanonicalJson(run.viewport, cell.viewport) &&
  run.colorScheme === cell.colorScheme &&
  run.motion === cell.motion &&
  run.locale === cell.locale &&
  Number.isFinite(run.devicePixelRatio) &&
  run.devicePixelRatio > 0 &&
  run.devicePixelRatio <= 16 &&
  isAgentControlIdentity(run.timezone) &&
  isAgentCanonicalDigest(run.fontSetDigest) &&
  (run.sandboxImageDigest === undefined ||
    isAgentCanonicalDigest(run.sandboxImageDigest));

const exactContextBinding = (
  binding: AgentEvaluationControlledWorkspaceG3CellRuntimeBinding,
  registry: VerificationAdapterRegistrySnapshot,
  cell: VerificationPlanCell,
  input: AgentEvaluationG3ExecutionEvidenceAuthorityInput
): boolean => {
  const context = binding.context;
  const expectedFixtureDigests = cell.fixtureSetRef?.digest
    ? [cell.fixtureSetRef.digest]
    : [];
  const executableInputs = context.inputRefs.filter(
    ({ kind }) => kind === 'executable-snapshot'
  );
  return (
    isAgentControlIdentity(binding.runtimeAuthorityId) &&
    isAgentCanonicalDigest(binding.runtimeImplementationDigest) &&
    binding.finalWorkspaceSnapshotDigest ===
      input.sandbox.finalSnapshotDigest &&
    isAgentCanonicalDigest(binding.compilerProjectionReceiptDigest) &&
    isAgentCanonicalDigest(binding.artifactSourceAuthorityDigest) &&
    isAgentCanonicalDigest(binding.attestationAuthorityDigest) &&
    context.registrySnapshotDigest === registry.snapshotDigest &&
    sameCanonicalJson(context.adapter, cell.adapter) &&
    context.runtimeZone === 'sandbox' &&
    isAgentCanonicalDigest(context.runtimeEnvironmentDigest) &&
    context.inputDigest === cell.inputDigest &&
    isAgentCanonicalDigest(context.executableSnapshotDigest) &&
    context.controlProfileDigest === cell.controlProfileRef.digest &&
    sameCanonicalJson(
      [...context.fixtureSetDigests].sort(compareUnicodeCodePoints),
      expectedFixtureDigests
    ) &&
    context.baselineSetDigest === cell.baselineSetRef?.digest &&
    sameCanonicalJson(context.controlCapabilityIds, [
      AGENT_EVALUATION_CONTROLLED_WORKSPACE_VERIFICATION_CAPABILITY_ID,
    ]) &&
    isAgentCanonicalDigest(context.controlCapabilitySnapshotDigest) &&
    isAgentCanonicalDigest(context.appliedControlDigest) &&
    executableInputs.length === 1 &&
    context.inputRefs.length === 1 &&
    isAgentCanonicalDigest(executableInputs[0]!.digest) &&
    executableInputs[0]!.digest !== context.executableSnapshotDigest &&
    Number.isSafeInteger(executableInputs[0]!.size) &&
    executableInputs[0]!.size >= 1 &&
    executableInputs[0]!.size <= maximumInputBytes &&
    exactRunBinding(binding.run, cell, input.attemptId)
  );
};

const bindingReceiptDigest = (
  binding: AgentEvaluationControlledWorkspaceG3CellRuntimeBinding,
  cell: VerificationPlanCell,
  input: AgentEvaluationG3ExecutionEvidenceAuthorityInput
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-g3-cell-runtime-binding',
    version: 1,
    authorityInputDigest: input.authorityInputDigest,
    planDigest: input.plan.planDigest,
    cellId: cell.id,
    attemptId: input.attemptId,
    generation: input.grantGeneration,
    runtimeAuthorityId: binding.runtimeAuthorityId,
    runtimeImplementationDigest: binding.runtimeImplementationDigest,
    finalWorkspaceSnapshotDigest: binding.finalWorkspaceSnapshotDigest,
    compilerProjectionReceiptDigest: binding.compilerProjectionReceiptDigest,
    artifactSourceAuthorityDigest: binding.artifactSourceAuthorityDigest,
    attestationAuthorityDigest: binding.attestationAuthorityDigest,
    providerKind: binding.providerKind,
    runtimeEnvironmentDigest: binding.context.runtimeEnvironmentDigest,
    executableSnapshotDigest: binding.context.executableSnapshotDigest,
    controlCapabilitySnapshotDigest:
      binding.context.controlCapabilitySnapshotDigest,
    appliedControlDigest: binding.context.appliedControlDigest,
    inputRefs: binding.context.inputRefs,
    run: binding.run,
  });

const completionReceiptDigest = (
  completion: AgentEvaluationControlledWorkspaceG3CellCompletion,
  lifecycle: Extract<
    VerificationAdapterLifecycleResult,
    { status: 'reported' }
  >,
  cellId: string,
  authorityInputDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-g3-cell-completion',
    version: 1,
    authorityInputDigest,
    cellId,
    lifecycleDigest: digestVerificationValue(lifecycle),
    timing: completion.timing,
    artifacts: completion.artifacts,
    sourceTraces: completion.sourceTraces,
    dependencyLockDigest: completion.dependencyLockDigest,
    provenance: completion.provenance,
    redaction: completion.redaction,
    ...(completion.scenario ? { scenario: completion.scenario } : {}),
  });

/**
 * Pure canonical projection shared by pre-dispatch grant preparation and the
 * later G3 execution authority. The cell runtime binding remains the sole
 * owner of the run identity and executable/runtime commitments.
 */
export const createAgentEvaluationVerificationAttemptGrantIssueInputFromAdmission =
  (input: {
    namespaceId: string;
    evaluationPlanDigest: CanonicalDigest;
    repositoryCommit: string;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    generation: number;
    projectId: string;
    verificationPlan: AgentEvaluationG3ExecutionEvidenceAuthorityInput['plan'];
    cellId: string;
    run: AgentEvaluationVerificationAttemptGrantRunIdentity;
    expiresAt: string;
  }): AgentEvaluationVerificationAttemptGrantIssueInput =>
    Object.freeze({
      namespaceId: input.namespaceId,
      evaluationPlanDigest: input.evaluationPlanDigest,
      repositoryCommit: input.repositoryCommit,
      descriptor: input.descriptor,
      generation: input.generation,
      projectId: input.projectId,
      verificationPlan: input.verificationPlan,
      cellId: input.cellId,
      run: input.run,
      trustCeiling: 'remote-attested',
      expiresAt: input.expiresAt,
    });

export const createAgentEvaluationVerificationAttemptGrantIssueInput = (
  input: CreateProductionAgentEvaluationControlledWorkspaceG3AuthorityInput,
  authorityInput: AgentEvaluationG3ExecutionEvidenceAuthorityInput,
  binding: AgentEvaluationControlledWorkspaceG3CellRuntimeBinding,
  cellId: string,
  expiresAt: string
): AgentEvaluationVerificationAttemptGrantIssueInput =>
  createAgentEvaluationVerificationAttemptGrantIssueInputFromAdmission({
    namespaceId: input.namespaceId,
    evaluationPlanDigest: input.evaluationPlanDigest,
    repositoryCommit: input.repositoryCommit,
    descriptor: input.descriptor,
    generation: input.generation,
    projectId: input.projectId,
    verificationPlan: authorityInput.plan,
    cellId,
    run: binding.run,
    expiresAt,
  });

const validateCompletion = (
  completion: AgentEvaluationControlledWorkspaceG3CellCompletion,
  binding: AgentEvaluationControlledWorkspaceG3CellRuntimeBinding,
  cell: VerificationPlanCell
): boolean =>
  canonicalInstant(completion.timing.startedAt) &&
  canonicalInstant(completion.timing.completedAt) &&
  completion.timing.durationMs ===
    Date.parse(completion.timing.completedAt) -
      Date.parse(completion.timing.startedAt) &&
  completion.timing.durationMs >= 0 &&
  isAgentCanonicalDigest(completion.dependencyLockDigest) &&
  completion.provenance.origin === 'remote' &&
  completion.provenance.providerId === binding.run.providerId &&
  canonicalInstant(completion.provenance.issuedAt) &&
  (completion.provenance.expiresAt === undefined ||
    canonicalInstant(completion.provenance.expiresAt)) &&
  (cell.scenarioId === undefined
    ? completion.scenario === undefined
    : completion.scenario?.id === cell.scenarioId &&
      completion.scenario.programDigest ===
        binding.context.scenarioProgramDigest);

const buildRegistry = (
  fixture: AgentEvaluationWorkspaceFixtureMaterial
): VerificationAdapterRegistrySnapshot => {
  const registry = createVerificationAdapterRegistrySnapshot(
    fixture.verificationFixture
      .adapters as unknown as readonly VerificationAdapterRegistration[]
  );
  if (
    registry.snapshotDigest !==
    fixture.verificationFixture.adapterRegistryDigest
  ) {
    return productionFail();
  }
  return registry;
};

/**
 * Produces the exact per-cell AttemptGrant inputs before Provider dispatch.
 * Frozen expected Workspace changes are used only as an admission ceiling;
 * final G3 collection still requires the actual owner receipts and exact final
 * Workspace digest to match this pre-authorized target.
 */
export const createProductionAgentEvaluationVerificationAttemptGrantPreparationAuthority =
  (
    options: CreateProductionAgentEvaluationVerificationAttemptGrantPreparationAuthorityInput
  ): AgentEvaluationVerificationAttemptGrantPreparationAuthority => {
    const now = options.now ?? (() => new Date().toISOString());
    const grantLifetimeMs = options.grantLifetimeMs ?? defaultGrantLifetimeMs;
    if (
      typeof options.materialSource?.use !== 'function' ||
      typeof options.admissionAuthority?.admit !== 'function' ||
      (options.projectId !== undefined &&
        !isAgentControlIdentity(options.projectId)) ||
      !Number.isSafeInteger(grantLifetimeMs) ||
      grantLifetimeMs < 1 ||
      grantLifetimeMs > 15 * 60 * 1_000
    ) {
      return productionFail();
    }
    return Object.freeze({
      async prepare({ namespaceId, plan, descriptor, leaseGeneration }) {
        if (
          !isAgentControlIdentity(namespaceId) ||
          !isAgentModelEvaluationAttemptDescriptor(descriptor) ||
          descriptor.planDigest !== plan.planDigest ||
          validateAgentModelEvaluationPlan(plan).length > 0 ||
          !Number.isSafeInteger(leaseGeneration) ||
          leaseGeneration < 1
        ) {
          return productionFail();
        }
        const concreteCase = plan.concreteCases.find(
          ({ caseId }) => caseId === descriptor.caseId
        );
        if (!concreteCase) return productionFail();
        return options.materialSource.use(
          { plan, descriptor },
          async (material) => {
            if (
              material.caseId !== concreteCase.caseId ||
              material.caseDigest !== concreteCase.caseDigest
            ) {
              return productionFail();
            }
            const validated =
              validateAgentEvaluationControlledWorkspaceMaterial(material, {
                caseId: descriptor.caseId,
                materialDigest: material.materialDigest,
              });
            const issuedAt = now();
            if (!canonicalInstant(issuedAt)) return productionFail();
            const expiresAt = new Date(
              Date.parse(issuedAt) + grantLifetimeMs
            ).toISOString();
            const domain = createAgentEvaluationControlledWorkspaceDomainPlan({
              caseId: descriptor.caseId,
              attemptId: descriptor.attemptId,
              fixture: validated.fixture,
              issuedAt,
              expiresAt,
            });
            const baseWorkspace = validated.fixture
              .workspaceSnapshot as WorkspaceSnapshot;
            const finalWorkspace =
              domain.status === 'ready'
                ? domain.plan.candidateSnapshot
                : baseWorkspace;
            const baseSnapshotDigest = digestAgentCanonicalValue(baseWorkspace);
            const finalSnapshotDigest =
              digestAgentCanonicalValue(finalWorkspace);
            const projection =
              createAgentEvaluationControlledWorkspaceG3PlanProjection({
                fixture: validated.fixture,
                baseWorkspace,
                finalWorkspace,
                baseSnapshotDigest,
                finalSnapshotDigest,
              });
            if (projection.status !== 'ready') return productionFail();
            const registrySnapshot = buildRegistry(validated.fixture);
            const projectId = options.projectId ?? finalWorkspace.id;
            if (!isAgentControlIdentity(projectId)) return productionFail();
            const cells = [...projection.plan.cells].sort((left, right) =>
              compareUnicodeCodePoints(left.id, right.id)
            );
            const issueInputs: AgentEvaluationVerificationAttemptGrantIssueInput[] =
              [];
            for (const cell of cells) {
              const admission = await options.admissionAuthority.admit({
                namespaceId,
                evaluationPlanDigest: plan.planDigest,
                repositoryCommit: plan.repositoryCommit,
                projectId,
                descriptor,
                generation: leaseGeneration,
                fixture: validated.fixture,
                finalWorkspaceSnapshotDigest: finalSnapshotDigest,
                plan: projection.plan,
                registrySnapshot,
                cell,
              });
              if (!isAgentCanonicalDigest(admission.admissionReceiptDigest)) {
                return productionFail();
              }
              issueInputs.push(
                createAgentEvaluationVerificationAttemptGrantIssueInputFromAdmission(
                  {
                    namespaceId,
                    evaluationPlanDigest: plan.planDigest,
                    repositoryCommit: plan.repositoryCommit,
                    descriptor,
                    generation: leaseGeneration,
                    projectId,
                    verificationPlan: projection.plan,
                    cellId: cell.id,
                    run: admission.run,
                    expiresAt,
                  }
                )
              );
            }
            if (issueInputs.length < 1 || issueInputs.length > maximumCells) {
              return productionFail();
            }
            return Object.freeze(issueInputs);
          }
        );
      },
    });
  };

const uniqueDigests = (
  values: readonly CanonicalDigest[]
): readonly CanonicalDigest[] => {
  if (values.some((value) => !isAgentCanonicalDigest(value))) {
    return productionFail();
  }
  return Object.freeze([...new Set(values)].sort(compareUnicodeCodePoints));
};

/**
 * Executes the full production G3 chain. It seals one durable AttemptGrant for
 * every Plan cell before entering any adapter/provider lifecycle.
 */
export const createProductionAgentEvaluationControlledWorkspaceG3Authority = (
  input: CreateProductionAgentEvaluationControlledWorkspaceG3AuthorityInput
): AgentEvaluationG3ExecutionEvidenceAuthority => {
  const now = input.now ?? (() => new Date().toISOString());
  const grantLifetimeMs = input.grantLifetimeMs ?? defaultGrantLifetimeMs;
  if (
    !isAgentControlIdentity(input.namespaceId) ||
    !isAgentCanonicalDigest(input.evaluationPlanDigest) ||
    !/^[a-f0-9]{40}$/u.test(input.repositoryCommit) ||
    !isAgentControlIdentity(input.projectId) ||
    !isAgentModelEvaluationAttemptDescriptor(input.descriptor) ||
    input.descriptor.planDigest !== input.evaluationPlanDigest ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 1 ||
    !isAgentCanonicalDigest(input.controlledWorkspaceGrantDigest) ||
    !isAgentCanonicalDigest(input.sandboxPolicyDigest) ||
    !Number.isSafeInteger(grantLifetimeMs) ||
    grantLifetimeMs < 1 ||
    grantLifetimeMs > 15 * 60 * 1_000
  ) {
    return productionFail();
  }
  const registry = buildRegistry(input.fixture);

  const authority: AgentEvaluationG3ExecutionEvidenceAuthority = {
    async collect(authorityInput) {
      if (
        authorityInput.evaluationNamespaceId !== input.namespaceId ||
        authorityInput.evaluationPlanDigest !== input.evaluationPlanDigest ||
        authorityInput.repositoryCommit !== input.repositoryCommit ||
        authorityInput.projectId !== input.projectId ||
        authorityInput.caseId !== input.descriptor.caseId ||
        authorityInput.attemptId !== input.descriptor.attemptId ||
        authorityInput.descriptorDigest !== input.descriptor.descriptorDigest ||
        authorityInput.capabilityDescriptorDigest !==
          input.descriptor.capabilityDescriptorDigest ||
        authorityInput.controlledWorkspaceGrantDigest !==
          input.controlledWorkspaceGrantDigest ||
        authorityInput.grantGeneration !== input.generation ||
        authorityInput.fixtureDigest !== input.fixture.fixtureDigest ||
        authorityInput.verificationFixtureDigest !==
          input.fixture.verificationFixture.verificationFixtureDigest ||
        authorityInput.plan.adapterRegistryDigest !== registry.snapshotDigest ||
        authorityInput.plan.cells.length < 1 ||
        authorityInput.plan.cells.length > maximumCells
      ) {
        return productionFail();
      }
      const cells = [...authorityInput.plan.cells].sort((left, right) =>
        compareUnicodeCodePoints(left.id, right.id)
      );
      const bindings = new Map<
        string,
        AgentEvaluationControlledWorkspaceG3CellRuntimeBinding
      >();
      for (const cell of cells) {
        const binding = await input.cellRuntimeAuthority.bind({
          authorityInput,
          registrySnapshot: registry,
          cell,
        });
        if (!exactContextBinding(binding, registry, cell, authorityInput)) {
          return productionFail();
        }
        bindings.set(cell.id, binding);
      }

      const recovered = await input.verificationAttemptGrantIssuer.list({
        descriptor: input.descriptor,
        generation: input.generation,
        verificationPlanDigest: authorityInput.plan.planDigest,
      });
      const recoveredByCell = new Map(
        recovered.map((receipt) => [receipt.cellId, receipt])
      );
      if (
        recoveredByCell.size !== recovered.length ||
        recovered.some((receipt) => !bindings.has(receipt.cellId))
      ) {
        return productionFail();
      }
      const issuedAt = now();
      if (!canonicalInstant(issuedAt)) return productionFail();
      const newExpiresAt = new Date(
        Date.parse(issuedAt) + grantLifetimeMs
      ).toISOString();
      for (const cell of cells) {
        if (recoveredByCell.has(cell.id)) continue;
        const binding = bindings.get(cell.id)!;
        await input.verificationAttemptGrantIssuer.issue(
          createAgentEvaluationVerificationAttemptGrantIssueInput(
            input,
            authorityInput,
            binding,
            cell.id,
            newExpiresAt
          )
        );
      }
      const durableReceipts = await input.verificationAttemptGrantIssuer.list({
        descriptor: input.descriptor,
        generation: input.generation,
        verificationPlanDigest: authorityInput.plan.planDigest,
      });
      const receipts =
        canonicalAgentEvaluationVerificationAttemptGrantReceipts(
          durableReceipts
        );
      if (
        receipts.length !== cells.length ||
        cells.some((cell) => {
          const binding = bindings.get(cell.id)!;
          const receipt = receipts.find(
            (candidate) => candidate.cellId === cell.id
          );
          return (
            !receipt ||
            !isAgentEvaluationVerificationAttemptGrantReceiptBoundToIssue(
              receipt,
              createAgentEvaluationVerificationAttemptGrantIssueInput(
                input,
                authorityInput,
                binding,
                cell.id,
                receipt.grant.expiresAt
              )
            )
          );
        })
      ) {
        return productionFail();
      }
      const bridgeAuthority =
        createAgentEvaluationVerificationEvidenceBridgeAuthority({
          namespaceId: input.namespaceId,
          evaluationPlanDigest: input.evaluationPlanDigest,
          repositoryCommit: input.repositoryCommit,
          descriptor: input.descriptor,
          generation: input.generation,
          controlledWorkspaceGrantDigest: input.controlledWorkspaceGrantDigest,
          projectId: input.projectId,
          workspaceId: authorityInput.sandbox.workspaceId,
          workspaceRevision: authorityInput.sandbox.finalRevision,
          verificationPlanDigest: authorityInput.plan.planDigest,
          sandboxPolicyDigest: input.sandboxPolicyDigest,
          adapterRegistryDigest: registry.snapshotDigest as CanonicalDigest,
          baseSnapshotDigest: authorityInput.sandbox.baseSnapshotDigest,
          finalSnapshotDigest: authorityInput.sandbox.finalSnapshotDigest,
          verificationAttemptGrantReceipts: receipts,
        });
      const registration = await input.evidenceBridge.registerSandbox({
        authority: bridgeAuthority,
        idempotencyKey: `sandbox.${bridgeAuthority.authorityDigest.slice(7)}`,
      });
      const evidence = [];
      const authorityLeaves: CanonicalDigest[] = [registration.receiptDigest];
      for (const cell of cells) {
        const binding = bindings.get(cell.id)!;
        const lifecycle = await executeVerificationAdapterLifecycle({
          factory: binding.factory,
          registrySnapshot: registry,
          planDigest: authorityInput.plan.planDigest,
          cell,
          attemptId: authorityInput.attemptId,
          generation: authorityInput.grantGeneration,
          providerKind: binding.providerKind,
          context: binding.context,
          artifactRetirement: binding.artifactRetirement,
        });
        if (lifecycle.status !== 'reported') return productionFail();
        const completion = await binding.complete(lifecycle);
        if (!validateCompletion(completion, binding, cell)) {
          return productionFail();
        }
        const normalized = normalizeVerificationCheckReport({
          projectId: input.projectId,
          plan: authorityInput.plan,
          adapterRegistry: registry,
          cellId: cell.id,
          context: Object.freeze({
            cell,
            attemptId: authorityInput.attemptId,
            resolvedInputSetDigest: lifecycle.resolvedInputSetDigest,
            runtimeEnvironmentDigest: binding.context.runtimeEnvironmentDigest,
            executableSnapshotDigest: binding.context.executableSnapshotDigest,
            ...(binding.context.scenarioProgramDigest
              ? {
                  scenarioProgramDigest: binding.context.scenarioProgramDigest,
                }
              : {}),
            controlProfileDigest: binding.context.controlProfileDigest,
            fixtureSetDigests: binding.context.fixtureSetDigests,
            ...(binding.context.baselineSetDigest
              ? { baselineSetDigest: binding.context.baselineSetDigest }
              : {}),
            controlCapabilityIds: binding.context.controlCapabilityIds,
            controlCapabilitySnapshotDigest:
              binding.context.controlCapabilitySnapshotDigest,
            appliedControlDigest: binding.context.appliedControlDigest,
            inputRefs: binding.context.inputRefs,
          }),
          report: lifecycle.report,
          ...(completion.scenario ? { scenario: completion.scenario } : {}),
          run: Object.freeze({
            runId: binding.run.runId,
            providerId: binding.run.providerId,
            ...(binding.run.jobId ? { jobId: binding.run.jobId } : {}),
            ...(binding.run.sessionId
              ? { sessionId: binding.run.sessionId }
              : {}),
            ...(binding.run.parentAttemptId
              ? { parentAttemptId: binding.run.parentAttemptId }
              : {}),
            runtimeZone: binding.run.runtimeZone,
            ...(binding.run.operatingSystemIdentity
              ? {
                  operatingSystemIdentity: binding.run.operatingSystemIdentity,
                }
              : {}),
            devicePixelRatio: binding.run.devicePixelRatio,
            timezone: binding.run.timezone,
            fontSetDigest: binding.run.fontSetDigest,
            ...(binding.run.sandboxImageDigest
              ? { sandboxImageDigest: binding.run.sandboxImageDigest }
              : {}),
          }),
          timing: completion.timing,
          artifacts: completion.artifacts,
          stagedArtifacts: lifecycle.stagedArtifacts,
          sourceTraces: completion.sourceTraces,
          dependencyLockDigest: completion.dependencyLockDigest,
          provenance: completion.provenance,
          redaction: completion.redaction,
          promotion: Object.freeze({
            idempotencyKey: `promotion.${bridgeAuthority.authorityDigest.slice(7)}.${cell.id}`,
            deadline: receipts.find(({ cellId }) => cellId === cell.id)!.grant
              .expiresAt,
          }),
        });
        if (normalized.status !== 'ready') return productionFail();
        const promoted = await input.evidenceBridge.promoteCell({
          authority: bridgeAuthority,
          registration,
          cellId: cell.id,
          candidate: normalized.candidate,
          stagedArtifacts: lifecycle.stagedArtifacts,
          artifactSource: binding.artifactSource,
          attestationAuthority: binding.attestationAuthority,
          idempotencyKey: `promotion.${bridgeAuthority.authorityDigest.slice(7)}.${cell.id}`,
        });
        const retired = await binding.artifactRetirement.retireAttempt(
          Object.freeze({
            planDigest: authorityInput.plan.planDigest,
            cellId: cell.id,
            attemptId: authorityInput.attemptId,
            generation: authorityInput.grantGeneration,
          }),
          Object.freeze({
            aborted: false,
            subscribe: () => () => undefined,
          })
        );
        if (retired.status !== 'retired') return productionFail();
        evidence.push(promoted.evidence);
        authorityLeaves.push(
          bindingReceiptDigest(binding, cell, authorityInput),
          completionReceiptDigest(
            completion,
            lifecycle,
            cell.id,
            authorityInput.authorityInputDigest
          ),
          ...promoted.authorityReceiptDigests
        );
      }
      const view = await input.evidenceBridge.resolveVerifiedView({
        authority: bridgeAuthority,
        registration,
        evidenceIds: evidence.map(({ id }) => id),
        idempotencyKey: `verified-view.${bridgeAuthority.authorityDigest.slice(7)}`,
      });
      authorityLeaves.push(view.receiptDigest);
      return createAgentEvaluationG3ExecutionEvidenceAuthorityResult({
        authorityId: AGENT_EVALUATION_CONTROLLED_WORKSPACE_G3_AUTHORITY_ID,
        authorityImplementationDigest:
          AGENT_EVALUATION_CONTROLLED_WORKSPACE_G3_AUTHORITY_IMPLEMENTATION_DIGEST,
        authorityInputDigest: authorityInput.authorityInputDigest,
        evidence: Object.freeze(evidence),
        verifiedEvidenceView: view.verifiedEvidenceView,
        closureEvaluationInstant:
          view.verifiedEvidenceView.closureEvaluationInstant,
        revocationRecordDigest: view.verifiedEvidenceView
          .revocationRecordDigest as CanonicalDigest,
        revokedEvidenceIds: view.revokedEvidenceIds,
        verificationAttemptGrantReceipts: receipts,
        authorityLeafReceiptDigests: uniqueDigests(authorityLeaves),
      });
    },
  };
  return Object.freeze(authority);
};
