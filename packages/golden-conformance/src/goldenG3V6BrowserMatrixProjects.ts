import {
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import { BEHAVIOR_DETERMINISTIC_CONTROL_PRESET } from '@prodivix/behavior';
import {
  issueCompilerProductionFixtureAbsenceReceipt,
  issueWorkspaceDiagnosticProjectionReceipt,
  issueCompilerFixtureProjectionReceipt,
  type CompilerFixtureProjectionReceipt,
  type CompilerProductionFixtureAbsenceReceipt,
  type IssueWorkspaceDiagnosticProjectionReceiptInput,
  type WorkspaceDiagnosticProjectionReceipt,
} from '@prodivix/prodivix-compiler';
import type { VerificationPlanCell } from '@prodivix/verification';
import {
  digestBrowserVerificationBytes,
  type BrowserVerificationTargetBinding,
} from '@prodivix/verification-browser';
import {
  prepareGoldenBrowserProject,
  type GoldenPreparedBrowserProject,
} from './generatedProjectHarness';
import {
  GOLDEN_G3_V6_INTEGRATION_CASE_NAME,
  createGoldenG3V6ExecutableSnapshotAuthority,
} from './goldenG3V6ExecutableSnapshot';
import {
  assertGoldenG3V6ProductionSecurityAuthorityClean,
  createGoldenG3V6ProductionSecurityAuthority,
  digestGoldenG3V6ProductionBuildBundle,
  type GoldenG3V6ProductionSecurityAuthority,
} from './goldenG3V6ProductionSecurityAuthority';
import {
  GOLDEN_G3_LOGIN_FIXTURE_SET,
  GOLDEN_G3_CATALOG_WORKSPACE,
  createGoldenG3V6ReactCompilerTarget,
  createGoldenG3V6ReactCatalogSnapshot,
  createGoldenG3V6ReactProductionSnapshot,
  createGoldenG3V6VueCompilerTarget,
  createGoldenG3V6VueCatalogSnapshot,
  createGoldenG3V6VueProductionSnapshot,
} from './goldenG3ScenarioFixture';

export type GoldenG3V6FrameworkTarget = 'react-vite' | 'vue-vite';

export type GoldenG3V6PreparedDiagnosticProjection = Readonly<{
  input: IssueWorkspaceDiagnosticProjectionReceiptInput;
  receipt: WorkspaceDiagnosticProjectionReceipt;
}>;

export type GoldenG3V6PreparedFramework = Readonly<{
  testSnapshot: ExecutableProjectSnapshot;
  testProject: GoldenPreparedBrowserProject;
  testFixtureProjectionReceipt: CompilerFixtureProjectionReceipt;
  testDiagnosticProjection?: GoldenG3V6PreparedDiagnosticProjection;
  productionSnapshot: ExecutableProjectSnapshot;
  productionProject: GoldenPreparedBrowserProject;
  productionFixtureAbsenceReceipt?: CompilerProductionFixtureAbsenceReceipt;
}>;

export type GoldenG3V6PreparedFrameworks = Readonly<
  Record<GoldenG3V6FrameworkTarget, GoldenG3V6PreparedFramework>
>;

const verifyServedBuildBundle = async (
  origin: string,
  bundle: ExecutionBuildBundle
): Promise<string> => {
  for (const file of bundle.files) {
    const path = file.path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const response = await fetch(`${origin}/${path}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (
      !response.ok ||
      bytes.byteLength !== file.size ||
      digestBrowserVerificationBytes(bytes) !== file.digest
    ) {
      throw new Error(
        `Golden V6 served production file "${file.path}" drifted from the exact Vite dist.`
      );
    }
  }
  return digestGoldenG3V6ProductionBuildBundle(bundle);
};

export const createGoldenG3V6AttemptSecurityAuthority = async (input: {
  cell: VerificationPlanCell;
  attemptId: string;
  generation: number;
  snapshot: ExecutableProjectSnapshot;
  forbiddenFixtureSourceSnapshot: ExecutableProjectSnapshot;
  productionFixtureAbsenceReceipt: CompilerProductionFixtureAbsenceReceipt;
  bundle: ExecutionBuildBundle;
  origin: string;
  targetBinding: Readonly<{
    binding: BrowserVerificationTargetBinding;
    bindingDigest: string;
    runtimeEnvironmentDigest: string;
  }>;
}): Promise<GoldenG3V6ProductionSecurityAuthority> => {
  const servedBundleDigest = await verifyServedBuildBundle(
    input.origin,
    input.bundle
  );
  const authority = createGoldenG3V6ProductionSecurityAuthority({
    productionSnapshot: input.snapshot,
    forbiddenFixtureSourceSnapshot: input.forbiddenFixtureSourceSnapshot,
    productionFixtureAbsenceReceipt: input.productionFixtureAbsenceReceipt,
    buildBundle: input.bundle,
    servedBundleDigest,
    origin: input.origin,
    targetBinding: input.targetBinding.binding,
    targetBindingDigest: input.targetBinding.bindingDigest,
    observationBinding: Object.freeze({
      cellId: input.cell.id,
      attemptId: input.attemptId,
      generation: input.generation,
      executableSnapshotDigest: input.snapshot.contentDigest,
      runtimeEnvironmentDigest: input.targetBinding.runtimeEnvironmentDigest,
      controlProfileDigest: input.cell.controlProfileRef.digest!,
    }),
    inputId: `input:security:${input.attemptId.slice('attempt:g3-v6:'.length)}`,
  });
  assertGoldenG3V6ProductionSecurityAuthorityClean(authority);
  if (
    authority.evidence.servedBundleDigest !==
      authority.evidence.scannedBundleDigest ||
    authority.evidence.scannedBundleDigest !==
      authority.evidence.materializedBundleDigest ||
    authority.evidence.targetBindingDigest !== input.targetBinding.bindingDigest
  ) {
    throw new Error(
      'Golden V6 production security did not scan the exact served/materialized Vite dist.'
    );
  }
  return authority;
};

const prepareGoldenG3V6Framework = async (
  framework: GoldenG3V6FrameworkTarget
): Promise<GoldenG3V6PreparedFramework> => {
  const testBase =
    framework === 'react-vite'
      ? createGoldenG3V6ReactCatalogSnapshot()
      : createGoldenG3V6VueCatalogSnapshot();
  const testAuthority = createGoldenG3V6ExecutableSnapshotAuthority(testBase);
  const testSnapshot = testAuthority.snapshot;
  const productionSnapshot =
    framework === 'react-vite'
      ? createGoldenG3V6ReactProductionSnapshot()
      : createGoldenG3V6VueProductionSnapshot();
  const prepared: GoldenPreparedBrowserProject[] = [];
  try {
    prepared.push(
      await prepareGoldenBrowserProject(
        {
          files: projectExecutableProjectRuntimeFiles(testSnapshot, 'test'),
        },
        { executableSnapshot: testSnapshot }
      )
    );
    prepared.push(
      await prepareGoldenBrowserProject(
        {
          files: projectExecutableProjectRuntimeFiles(
            productionSnapshot,
            'build'
          ),
        },
        { executableSnapshot: productionSnapshot }
      )
    );
  } catch (error) {
    const cleanup = await Promise.allSettled(
      prepared.map((project) => project.dispose())
    );
    const cleanupErrors = cleanup.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : []
    );
    if (cleanupErrors.length === 0) {
      throw error;
    }
    throw new AggregateError(
      [error, ...cleanupErrors],
      `Golden V6 ${framework} project preparation failed.`
    );
  }
  const [testProject, productionProject] = prepared;
  if (!testProject || !productionProject) {
    throw new Error(
      `Golden V6 ${framework} project preparation was incomplete.`
    );
  }
  if (!testProject.toolchain || !productionProject.toolchain) {
    const cleanup = await Promise.allSettled([
      testProject.dispose(),
      productionProject.dispose(),
    ]);
    throw new AggregateError(
      [
        new Error(
          `Golden V6 ${framework} projects did not expose actual toolchain evidence.`
        ),
        ...cleanup.flatMap((result) =>
          result.status === 'rejected' ? [result.reason] : []
        ),
      ],
      `Golden V6 ${framework} project preparation was incomplete.`
    );
  }
  const testFixtureProjectionReceipt = issueCompilerFixtureProjectionReceipt({
    snapshot: testSnapshot,
    fixtureSets: Object.freeze([GOLDEN_G3_LOGIN_FIXTURE_SET]),
    controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
    generatedFiles: projectExecutableProjectRuntimeFiles(testSnapshot, 'test'),
    buildBundle: testProject.toolchain.buildBundle,
  });
  const testDiagnosticProjectionInput =
    Object.freeze<IssueWorkspaceDiagnosticProjectionReceiptInput>({
      workspace: GOLDEN_G3_CATALOG_WORKSPACE,
      snapshot: testSnapshot,
      compiler:
        framework === 'react-vite'
          ? createGoldenG3V6ReactCompilerTarget()
          : createGoldenG3V6VueCompilerTarget(),
      testExtensionReceipts: Object.freeze([
        testAuthority.testExtensionReceipt,
      ]),
      fixtureProjectionAuthority: Object.freeze({
        fixtureSets: Object.freeze([GOLDEN_G3_LOGIN_FIXTURE_SET]),
        controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
        generatedFiles: projectExecutableProjectRuntimeFiles(
          testSnapshot,
          'test'
        ),
        buildBundle: testProject.toolchain.buildBundle,
        receipt: testFixtureProjectionReceipt,
      }),
    });
  const testDiagnosticProjection = Object.freeze({
    input: testDiagnosticProjectionInput,
    receipt: issueWorkspaceDiagnosticProjectionReceipt(
      testDiagnosticProjectionInput
    ),
  });
  const productionFixtureAbsenceReceipt =
    issueCompilerProductionFixtureAbsenceReceipt({
      productionSnapshot,
      productionGeneratedFiles: projectExecutableProjectRuntimeFiles(
        productionSnapshot,
        'build'
      ),
      productionBuildBundle: productionProject.toolchain.buildBundle,
      forbiddenFixtureAuthority: Object.freeze({
        snapshot: testSnapshot,
        fixtureSets: Object.freeze([GOLDEN_G3_LOGIN_FIXTURE_SET]),
        controlProfile: BEHAVIOR_DETERMINISTIC_CONTROL_PRESET,
        generatedFiles: projectExecutableProjectRuntimeFiles(
          testSnapshot,
          'test'
        ),
        buildBundle: testProject.toolchain.buildBundle,
        receipt: testFixtureProjectionReceipt,
        diagnosticTestExtension: Object.freeze({
          baseSnapshot: testBase,
          extendedSnapshot: testAuthority.diagnosticSnapshot,
          receipt: testAuthority.testExtensionReceipt,
          canaryValues: Object.freeze([GOLDEN_G3_V6_INTEGRATION_CASE_NAME]),
        }),
      }),
    });
  return Object.freeze({
    testSnapshot,
    testProject,
    testFixtureProjectionReceipt,
    testDiagnosticProjection,
    productionSnapshot,
    productionProject,
    productionFixtureAbsenceReceipt,
  });
};

export const prepareGoldenG3V6Frameworks =
  async (): Promise<GoldenG3V6PreparedFrameworks> => {
    let react: GoldenG3V6PreparedFramework | undefined;
    try {
      react = await prepareGoldenG3V6Framework('react-vite');
      const vue = await prepareGoldenG3V6Framework('vue-vite');
      return Object.freeze({
        'react-vite': react,
        'vue-vite': vue,
      });
    } catch (error) {
      const cleanup = react
        ? await Promise.allSettled([disposeGoldenG3V6Framework(react)])
        : [];
      const cleanupErrors = cleanup.flatMap((result) =>
        result.status === 'rejected' ? [result.reason] : []
      );
      if (cleanupErrors.length === 0) {
        throw error;
      }
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Golden V6 framework preparation failed.'
      );
    }
  };

const disposeGoldenG3V6Framework = async (
  framework: GoldenG3V6PreparedFramework
): Promise<void> => {
  const results = await Promise.allSettled([
    framework.testProject.dispose(),
    framework.productionProject.dispose(),
  ]);
  const errors = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  );
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Golden V6 framework disposal failed.');
  }
};

export const disposeGoldenG3V6Frameworks = async (
  frameworks: GoldenG3V6PreparedFrameworks
): Promise<void> => {
  const results = await Promise.allSettled(
    Object.values(frameworks).map(disposeGoldenG3V6Framework)
  );
  const errors = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  );
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      'Golden V6 prepared-framework disposal failed.'
    );
  }
};

export const goldenG3V6FrameworkForCell = (
  cell: VerificationPlanCell,
  frameworks: GoldenG3V6PreparedFrameworks
): GoldenG3V6PreparedFramework => {
  if (
    cell.frameworkTarget !== 'react-vite' &&
    cell.frameworkTarget !== 'vue-vite'
  ) {
    throw new Error(
      `Golden V6 cell "${cell.id}" has unsupported framework "${cell.frameworkTarget}".`
    );
  }
  return frameworks[cell.frameworkTarget];
};
