import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type { ExecutableProjectSnapshot } from '@prodivix/runtime-core';
import {
  createVerificationAdapterRegistrySnapshot,
  digestVerificationValue,
  executeVerificationAdapterLifecycle,
  normalizeVerificationCheckReportCandidate,
  type VerificationAdapterLifecycleResult,
  type VerificationPlan,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  createBrowserVerificationTargetBinding,
  type BrowserVerificationTargetLease,
  type FirstPartyBrowserVerificationAdapterFactory,
} from '@prodivix/verification-browser';
import { createGoldenG3V6ArtifactTransport } from './goldenG3V6ArtifactTransport';
import type {
  GoldenG3V6AttemptProvider,
  GoldenG3V6MatrixRowManifest,
} from './goldenG3V6AdapterMatrixManifest';
import { GOLDEN_G3_V6_ADAPTERS } from './goldenG3V6AdapterRegistryFixture';
import { createGoldenG3V6BrowserAttemptContext } from './goldenG3V6BrowserAttemptContext';
import {
  auditGoldenG3V6RuntimeControlRetirement,
  createGoldenG3V6AttemptCleanupScope,
  throwGoldenG3V6AttemptFailure,
} from './goldenG3V6BrowserAttemptLifecycle';
import { assertGoldenG3V6ReportedPass } from './goldenG3V6BrowserMatrixAssertions';
import {
  GOLDEN_G3_V6_INACTIVE_SIGNAL,
  type GoldenG3V6SecurityAuthorityRegistry,
  type GoldenG3V6TargetLeaseRegistry,
} from './goldenG3V6BrowserMatrixPorts';
import {
  createGoldenG3V6AttemptSecurityAuthority,
  type GoldenG3V6PreparedFramework,
} from './goldenG3V6BrowserMatrixProjects';
import {
  createGoldenG3V6BrowserRuntimeIdentity,
  goldenG3V6ExpectedBrowserVersion,
} from './goldenG3V6BrowserIdentityFixture';
import type {
  GoldenG3V6ProductionSecurityAuthority,
  GoldenG3V6ProductionSecurityResolutionAuditSnapshot,
} from './goldenG3V6ProductionSecurityAuthority';
import {
  issueGoldenG3V6ProductionFixtureAbsenceReceipt,
  type GoldenG3V6ProductionFixtureAbsenceReceipt,
} from './goldenG3V6ProductionFixtureAbsenceReceipt';
import {
  startGoldenG3V6RemotePreviewSession,
  type GoldenG3V6RemotePreviewCleanupEvidence,
  type GoldenG3V6RemotePreviewEvidence,
} from './goldenG3V6RemotePreviewHarness';
import {
  type GoldenG3V6RuntimeControlEvidence,
  type GoldenG3V6RuntimeControlExpectation,
  type GoldenG3V6RuntimeControlRegistry,
} from './goldenG3V6RuntimeControlEvidence';
import {
  createGoldenG3CatalogProgram,
  createGoldenG3ProductionSecurityProgram,
} from './goldenG3ScenarioFixture';

const GENERATION = 1;

export type GoldenG3V6ReportedLifecycleResult = Extract<
  VerificationAdapterLifecycleResult,
  Readonly<{ status: 'reported' }>
>;

const attemptIdFor = (
  cell: VerificationPlanCell,
  provider: GoldenG3V6AttemptProvider
): string =>
  `attempt:g3-v6:${digestVerificationValue({
    cellId: cell.id,
    providerId: provider.providerId,
  }).slice('sha256-'.length)}`;

const providerKind = (
  provider: GoldenG3V6AttemptProvider
): 'browser' | 'remote' | 'export' | 'ci' =>
  provider.mode === 'standalone-export' ? 'export' : provider.mode;

function assertGoldenG3V6ReportedFailure(
  cell: VerificationPlanCell,
  result: VerificationAdapterLifecycleResult,
  program: BehaviorScenarioProgram
): asserts result is GoldenG3V6ReportedLifecycleResult {
  if (
    result.status !== 'reported' ||
    result.cleanup.status !== 'clean' ||
    result.report.terminal.status !== 'completed' ||
    result.report.terminal.exitCode === 0 ||
    result.report.cellId !== cell.id ||
    result.report.checkKind !== 'e2e' ||
    result.report.payload.kind !== 'e2e' ||
    result.report.payload.scenarioId !== program.scenarioId ||
    result.report.payload.steps.length === 0 ||
    !result.report.payload.steps.some(({ status }) => status !== 'passed')
  ) {
    throw new Error(
      `Golden V6 negative attempt for "${cell.id}" did not report an exact clean failed black-box result.`
    );
  }
  const normalized = normalizeVerificationCheckReportCandidate(result.report);
  if (
    normalized.status !== 'ready' ||
    normalized.report.verdict !== 'failed' ||
    normalized.report.outcome !== 'failed'
  ) {
    throw new Error(
      `Golden V6 negative attempt for "${cell.id}" did not normalize to failed.`
    );
  }
}

export type GoldenG3V6BrowserAttempt = Readonly<{
  rowId: GoldenG3V6MatrixRowManifest['id'];
  cellId: string;
  checkKind: VerificationPlanCell['checkKind'];
  providerId: string;
  providerMode: GoldenG3V6AttemptProvider['mode'];
  attemptId: string;
  executableSnapshotDigest: string;
  scenarioProgramDigest: string;
  targetOriginDigest: string;
  runtimeEnvironmentDigest: string;
  result: GoldenG3V6ReportedLifecycleResult;
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  runtimeControlEvidence: GoldenG3V6RuntimeControlEvidence;
  artifactRetirementEvidenceDigest: string;
  remoteEvidence?: GoldenG3V6RemotePreviewEvidence;
  remoteCleanupEvidenceDigest?: string;
  securityBundleEvidenceDigest?: string;
  securityResolutionAudit?: GoldenG3V6ProductionSecurityResolutionAuditSnapshot;
  productionFixtureAbsenceReceipt?: GoldenG3V6ProductionFixtureAbsenceReceipt;
  productionFixtureAbsenceReceiptDigest?: string;
  productionSecurityAuthority?: GoldenG3V6ProductionSecurityAuthority;
}>;

type BrowserAttemptDraft = Readonly<{
  snapshot: ExecutableProjectSnapshot;
  scenarioProgramDigest: string;
  targetOriginDigest: string;
  runtimeEnvironmentDigest: string;
  result: GoldenG3V6ReportedLifecycleResult;
  runtimeControl: GoldenG3V6RuntimeControlExpectation;
  remoteEvidence?: GoldenG3V6RemotePreviewEvidence;
  authority?: GoldenG3V6ProductionSecurityAuthority;
}>;

const retireAttemptArtifacts = async (input: {
  plan: VerificationPlan;
  cell: VerificationPlanCell;
  attemptId: string;
  artifactTransport: ReturnType<typeof createGoldenG3V6ArtifactTransport>;
}): Promise<string> => {
  const coordinates = Object.freeze({
    planDigest: input.plan.planDigest,
    cellId: input.cell.id,
    attemptId: input.attemptId,
    generation: GENERATION,
  });
  const retirement = await input.artifactTransport.retirement.retireAttempt(
    coordinates,
    GOLDEN_G3_V6_INACTIVE_SIGNAL
  );
  if (retirement.status !== 'retired') {
    throw new Error(
      `Golden V6 attempt "${input.attemptId}" did not retire all artifacts.`
    );
  }
  return input.artifactTransport.readRetirementReceipt(coordinates)
    .receiptDigest;
};

export const executeGoldenG3V6BrowserAttempt = async (input: {
  plan: VerificationPlan;
  row: GoldenG3V6MatrixRowManifest;
  cell: VerificationPlanCell;
  provider: GoldenG3V6AttemptProvider;
  framework: GoldenG3V6PreparedFramework;
  factory: FirstPartyBrowserVerificationAdapterFactory;
  leases: GoldenG3V6TargetLeaseRegistry;
  authorities: GoldenG3V6SecurityAuthorityRegistry;
  runtimeControls: GoldenG3V6RuntimeControlRegistry;
  artifactTransport: ReturnType<typeof createGoldenG3V6ArtifactTransport>;
  program?: BehaviorScenarioProgram;
  expectedOutcome?: 'passed' | 'failed';
}): Promise<GoldenG3V6BrowserAttempt> => {
  const attemptId = attemptIdFor(input.cell, input.provider);
  const cleanup = createGoldenG3V6AttemptCleanupScope();
  let artifactRetirementEvidenceDigest: string | undefined;
  cleanup.defer('artifact-retirement', async () => {
    artifactRetirementEvidenceDigest = await retireAttemptArtifacts({
      plan: input.plan,
      cell: input.cell,
      attemptId,
      artifactTransport: input.artifactTransport,
    });
  });

  let draft: BrowserAttemptDraft | undefined;
  let primaryError: unknown;
  let securityResolutionAudit:
    GoldenG3V6ProductionSecurityResolutionAuditSnapshot | undefined;
  let remoteCleanupEvidence: GoldenG3V6RemotePreviewCleanupEvidence | undefined;
  let runtimeControlEvidence: GoldenG3V6RuntimeControlEvidence | undefined;
  try {
    const security = input.cell.checkKind === 'security';
    const snapshot = security
      ? input.framework.productionSnapshot
      : input.framework.testSnapshot;
    const project = security
      ? input.framework.productionProject
      : input.framework.testProject;
    const toolchain = project.toolchain;
    if (!toolchain || !input.cell.browserEngine) {
      throw new Error(
        `Golden V6 browser cell "${input.cell.id}" is incomplete.`
      );
    }
    if (security && !input.framework.productionFixtureAbsenceReceipt) {
      throw new Error(
        `Golden V6 security cell "${input.cell.id}" has no Compiler production fixture-absence authority.`
      );
    }

    const remoteSession =
      input.provider.mode === 'remote'
        ? await startGoldenG3V6RemotePreviewSession({
            attemptId,
            snapshot,
            buildBundle: toolchain.buildBundle,
            excludedOrigins: Object.freeze([
              input.framework.testProject.origin,
              input.framework.productionProject.origin,
            ]),
          })
        : undefined;
    if (remoteSession) {
      cleanup.defer('remote-preview', async () => {
        remoteCleanupEvidence = await remoteSession.cleanup();
      });
      if (!remoteSession.isActive()) {
        throw new Error('Golden V6 Remote Preview origin is not active.');
      }
    }
    const origin = remoteSession?.origin ?? project.origin;
    const runtimeIdentity = createGoldenG3V6BrowserRuntimeIdentity(input.cell);
    if (
      runtimeIdentity.browserVersion !==
      goldenG3V6ExpectedBrowserVersion(input.cell.browserEngine)
    ) {
      throw new Error('Golden V6 expected browser version drifted.');
    }
    const targetBinding = createBrowserVerificationTargetBinding({
      origin,
      attemptId,
      generation: GENERATION,
      executableSnapshotDigest: snapshot.contentDigest,
      cell: input.cell,
      runtimeIdentity,
    });

    let authority: GoldenG3V6ProductionSecurityAuthority | undefined;
    if (security) {
      authority = await createGoldenG3V6AttemptSecurityAuthority({
        cell: input.cell,
        attemptId,
        generation: GENERATION,
        snapshot,
        forbiddenFixtureSourceSnapshot: input.framework.testSnapshot,
        productionFixtureAbsenceReceipt:
          input.framework.productionFixtureAbsenceReceipt!,
        bundle: toolchain.buildBundle,
        origin,
        targetBinding,
      });
      input.authorities.register(attemptId, authority);
      cleanup.defer('security-authority-delete', () => {
        input.authorities.forceDelete(attemptId);
      });
      cleanup.defer('security-authority-audit', () => {
        securityResolutionAudit = input.authorities.assertExact(attemptId);
      });
    }

    const lease: BrowserVerificationTargetLease = Object.freeze({
      leaseId: `lease:${attemptId.slice('attempt:g3-v6:'.length)}`,
      origin,
      binding: targetBinding.binding,
      bindingDigest: targetBinding.bindingDigest,
      runtimeIdentity,
    });
    input.leases.register(lease);
    cleanup.defer('target-lease-delete', () => {
      input.leases.forceDelete(attemptId);
    });
    cleanup.defer('target-lease-audit', () => {
      input.leases.assertReleased(attemptId);
    });

    const program =
      input.program ??
      (security
        ? createGoldenG3ProductionSecurityProgram(snapshot.contentDigest)
        : createGoldenG3CatalogProgram(snapshot.contentDigest));
    const runtimeControlRegistration = await input.runtimeControls.register({
      cell: input.cell,
      providerKind: providerKind(input.provider),
      attemptId,
      generation: GENERATION,
      program,
      targetLease: lease,
      snapshot,
      buildBundle: toolchain.buildBundle,
      ...(security
        ? { productionSecurityAuthority: authority! }
        : {
            fixtureProjectionReceipt:
              input.framework.testFixtureProjectionReceipt,
          }),
      ...(remoteSession ? { remoteEvidence: remoteSession.evidence } : {}),
    });
    cleanup.defer('runtime-control-release-audit', () => {
      runtimeControlEvidence = auditGoldenG3V6RuntimeControlRetirement({
        attemptId,
        retiredEvidence: runtimeControlEvidence,
        assertReleased: runtimeControlRegistration.assertReleased,
        snapshot: input.runtimeControls.snapshot,
      });
    });
    cleanup.defer('runtime-control-retirement', async () => {
      runtimeControlEvidence =
        await input.runtimeControls.forceRetire(attemptId);
    });
    const runtimeControl = runtimeControlRegistration.expectation;
    const contextMaterial = createGoldenG3V6BrowserAttemptContext({
      cell: input.cell,
      snapshot,
      program,
      runtimeIdentity,
      targetBinding,
      origin,
      runtimeControl,
      attemptId,
      artifactStaging: input.artifactTransport.staging,
      ...(authority ? { securityAuthority: authority } : {}),
    });
    const result = await executeVerificationAdapterLifecycle({
      factory: input.factory,
      registrySnapshot: createVerificationAdapterRegistrySnapshot(
        GOLDEN_G3_V6_ADAPTERS
      ),
      planDigest: input.plan.planDigest,
      cell: input.cell,
      attemptId,
      generation: GENERATION,
      providerKind: providerKind(input.provider),
      context: contextMaterial.context,
      artifactRetirement: input.artifactTransport.retirement,
    });
    if ((input.expectedOutcome ?? 'passed') === 'passed') {
      assertGoldenG3V6ReportedPass(
        input.cell,
        result,
        contextMaterial.profile,
        program
      );
    } else {
      assertGoldenG3V6ReportedFailure(input.cell, result, program);
    }
    draft = Object.freeze({
      snapshot,
      scenarioProgramDigest: program.programDigest,
      targetOriginDigest: targetBinding.binding.originDigest,
      runtimeEnvironmentDigest: targetBinding.runtimeEnvironmentDigest,
      result,
      runtimeControl,
      ...(remoteSession ? { remoteEvidence: remoteSession.evidence } : {}),
      ...(authority ? { authority } : {}),
    });
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = await cleanup.runAll();
  throwGoldenG3V6AttemptFailure(attemptId, primaryError, cleanupErrors);
  if (!draft) {
    throw new Error(`Golden V6 attempt "${attemptId}" produced no evidence.`);
  }
  if (draft.authority !== undefined && securityResolutionAudit === undefined) {
    throw new Error(
      `Golden V6 security attempt "${attemptId}" has no exact owner audit.`
    );
  }
  if (
    draft.remoteEvidence !== undefined &&
    remoteCleanupEvidence === undefined
  ) {
    throw new Error(
      `Golden V6 Remote attempt "${attemptId}" has no cleanup evidence.`
    );
  }
  if (!runtimeControlEvidence) {
    throw new Error(
      `Golden V6 attempt "${attemptId}" has no released runtime-control evidence.`
    );
  }
  if (!artifactRetirementEvidenceDigest) {
    throw new Error(
      `Golden V6 attempt "${attemptId}" has no artifact retirement evidence.`
    );
  }
  if (
    runtimeControlEvidence.controlCapabilitySnapshotDigest !==
      draft.runtimeControl.controlCapabilitySnapshotDigest ||
    runtimeControlEvidence.appliedControlDigest !==
      draft.runtimeControl.appliedControlDigest ||
    runtimeControlEvidence.resourceManifestDigest !==
      draft.runtimeControl.resourceManifestDigest ||
    runtimeControlEvidence.fixtureBindingDigest !==
      draft.runtimeControl.fixtureBindingDigest ||
    runtimeControlEvidence.fixtureProjectionAuthorityDigest !==
      draft.runtimeControl.fixtureProjectionAuthorityDigest ||
    runtimeControlEvidence.remoteBindingDigest !==
      draft.runtimeControl.remoteBindingDigest ||
    runtimeControlEvidence.executableSnapshotDigest !==
      draft.snapshot.contentDigest ||
    runtimeControlEvidence.originDigest !== draft.targetOriginDigest
  ) {
    throw new Error(
      `Golden V6 attempt "${attemptId}" runtime-control terminal evidence drifted from its registration.`
    );
  }
  const productionFixtureAbsenceReceipt =
    draft.authority && securityResolutionAudit
      ? issueGoldenG3V6ProductionFixtureAbsenceReceipt(
          draft.authority,
          securityResolutionAudit
        )
      : undefined;
  return Object.freeze({
    rowId: input.row.id,
    cellId: input.cell.id,
    checkKind: input.cell.checkKind,
    providerId: input.provider.providerId,
    providerMode: input.provider.mode,
    attemptId,
    executableSnapshotDigest: draft.snapshot.contentDigest,
    scenarioProgramDigest: draft.scenarioProgramDigest,
    targetOriginDigest: draft.targetOriginDigest,
    runtimeEnvironmentDigest: draft.runtimeEnvironmentDigest,
    result: draft.result,
    controlCapabilitySnapshotDigest:
      draft.runtimeControl.controlCapabilitySnapshotDigest,
    appliedControlDigest: draft.runtimeControl.appliedControlDigest,
    runtimeControlEvidence,
    artifactRetirementEvidenceDigest,
    ...(draft.remoteEvidence
      ? {
          remoteEvidence: draft.remoteEvidence,
          remoteCleanupEvidenceDigest: digestVerificationValue(
            remoteCleanupEvidence!
          ),
        }
      : {}),
    ...(draft.authority
      ? {
          securityBundleEvidenceDigest: digestVerificationValue(
            draft.authority.evidence
          ),
          securityResolutionAudit,
          productionFixtureAbsenceReceipt,
          productionFixtureAbsenceReceiptDigest:
            productionFixtureAbsenceReceipt!.receiptDigest,
          productionSecurityAuthority: draft.authority,
        }
      : {}),
  });
};
