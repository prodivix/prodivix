import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, parse, resolve } from 'node:path';

import {
  digestAgentCanonicalValue,
  isAgentControlIdentity,
  planAgentModelEvaluationAttempts,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationWorkspaceFixtureMaterial,
  type AgentModelEvaluationAttemptDescriptor,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
  compileBehaviorScenario,
  createBehaviorRegistry,
  isBehaviorScenario,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import {
  computeVerificationArtifactContentDigest,
  digestVerificationValue,
  type VerificationAdapterArtifactAttemptCoordinates,
  type VerificationAdapterStagedArtifactRef,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
  BROWSER_VERIFICATION_CELL_INPUT_VERSION,
  FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION,
  assertBrowserVerificationCellInputCoordinates,
  createBrowserVerificationEvidenceSourceTrace,
  createProductionChromiumBrowserAuthority,
  type BrowserVerificationCellInput,
  type ProductionChromiumBrowserAuthority,
  type ProductionChromiumRuntimeAuthorityInput,
} from '@prodivix/verification-browser';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  createWorkspaceSemanticIndexFromSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import type { AgentEvaluationAttemptMaterialSource } from './attemptExecutor';
import {
  assertProductionAgentEvaluationG3SandboxCanaryClean,
  type AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource,
} from './controlledWorkspaceG3CellAdapter';
import { createProductionAgentEvaluationControlledWorkspaceG3CellRuntimeAuthority } from './controlledWorkspaceG3CellRuntime';
import {
  evaluateAgentEvaluationControlledWorkspaceG3,
  type AgentEvaluationControlledWorkspaceG3Result,
} from './controlledWorkspaceRuntimeOwners';
import { createProductionAgentEvaluationControlledWorkspaceG3Authority } from './controlledWorkspaceRuntimeProduction';
import { AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES } from './ledgerClient';
import { createProductionAgentEvaluationAttemptMaterialSource } from './productionAttemptExecutorFactory';
import {
  createProductionAgentEvaluationBrowserCanaryScanner,
  createProductionAgentEvaluationBrowserPreviewAuthority,
  createProductionAgentEvaluationRemoteRuntimeProvider,
  type ProductionAgentEvaluationBrowserPreviewAuthority,
} from './productionBrowserAuthorityPorts';
import {
  createProductionAgentEvaluationControlledWorkspaceG3SandboxPort,
  createProductionControlledWorkspaceG3BrowserRunMaterialReceiptDigest,
  type ProductionControlledWorkspaceG3BrowserRunMaterial,
  type ProductionControlledWorkspaceG3VerificationEvidenceAuthority,
} from './productionControlledWorkspaceG3SandboxPort';
import type { ProductionControlledWorkspaceTransactionG3Authority } from './productionControlledWorkspaceTransactionSessionAuthority';
import {
  createEnvironmentProductionG3AttestationAuthority,
  type ProductionG3AttestationAuthority,
} from './productionG3AttestationAuthority';
import {
  createNodeAgentEvaluationCoordinatorFilePort,
  decodeAgentEvaluationProductionJsonDocument,
} from './productionFiles';
import { createEnvironmentAgentEvaluationVerificationEvidenceDirectAuthority } from './productionVerificationEvidenceDirectAuthority';
import {
  createProductionVerificationEvidenceDirectBridge,
  type ProductionVerificationEvidenceDirectBridge,
} from './productionVerificationEvidenceDirectBridge';
import type { ProductionOwnerResourceRetirement } from './productionWorkspaceVerificationOwnerAuthorityPorts';
import { AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES } from './productionRunConfigArtifact';
import {
  decodeAgentEvaluationFrozenRunConfig,
  requireProductionAgentEvaluationFrozenRunConfig,
  type AgentEvaluationProductionFrozenRunConfig,
} from './runConfig';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import { createEnvironmentAgentEvaluationVerificationAttemptGrantIssuer } from './verificationAttemptGrantClient';

export const PRODUCTION_CONTROLLED_WORKSPACE_G3_ENVIRONMENT_NAMES =
  Object.freeze({
    repositoryRoot: 'PRODIVIX_G4_MODEL_EVAL_REPOSITORY_ROOT',
    chromiumExecutablePath: 'PRODIVIX_G4_MODEL_EVAL_CHROMIUM_EXECUTABLE_PATH',
    chromiumRuntimeAuthority:
      'PRODIVIX_G4_MODEL_EVAL_CHROMIUM_RUNTIME_AUTHORITY',
  } as const);

export const PRODUCTION_CONTROLLED_WORKSPACE_G3_SNAPSHOT_SOURCE_AUTHORITY_DIGEST =
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-g3-final-workspace-source',
    version: 1,
    owner: 'controlled-workspace-transaction-session',
    lifecycle: 'callback-bound-exact-final-snapshot',
  });

export const PRODUCTION_CONTROLLED_WORKSPACE_G3_VERIFICATION_SOURCE_AUTHORITY_DIGEST =
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-g3-verification-material-source',
    version: 1,
    owner: 'canonical-workspace-behavior-scenario',
    compiler: '@prodivix/behavior',
  });

export const PRODUCTION_CONTROLLED_WORKSPACE_G3_ARTIFACT_SOURCE_AUTHORITY_DIGEST =
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-g3-ephemeral-artifact-source',
    version: 1,
    lifecycle: 'content-addressed-until-promotion-then-zeroized',
  });

const maximumRuntimeConfigurationBytes = 65_536;
const maximumArtifactBytes = 16_777_216;
const repositoryCommitPattern = /^[a-f0-9]{40}$/u;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const mediaTypePattern = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u;
const textEncoder = new TextEncoder();

const fail = (code: string): never => {
  throw new TypeError(
    `G4_PRODUCTION_CONTROLLED_WORKSPACE_G3_ENVIRONMENT_INVALID: ${code}`
  );
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

const readRequired = (
  read: AgentEvaluationEnvironmentReader,
  name: string,
  maximum = 65_536
): string => {
  const value = read(name);
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximum ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    [...value].some((character) => {
      const point = character.codePointAt(0)!;
      return point < 32 || point === 127;
    })
  ) {
    return fail(`environment:${name}`);
  }
  return value;
};

const assertCanonicalAbsolutePath = async (
  source: string,
  kind: 'file' | 'directory'
): Promise<string> => {
  if (
    !isAbsolute(source) ||
    resolve(source) !== source ||
    source === parse(source).root
  ) {
    return fail(`path:${kind}`);
  }
  const metadata = await lstat(source);
  const physical = await realpath(source);
  if (
    metadata.isSymbolicLink() ||
    physical !== source ||
    (kind === 'file' ? !metadata.isFile() : !metadata.isDirectory())
  ) {
    return fail(`path:${kind}`);
  }
  return source;
};

type ActiveEvaluation = Readonly<{
  descriptor: AgentModelEvaluationAttemptDescriptor;
  material: AgentEvaluationCaseMaterial;
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
  finalWorkspace: WorkspaceSnapshot;
  finalSnapshotRef: string;
  isolationPolicyDigest: CanonicalDigest;
  compiledByOuterCell: Map<
    string,
    Readonly<{
      material: ProductionControlledWorkspaceG3BrowserRunMaterial;
      scenarioDocumentRevision: number;
      scenarioContentDigest: CanonicalDigest;
    }>
  >;
  authorityInputDigest?: CanonicalDigest;
}>;

type StagedArtifact = Readonly<{
  bindingDigest: CanonicalDigest;
  coordinates: VerificationAdapterArtifactAttemptCoordinates;
  artifact: VerificationAdapterStagedArtifactRef;
  bytes: Uint8Array;
}>;

export type CreateProductionControlledWorkspaceTransactionG3AuthorityInput =
  Readonly<{
    namespaceId: string;
    config: AgentEvaluationProductionFrozenRunConfig;
    materialSource: AgentEvaluationAttemptMaterialSource;
    repositoryRoot: string;
    previewAuthority: ProductionAgentEvaluationBrowserPreviewAuthority;
    browserAuthority: ProductionChromiumBrowserAuthority;
    evidenceBridge: ProductionVerificationEvidenceDirectBridge;
    attestationAuthority: ProductionG3AttestationAuthority;
    verificationAttemptGrantIssuer: ReturnType<
      typeof createEnvironmentAgentEvaluationVerificationAttemptGrantIssuer
    >;
    forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
    now?: () => string;
  }>;

const exactClean = (
  result: ProductionOwnerResourceRetirement,
  label: string
): void => {
  if (
    result.status !== 'clean' ||
    result.residualResourceIds.length !== 0 ||
    result.residualCanaryIds.length !== 0
  ) {
    return fail(`retirement:${label}`);
  }
};

const browserCellFor = (
  outerCell: VerificationPlanCell,
  program: BehaviorScenarioProgram,
  scenarioDocumentId: string,
  executableSnapshotDigest: CanonicalDigest
): VerificationPlanCell => {
  if (
    !outerCell.scenarioId ||
    outerCell.browserEngine !== 'chromium' ||
    outerCell.surface !== 'preview'
  ) {
    return fail('browser-cell-coordinates');
  }
  const identityDigest = digestVerificationValue({
    outerCellId: outerCell.id,
    outerScenarioId: outerCell.scenarioId,
    scenarioDocumentId,
    programDigest: program.programDigest,
    executableSnapshotDigest,
  });
  const inputDigest = digestVerificationValue({
    format: 'prodivix.agent-evaluation-g3-browser-cell-input',
    version: 1,
    outerCell,
    scenarioDocumentId,
    programDigest: program.programDigest,
    executableSnapshotDigest,
    adapter: FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.identity,
  });
  return Object.freeze({
    ...outerCell,
    id: `cell:browser:${identityDigest.slice(7, 47)}`,
    checkId: `check:browser:${identityDigest.slice(7, 47)}`,
    checkKind: 'e2e' as const,
    scenarioId: program.scenarioId,
    adapter: FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION.identity,
    evidenceRequirements: Object.freeze({
      ...outerCell.evidenceRequirements,
      requiredArtifactKinds: Object.freeze([
        'console-summary',
        'network-summary',
        'replay-record',
        'trace',
      ] as const),
    }),
    inputKinds: Object.freeze([
      'executable-snapshot',
      'scenario-program',
      'verification-profile',
    ] as const),
    artifactKinds: Object.freeze([
      'console-summary',
      'network-summary',
      'replay-record',
      'trace',
    ] as const),
    estimatedCost: Object.freeze({
      durationMs: 60_000,
      artifactBytes: Math.min(
        outerCell.estimatedCost.artifactBytes,
        64 * 1_024 * 1_024
      ),
      computeUnits: outerCell.estimatedCost.computeUnits,
    }),
    dependencyCellIds: Object.freeze([]),
    inputDigest,
  });
};

const scenarioDescriptorFor = (
  active: ActiveEvaluation,
  outerCell: VerificationPlanCell
): Readonly<{ id: string; documentId: string }> => {
  const scenarios = active.fixture.verificationFixture.scenarios;
  const descriptor = scenarios.find(
    (candidate): candidate is Readonly<{ id: string; documentId: string }> =>
      exactRecord(
        candidate,
        [
          'id',
          'documentId',
          'criticality',
          'tags',
          'impactedDomains',
          'capabilityIds',
          'targetIds',
          'frameworkTargets',
          'controlProfileRef',
        ],
        ['fixtureSetRef', 'baselineSetRef']
      ) &&
      candidate.id === outerCell.scenarioId &&
      typeof candidate.documentId === 'string'
  );
  if (
    !descriptor ||
    !identityPattern.test(descriptor.id) ||
    !identityPattern.test(descriptor.documentId)
  ) {
    return fail('scenario-descriptor');
  }
  return descriptor;
};

const compileBrowserMaterial = (
  active: ActiveEvaluation,
  outerCell: VerificationPlanCell,
  executableSnapshotDigest: CanonicalDigest
): Readonly<{
  material: ProductionControlledWorkspaceG3BrowserRunMaterial;
  scenarioDocumentRevision: number;
  scenarioContentDigest: CanonicalDigest;
}> => {
  const descriptor = scenarioDescriptorFor(active, outerCell);
  const workspaceDocument =
    active.finalWorkspace.docsById[descriptor.documentId];
  if (
    !workspaceDocument ||
    workspaceDocument.type !== 'behavior-scenario' ||
    !isBehaviorScenario(workspaceDocument.content) ||
    digestAgentCanonicalValue(workspaceDocument.content) === undefined
  ) {
    return fail('behavior-document');
  }
  const semantic = createWorkspaceSemanticIndexFromSnapshot(
    active.finalWorkspace
  );
  const registry = createBehaviorRegistry([
    BEHAVIOR_CORE_REGISTRY_CONTRIBUTION,
  ]);
  if (semantic.status !== 'ready' || !registry.ok) {
    return fail('behavior-authority');
  }
  const fixtureSetDigests = outerCell.fixtureSetRef?.digest
    ? Object.freeze([outerCell.fixtureSetRef.digest])
    : Object.freeze([]);
  const baselineSetDigests = outerCell.baselineSetRef?.digest
    ? Object.freeze([outerCell.baselineSetRef.digest])
    : Object.freeze([]);
  const compiled = compileBehaviorScenario({
    scenario: workspaceDocument.content,
    scenarioDocumentId: workspaceDocument.id,
    workspaceRevision: active.finalWorkspace.workspaceRev,
    semanticIndex: semantic.index,
    executableSnapshotDigest,
    compilerDigest: active.fixture.verificationFixture.compilerDigest,
    registry: registry.registry,
    controlProfileDigest: outerCell.controlProfileRef.digest,
    fixtureSetDigests,
    baselineSetDigests,
  });
  if (compiled.status !== 'ready') return fail('behavior-compile');
  const cell = browserCellFor(
    outerCell,
    compiled.program,
    workspaceDocument.id,
    executableSnapshotDigest
  );
  const base = Object.freeze({
    outerScenarioId: descriptor.id,
    scenarioDocumentId: workspaceDocument.id,
    cell,
    program: compiled.program,
  });
  return Object.freeze({
    material: Object.freeze({
      ...base,
      receiptDigest:
        createProductionControlledWorkspaceG3BrowserRunMaterialReceiptDigest(
          base
        ),
    }),
    scenarioDocumentRevision: workspaceDocument.contentRev,
    scenarioContentDigest: digestAgentCanonicalValue(workspaceDocument.content),
  });
};

const profileFor = (
  material: ProductionControlledWorkspaceG3BrowserRunMaterial,
  input: Readonly<{
    executableSnapshotDigest: CanonicalDigest;
    targetLeaseBindingDigest: CanonicalDigest;
  }>
): BrowserVerificationCellInput => {
  const cell = material.cell;
  if (!cell.scenarioId || cell.browserEngine !== 'chromium') {
    return fail('browser-profile-cell');
  }
  const profile: BrowserVerificationCellInput = Object.freeze({
    format: BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
    version: BROWSER_VERIFICATION_CELL_INPUT_VERSION,
    cellId: cell.id,
    checkKind: 'e2e',
    scenarioId: material.program.scenarioId,
    targetId: cell.targetId,
    frameworkTarget: cell.frameworkTarget,
    surface: cell.surface,
    browserEngine: cell.browserEngine,
    viewport: Object.freeze({
      width: cell.viewport.width,
      height: cell.viewport.height,
    }),
    colorScheme: cell.colorScheme,
    motion: cell.motion,
    locale: cell.locale,
    executableSnapshotDigest: input.executableSnapshotDigest,
    scenarioProgramDigest: material.program.programDigest,
    controlProfileDigest:
      cell.controlProfileRef.digest ?? fail('browser-profile-control'),
    fixtureSetDigests: material.program.fixtureSetDigests,
    ...(cell.baselineSetRef?.digest
      ? { baselineSetDigest: cell.baselineSetRef.digest }
      : {}),
    targetLeaseBindingDigest: input.targetLeaseBindingDigest,
    profile: Object.freeze({
      kind: 'e2e' as const,
      scenarioId: material.program.scenarioId,
      programDigest: material.program.programDigest,
    }),
  });
  assertBrowserVerificationCellInputCoordinates(profile, cell, {
    executableSnapshotDigest: input.executableSnapshotDigest,
    scenarioProgramDigest: material.program.programDigest,
    controlProfileDigest:
      cell.controlProfileRef.digest ?? fail('browser-profile-control'),
    fixtureSetDigests: material.program.fixtureSetDigests,
    ...(cell.baselineSetRef?.digest
      ? { baselineSetDigest: cell.baselineSetRef.digest }
      : {}),
  });
  return profile;
};

/**
 * Owns the callback-bound final Workspace, Behavior compiler, controlled
 * toolchain, Browser runtime, ephemeral Evidence staging and direct Backend
 * promotion lifecycle for one production owner sidecar.
 */
export const createProductionControlledWorkspaceTransactionG3Authority = (
  input: CreateProductionControlledWorkspaceTransactionG3AuthorityInput
): ProductionControlledWorkspaceTransactionG3Authority => {
  if (
    input.config.purpose !== 'production' ||
    !isAgentControlIdentity(input.namespaceId) ||
    typeof input.materialSource?.use !== 'function' ||
    !isAbsolute(input.repositoryRoot) ||
    typeof input.previewAuthority?.reserve !== 'function' ||
    typeof input.browserAuthority?.register !== 'function' ||
    typeof input.evidenceBridge?.promoteCell !== 'function' ||
    typeof input.attestationAuthority?.signAttestation !== 'function' ||
    typeof input.verificationAttemptGrantIssuer?.issue !== 'function' ||
    typeof input.forbiddenCanaries !== 'function'
  ) {
    return fail('factory');
  }
  const now = input.now ?? (() => new Date().toISOString());
  const descriptors = new Map(
    planAgentModelEvaluationAttempts(input.config.plan).map((descriptor) => [
      descriptor.descriptorDigest,
      descriptor,
    ])
  );
  const activeByAttempt = new Map<string, ActiveEvaluation>();
  const activeByAuthorityInput = new Map<CanonicalDigest, ActiveEvaluation>();
  const artifacts = new Map<string, StagedArtifact>();
  const retiredAttempts = new Set<string>();
  let closed = false;
  let closePromise: Promise<ProductionOwnerResourceRetirement> | undefined;

  const activeForSnapshot = (
    request: Readonly<{
      authorityInputDigest: CanonicalDigest;
      evaluationPlanDigest: CanonicalDigest;
      repositoryCommit: string;
      caseId: string;
      attemptId: string;
      generation: number;
      finalSnapshotRef: string;
      expectedSnapshotDigest: CanonicalDigest;
      expectedRevision: number;
    }>
  ): ActiveEvaluation => {
    const active = activeByAttempt.get(request.attemptId);
    if (
      !active ||
      active.descriptor.planDigest !== request.evaluationPlanDigest ||
      active.descriptor.caseId !== request.caseId ||
      active.descriptor.attemptId !== request.attemptId ||
      input.config.plan.repositoryCommit !== request.repositoryCommit ||
      request.generation < 1 ||
      active.finalSnapshotRef !== request.finalSnapshotRef ||
      digestAgentCanonicalValue(active.finalWorkspace) !==
        request.expectedSnapshotDigest ||
      active.finalWorkspace.workspaceRev !== request.expectedRevision
    ) {
      return fail('active-snapshot-binding');
    }
    if (
      active.authorityInputDigest !== undefined &&
      active.authorityInputDigest !== request.authorityInputDigest
    ) {
      return fail('authority-input-swap');
    }
    (
      active as { authorityInputDigest?: CanonicalDigest }
    ).authorityInputDigest = request.authorityInputDigest;
    activeByAuthorityInput.set(request.authorityInputDigest, active);
    return active;
  };

  const attemptKey = (
    coordinates: VerificationAdapterArtifactAttemptCoordinates
  ): string =>
    `${coordinates.planDigest}\u0000${coordinates.cellId}\u0000${coordinates.attemptId}\u0000${coordinates.generation}`;

  const evidenceAuthority: ProductionControlledWorkspaceG3VerificationEvidenceAuthority =
    Object.freeze({
      artifactSourceAuthorityDigest:
        PRODUCTION_CONTROLLED_WORKSPACE_G3_ARTIFACT_SOURCE_AUTHORITY_DIGEST,
      attestationAuthorityDigest:
        input.attestationAuthority.attestationAuthorityDigest,
      async stageArtifact({ binding, request, signal }) {
        if (
          closed ||
          signal.aborted ||
          request.planDigest !== binding.planDigest ||
          request.generation !== binding.generation ||
          !identityPattern.test(request.artifact.id) ||
          !mediaTypePattern.test(request.artifact.mediaType) ||
          request.artifact.bytes.byteLength > maximumArtifactBytes
        ) {
          return fail('artifact-stage-binding');
        }
        const coordinates = Object.freeze({
          planDigest: request.planDigest,
          cellId: request.cellId,
          attemptId: request.attemptId,
          generation: request.generation,
        });
        if (retiredAttempts.has(attemptKey(coordinates))) {
          return fail('artifact-stage-retired');
        }
        assertProductionAgentEvaluationG3SandboxCanaryClean(
          request.artifact.bytes,
          input.forbiddenCanaries
        );
        const digest = computeVerificationArtifactContentDigest(
          request.artifact.bytes
        ) as CanonicalDigest;
        const stagingArtifactId = `staged:g3:${digest.slice(7)}`;
        const artifact: VerificationAdapterStagedArtifactRef = Object.freeze({
          id: request.artifact.id,
          stagingArtifactId,
          kind: request.artifact.kind,
          digest,
          size: request.artifact.bytes.byteLength,
          mediaType: request.artifact.mediaType,
        });
        const existing = artifacts.get(stagingArtifactId);
        if (existing) {
          if (
            existing.bindingDigest !== binding.bindingDigest ||
            !sameCanonicalJson(existing.coordinates, coordinates) ||
            !sameCanonicalJson(existing.artifact, artifact) ||
            computeVerificationArtifactContentDigest(existing.bytes) !== digest
          ) {
            return fail('artifact-stage-swap');
          }
        } else {
          artifacts.set(
            stagingArtifactId,
            Object.freeze({
              bindingDigest: binding.bindingDigest,
              coordinates,
              artifact,
              bytes: new Uint8Array(request.artifact.bytes),
            })
          );
        }
        return Object.freeze({
          status: 'staged' as const,
          stagingArtifactId,
          digest,
          size: request.artifact.bytes.byteLength,
          mediaType: request.artifact.mediaType,
        });
      },
      async retireArtifacts({ binding, attempt }) {
        if (
          attempt.planDigest !== binding.planDigest ||
          attempt.generation !== binding.generation
        ) {
          return fail('artifact-retirement-binding');
        }
        const key = attemptKey(attempt);
        retiredAttempts.add(key);
        for (const [id, artifact] of artifacts) {
          if (
            artifact.bindingDigest === binding.bindingDigest &&
            sameCanonicalJson(artifact.coordinates, attempt)
          ) {
            artifact.bytes.fill(0);
            artifacts.delete(id);
          }
        }
        return Object.freeze({ status: 'retired' as const, ...attempt });
      },
      async readArtifact({ binding, artifact }) {
        const stored = artifacts.get(artifact.stagingArtifactId);
        if (
          !stored ||
          stored.bindingDigest !== binding.bindingDigest ||
          !sameCanonicalJson(stored.artifact, artifact) ||
          computeVerificationArtifactContentDigest(stored.bytes) !==
            artifact.digest
        ) {
          return fail('artifact-read-binding');
        }
        return new Uint8Array(stored.bytes);
      },
      async complete(completion) {
        const active = activeByAuthorityInput.get(
          completion.binding.authorityInputDigest
        );
        const compiled = active?.compiledByOuterCell.get(
          completion.binding.cellId
        );
        const staged = [...artifacts.values()].find(
          ({ bindingDigest, coordinates, artifact }) =>
            bindingDigest === completion.binding.bindingDigest &&
            coordinates.planDigest === completion.binding.planDigest &&
            coordinates.cellId === completion.binding.cellId &&
            coordinates.attemptId === completion.binding.attemptId &&
            coordinates.generation === completion.binding.generation &&
            artifact.digest === completion.replayArtifactDigest
        );
        if (!active || !compiled || !staged) {
          return fail('completion-binding');
        }
        const sourceTrace = createBrowserVerificationEvidenceSourceTrace({
          scenarioId: compiled.material.scenarioDocumentId,
        });
        const sourceTraceDigest = digestVerificationValue(sourceTrace);
        return Object.freeze({
          timing: Object.freeze({
            startedAt: completion.replay.startedAt,
            completedAt: completion.replay.completedAt,
            durationMs: completion.replay.durationMs,
          }),
          artifacts: Object.freeze([
            Object.freeze({
              id: staged.artifact.id,
              path: `g3/replay/${staged.artifact.digest.slice(7)}.json`,
              sourceTraceDigest,
            }),
          ]),
          sourceTraces: Object.freeze([sourceTrace]),
          dependencyLockDigest: completion.toolchainResult.authorityReceipt
            .toolchain.lockDigest as CanonicalDigest,
          provenance: Object.freeze({
            origin: 'remote' as const,
            producerId: 'producer:prodivix-g3-controlled-workspace',
            providerId: completion.binding.run.providerId,
            issuedAt: completion.replay.startedAt,
          }),
          redaction: Object.freeze({
            policyId: 'redaction:callback-canary-v1',
            scannerSetDigest:
              PRODUCTION_CONTROLLED_WORKSPACE_G3_ARTIFACT_SOURCE_AUTHORITY_DIGEST,
            droppedFieldCounts: Object.freeze({}),
          }),
          scenario: Object.freeze({
            id: compiled.material.outerScenarioId,
            revision: compiled.scenarioDocumentRevision,
            digest: compiled.scenarioContentDigest,
            programDigest: compiled.material.program.programDigest,
          }),
        });
      },
      signAttestation: (request) =>
        input.attestationAuthority.signAttestation(request),
    });

  const sandbox =
    createProductionAgentEvaluationControlledWorkspaceG3SandboxPort({
      repositoryRoot: input.repositoryRoot,
      providerId: 'prodivix.g4.remote.deterministic-replay',
      snapshotSource: Object.freeze({
        authorityDigest:
          PRODUCTION_CONTROLLED_WORKSPACE_G3_SNAPSHOT_SOURCE_AUTHORITY_DIGEST,
        async readFinalWorkspaceSnapshot(request) {
          const active = activeForSnapshot(request);
          const receiptBase = Object.freeze({
            format:
              'prodivix.agent-evaluation-g3-final-workspace-source-receipt',
            version: 1,
            authorityInputDigest: request.authorityInputDigest,
            finalSnapshotRef: request.finalSnapshotRef,
            snapshotDigest: request.expectedSnapshotDigest,
            revision: request.expectedRevision,
            sourceAuthorityDigest:
              PRODUCTION_CONTROLLED_WORKSPACE_G3_SNAPSHOT_SOURCE_AUTHORITY_DIGEST,
          });
          return Object.freeze({
            snapshot: active.finalWorkspace,
            snapshotDigest: request.expectedSnapshotDigest,
            revision: request.expectedRevision,
            sourceReceiptDigest: digestAgentCanonicalValue(receiptBase),
          });
        },
      }),
      verificationSource: Object.freeze({
        authorityDigest:
          PRODUCTION_CONTROLLED_WORKSPACE_G3_VERIFICATION_SOURCE_AUTHORITY_DIGEST,
        async readBrowserRunMaterial(request) {
          const active = activeByAuthorityInput.get(
            request.authorityInputDigest
          );
          if (
            !active ||
            request.evaluationPlanDigest !== active.descriptor.planDigest ||
            request.repositoryCommit !== input.config.plan.repositoryCommit ||
            request.caseId !== active.descriptor.caseId ||
            request.attemptId !== active.descriptor.attemptId ||
            request.finalWorkspaceSnapshotDigest !==
              digestAgentCanonicalValue(active.finalWorkspace) ||
            request.finalRevision !== active.finalWorkspace.workspaceRev
          ) {
            return fail('verification-material-binding');
          }
          const compiled = compileBrowserMaterial(
            active,
            request.outerCell,
            request.executableSnapshotDigest
          );
          const prior = active.compiledByOuterCell.get(request.outerCell.id);
          if (prior && !sameCanonicalJson(prior, compiled)) {
            return fail('verification-material-swap');
          }
          active.compiledByOuterCell.set(request.outerCell.id, compiled);
          return compiled.material;
        },
        async readBrowserVerificationProfile(request) {
          const active = [...activeByAuthorityInput.values()].find(
            (candidate) =>
              candidate.compiledByOuterCell.get(request.cell.id)?.material
                .receiptDigest === request.materialReceiptDigest
          );
          const compiled = active?.compiledByOuterCell.get(request.cell.id);
          if (
            !compiled ||
            !sameCanonicalJson(compiled.material.cell, request.cell)
          ) {
            return fail('browser-profile-binding');
          }
          const profile = profileFor(compiled.material, {
            executableSnapshotDigest: request.executableSnapshotDigest,
            targetLeaseBindingDigest: request.targetLeaseBindingDigest,
          });
          const receiptBase = Object.freeze({
            format: 'prodivix.agent-evaluation-g3-browser-profile-receipt',
            version: 1,
            materialReceiptDigest: request.materialReceiptDigest,
            browserAttemptId: request.browserAttemptId,
            generation: request.generation,
            cellId: request.cell.id,
            executableSnapshotDigest: request.executableSnapshotDigest,
            targetLeaseBindingDigest: request.targetLeaseBindingDigest,
            runtimeEnvironmentDigest: request.runtimeEnvironmentDigest,
            controlCapabilitySnapshotDigest:
              request.controlCapabilitySnapshotDigest,
            appliedControlDigest: request.appliedControlDigest,
            profileDigest: digestVerificationValue(profile),
          });
          return Object.freeze({
            profile,
            receiptDigest: digestAgentCanonicalValue(receiptBase),
          });
        },
      }),
      verificationEvidence: evidenceAuthority,
      previewAuthority: input.previewAuthority,
      browserAuthority: input.browserAuthority,
      now,
    });
  const cellRuntimeAuthority =
    createProductionAgentEvaluationControlledWorkspaceG3CellRuntimeAuthority({
      port: sandbox,
      forbiddenCanaries: input.forbiddenCanaries,
    });

  return Object.freeze({
    async evaluate(
      evaluation: Parameters<
        ProductionControlledWorkspaceTransactionG3Authority['evaluate']
      >[0]
    ): Promise<AgentEvaluationControlledWorkspaceG3Result> {
      if (closed) return fail('closed');
      const descriptor = descriptors.get(evaluation.descriptorDigest);
      if (
        !descriptor ||
        evaluation.namespaceId !== input.namespaceId ||
        evaluation.evaluationPlanDigest !== input.config.plan.planDigest ||
        evaluation.repositoryCommit !== input.config.plan.repositoryCommit ||
        evaluation.caseId !== descriptor.caseId ||
        evaluation.capabilityDescriptorDigest !==
          descriptor.capabilityDescriptorDigest ||
        evaluation.grant.attemptId !== descriptor.attemptId ||
        evaluation.grant.descriptorDigest !== descriptor.descriptorDigest ||
        evaluation.materialDigest !== evaluation.grant.materialDigest ||
        evaluation.isolationPolicyDigest !==
          input.config.controlledRuntime.isolationPolicyDigest ||
        activeByAttempt.has(descriptor.attemptId)
      ) {
        return fail('evaluation-binding');
      }
      return input.materialSource.use(
        { plan: input.config.plan, descriptor },
        async (material) => {
          if (
            material.materialDigest !== evaluation.materialDigest ||
            material.caseId !== evaluation.caseId ||
            !sameCanonicalJson(
              material.invocation.blocks.find(
                (block) => block.kind === 'workspace-fixture'
              )?.fixture,
              evaluation.fixture
            )
          ) {
            return fail('material-binding');
          }
          const active: ActiveEvaluation = {
            descriptor,
            material,
            fixture: evaluation.fixture,
            finalWorkspace: evaluation.finalWorkspace,
            finalSnapshotRef: evaluation.finalSnapshotRef,
            isolationPolicyDigest: evaluation.isolationPolicyDigest,
            compiledByOuterCell: new Map(),
          };
          activeByAttempt.set(descriptor.attemptId, active);
          try {
            const evidenceAuthority =
              createProductionAgentEvaluationControlledWorkspaceG3Authority({
                namespaceId: evaluation.namespaceId,
                evaluationPlanDigest: evaluation.evaluationPlanDigest,
                repositoryCommit: evaluation.repositoryCommit,
                projectId: evaluation.finalWorkspace.id,
                descriptor,
                generation: evaluation.grant.generation,
                controlledWorkspaceGrantDigest: evaluation.grant.grantDigest,
                sandboxPolicyDigest: evaluation.isolationPolicyDigest,
                fixture: evaluation.fixture,
                verificationAttemptGrantIssuer:
                  input.verificationAttemptGrantIssuer,
                cellRuntimeAuthority,
                evidenceBridge: input.evidenceBridge,
                now,
              });
            return await evaluateAgentEvaluationControlledWorkspaceG3({
              evaluationNamespaceId: evaluation.namespaceId,
              evaluationPlanDigest: evaluation.evaluationPlanDigest,
              repositoryCommit: evaluation.repositoryCommit,
              projectId: evaluation.finalWorkspace.id,
              caseId: evaluation.caseId,
              attemptId: descriptor.attemptId,
              descriptorDigest: descriptor.descriptorDigest,
              capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
              controlledWorkspaceGrantDigest: evaluation.grant.grantDigest,
              grantGeneration: evaluation.grant.generation,
              fixture: evaluation.fixture,
              baseWorkspace: evaluation.baseWorkspace,
              finalWorkspace: evaluation.finalWorkspace,
              baseSnapshotRef: evaluation.baseSnapshotRef,
              baseSnapshotDigest: evaluation.grant.baseSnapshotDigest,
              finalSnapshotRef: evaluation.finalSnapshotRef,
              finalSnapshotDigest: digestAgentCanonicalValue(
                evaluation.finalWorkspace
              ),
              operationReceiptDigests: evaluation.operationReceiptDigests,
              commandReceiptDigests: evaluation.commandReceiptDigests,
              transactionReceiptDigests: evaluation.transactionReceiptDigests,
              evidenceAuthority,
            });
          } finally {
            activeByAttempt.delete(descriptor.attemptId);
            if (active.authorityInputDigest) {
              activeByAuthorityInput.delete(active.authorityInputDigest);
            }
            active.compiledByOuterCell.clear();
          }
        }
      );
    },
    close() {
      closePromise ??= (async () => {
        if (activeByAttempt.size > 0 || activeByAuthorityInput.size > 0) {
          return fail('active-evaluation-retirement');
        }
        const sandboxResult = await sandbox.drainAndDispose();
        const [bridgeResult, attestationResult] = await Promise.all([
          input.evidenceBridge.close(),
          input.attestationAuthority.close(),
        ]);
        for (const artifact of artifacts.values()) artifact.bytes.fill(0);
        artifacts.clear();
        retiredAttempts.clear();
        if (
          sandboxResult.status !== 'clean' ||
          sandboxResult.residualCanaryIds.length !== 0
        ) {
          return fail('sandbox-retirement');
        }
        exactClean(bridgeResult, 'verification-bridge');
        exactClean(attestationResult, 'attestation');
        closed = true;
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

const runtimeAuthorityInput = (
  read: AgentEvaluationEnvironmentReader,
  executablePath: string
): ProductionChromiumRuntimeAuthorityInput => {
  const source = readRequired(
    read,
    PRODUCTION_CONTROLLED_WORKSPACE_G3_ENVIRONMENT_NAMES.chromiumRuntimeAuthority,
    maximumRuntimeConfigurationBytes
  );
  const decoded = decodeAgentEvaluationProductionJsonDocument(
    textEncoder.encode(source),
    maximumRuntimeConfigurationBytes
  );
  if (
    decoded.source !== canonicalJsonText(decoded.value) ||
    !exactRecord(decoded.value, [
      'machineClass',
      'operatingSystemImageDigest',
      'browserVersion',
      'fontSetDigest',
      'devicePixelRatio',
      'cacheClass',
      'rendererGeneration',
      'normalizer',
      'browserImageAuthority',
    ])
  ) {
    return fail('chromium-runtime-authority');
  }
  return Object.freeze({
    ...(decoded.value as unknown as Omit<
      ProductionChromiumRuntimeAuthorityInput,
      'executablePath'
    >),
    executablePath,
  });
};

const environmentView = (
  read: AgentEvaluationEnvironmentReader
): Readonly<Record<string, string | undefined>> =>
  new Proxy(Object.create(null) as Record<string, string | undefined>, {
    get: (_target, property) =>
      typeof property === 'string' ? read(property) : undefined,
    set: () => false,
  });

export type CreateEnvironmentProductionControlledWorkspaceTransactionG3AuthorityInput =
  Readonly<{
    environment: AgentEvaluationEnvironmentReader;
    forbiddenCanaries: AgentEvaluationControlledWorkspaceG3ForbiddenCanarySource;
    fetch?: typeof fetch;
    now?: () => string;
  }>;

/**
 * Strict production composition. Every file, browser image, ledger and direct
 * Verification dependency is validated before the authority becomes ready.
 */
export const createEnvironmentProductionControlledWorkspaceTransactionG3Authority =
  async (
    input: CreateEnvironmentProductionControlledWorkspaceTransactionG3AuthorityInput
  ): Promise<ProductionControlledWorkspaceTransactionG3Authority> => {
    const now = input.now ?? (() => new Date().toISOString());
    const repositoryCommit = readRequired(
      input.environment,
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit,
      40
    );
    const namespaceId = readRequired(
      input.environment,
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace,
      256
    );
    if (
      !repositoryCommitPattern.test(repositoryCommit) ||
      !isAgentControlIdentity(namespaceId)
    ) {
      return fail('ledger-scope');
    }
    const runConfigPath = await assertCanonicalAbsolutePath(
      readRequired(
        input.environment,
        AGENT_EVALUATION_RUN_CONFIG_ARTIFACT_ENVIRONMENT_NAMES.path,
        4_096
      ),
      'file'
    );
    const runConfigDocument =
      await createNodeAgentEvaluationCoordinatorFilePort({
        maximumBytes: 16_777_216,
      }).readCanonicalJson!(runConfigPath);
    const config = requireProductionAgentEvaluationFrozenRunConfig(
      decodeAgentEvaluationFrozenRunConfig(runConfigDocument, {
        clock: now,
        expectedRepositoryCommit: repositoryCommit,
      }),
      repositoryCommit
    );
    const repositoryRoot = await assertCanonicalAbsolutePath(
      readRequired(
        input.environment,
        PRODUCTION_CONTROLLED_WORKSPACE_G3_ENVIRONMENT_NAMES.repositoryRoot,
        4_096
      ),
      'directory'
    );
    const chromiumExecutablePath = await assertCanonicalAbsolutePath(
      readRequired(
        input.environment,
        PRODUCTION_CONTROLLED_WORKSPACE_G3_ENVIRONMENT_NAMES.chromiumExecutablePath,
        4_096
      ),
      'file'
    );
    const materialSource = createProductionAgentEvaluationAttemptMaterialSource(
      config,
      environmentView(input.environment)
    );
    let direct:
      | Awaited<
          ReturnType<
            typeof createEnvironmentAgentEvaluationVerificationEvidenceDirectAuthority
          >
        >
      | undefined;
    let bridge: ProductionVerificationEvidenceDirectBridge | undefined;
    let attestation: ProductionG3AttestationAuthority | undefined;
    let preview: ProductionAgentEvaluationBrowserPreviewAuthority | undefined;
    let browser: ProductionChromiumBrowserAuthority | undefined;
    try {
      direct =
        await createEnvironmentAgentEvaluationVerificationEvidenceDirectAuthority(
          {
            environment: input.environment,
            forbiddenCanaries: input.forbiddenCanaries,
            ...(input.fetch ? { fetch: input.fetch } : {}),
          }
        );
      bridge = createProductionVerificationEvidenceDirectBridge({
        authority: direct,
        forbiddenCanaries: input.forbiddenCanaries,
      });
      direct = undefined;
      attestation = createEnvironmentProductionG3AttestationAuthority({
        environment: input.environment,
        now,
      });
      preview = createProductionAgentEvaluationBrowserPreviewAuthority();
      browser = await createProductionChromiumBrowserAuthority({
        runtimeAuthority: runtimeAuthorityInput(
          input.environment,
          chromiumExecutablePath
        ),
        previewHost: preview.port,
        runtimeProvider: createProductionAgentEvaluationRemoteRuntimeProvider(),
        canaryScanner: createProductionAgentEvaluationBrowserCanaryScanner(
          input.forbiddenCanaries
        ),
      });
      const authority =
        createProductionControlledWorkspaceTransactionG3Authority({
          namespaceId,
          config,
          materialSource,
          repositoryRoot,
          previewAuthority: preview,
          browserAuthority: browser,
          evidenceBridge: bridge,
          attestationAuthority: attestation,
          verificationAttemptGrantIssuer:
            createEnvironmentAgentEvaluationVerificationAttemptGrantIssuer({
              evaluationPlanDigest: config.plan.planDigest,
              repositoryCommit,
              environment: input.environment,
              ...(input.fetch ? { fetch: input.fetch } : {}),
              operationTimeoutMs: 170_000,
            }),
          forbiddenCanaries: input.forbiddenCanaries,
          now,
        });
      bridge = undefined;
      attestation = undefined;
      preview = undefined;
      browser = undefined;
      return authority;
    } catch (caught) {
      const cleanup = await Promise.allSettled([
        ...(browser
          ? [browser.drainAndDispose()]
          : preview
            ? [preview.drainAndDispose()]
            : []),
        ...(bridge ? [bridge.close()] : direct ? [direct.close()] : []),
        ...(attestation ? [attestation.close()] : []),
      ]);
      const failures = cleanup.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : []
      );
      if (failures.length > 0) {
        throw new AggregateError(
          [caught, ...failures],
          'G3 production composition and resource retirement both failed.'
        );
      }
      throw caught;
    }
  };
