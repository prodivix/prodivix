import {
  projectExecutableProjectRuntimeFiles,
  type ExecutableProjectFile,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { assertCompilerDiagnosticTestExtensionReceipt } from './diagnosticTestExtensionReceipt';
import {
  COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
  assertCompilerFixtureProjectionReceipt,
} from './fixtureProjectionReceipt';
import {
  canonicalExecutableProjectSnapshot,
  compilerBytes,
  digestCompilerBytes,
  digestCompilerValue,
} from './executableProjectSnapshotCanonical';
import {
  areCompilerProductionDiagnosticCanariesPublic,
  compilerProductionFixedAbsenceMarkers,
  createCompilerProductionFixtureAbsenceMarkers,
} from './productionFixtureAbsenceMarkers';
import {
  compilerProductionBuildFileBindings,
  compilerProductionBundleScanFiles,
  compilerProductionSourceScanFiles,
  normalizeCompilerProductionBuildBundle,
  scanCompilerProductionFixtureAbsenceFiles,
} from './productionFixtureAbsenceScanner';
import {
  COMPILER_PRODUCTION_FIXTURE_ABSENCE_OWNER,
  COMPILER_PRODUCTION_FIXTURE_ABSENCE_RECEIPT_FORMAT,
  CompilerProductionFixtureAbsenceError,
  type CompilerProductionFixtureAbsenceReceipt,
  type IssueCompilerProductionFixtureAbsenceReceiptInput,
} from './productionFixtureAbsenceReceipt.types';

export {
  COMPILER_PRODUCTION_FIXTURE_ABSENCE_BUNDLE_ENVELOPE_PATH,
  encodeCompilerProductionBuildBundle,
} from './productionFixtureAbsenceScanner';

const assertFixtureAuthority = (
  production: ExecutableProjectSnapshot,
  input: IssueCompilerProductionFixtureAbsenceReceiptInput
): void => {
  const fixture = input.forbiddenFixtureAuthority;
  const diagnostic = fixture.diagnosticTestExtension;
  assertCompilerDiagnosticTestExtensionReceipt(
    diagnostic.receipt,
    diagnostic.baseSnapshot,
    diagnostic.extendedSnapshot
  );
  assertCompilerFixtureProjectionReceipt(fixture.receipt, fixture);
  if (
    !sameCanonicalJson(production.workspace, fixture.snapshot.workspace) ||
    !sameCanonicalJson(production.target, fixture.snapshot.target) ||
    production.contentDigest === fixture.snapshot.contentDigest ||
    fixture.receipt.snapshotDigest !== fixture.snapshot.contentDigest ||
    fixture.receipt.authSessionTransport === null ||
    diagnostic.canaryValues.length === 0 ||
    !areCompilerProductionDiagnosticCanariesPublic(diagnostic.canaryValues) ||
    diagnostic.canaryValues.some(
      (canary) =>
        !diagnostic.receipt.files.some((binding) => {
          const file = diagnostic.extendedSnapshot.files.find(
            ({ path }) => path === binding.path
          );
          return (
            file &&
            typeof file.contents === 'string' &&
            file.contents.includes(canary)
          );
        })
    ) ||
    diagnostic.extendedSnapshot.files.some((file) => {
      const projected = fixture.snapshot.files.find(
        ({ path }) => path === file.path
      );
      return !projected || !sameCanonicalJson(projected, file);
    })
  ) {
    throw new CompilerProductionFixtureAbsenceError(
      'Forbidden fixture authority does not bind the exact diagnostic extension, auth transport, and projected test snapshot.'
    );
  }
};

const assertProductionSnapshot = (
  input: IssueCompilerProductionFixtureAbsenceReceiptInput
): Readonly<{
  snapshot: ExecutableProjectSnapshot;
  generatedFiles: readonly ExecutableProjectFile[];
}> => {
  const snapshot = canonicalExecutableProjectSnapshot(
    input.productionSnapshot,
    'Production fixture-absence snapshot'
  );
  const expectedGeneratedFiles = projectExecutableProjectRuntimeFiles(
    snapshot,
    'build'
  );
  if (
    snapshot.dataMockProvision !== undefined ||
    snapshot.serverRuntimeMockProvision !== undefined ||
    snapshot.entrypoints.some(({ kind }) => kind === 'test') ||
    snapshot.files.some(
      ({ path }) => path === COMPILER_FIXTURE_PROJECTION_SOURCE_PATH
    ) ||
    !sameCanonicalJson(input.productionGeneratedFiles, expectedGeneratedFiles)
  ) {
    throw new CompilerProductionFixtureAbsenceError(
      'Production snapshot retains fixture/test authority or its generated build file set drifted.'
    );
  }
  return Object.freeze({
    snapshot,
    generatedFiles: Object.freeze([...expectedGeneratedFiles]),
  });
};

export const issueCompilerProductionFixtureAbsenceReceipt = (
  input: IssueCompilerProductionFixtureAbsenceReceiptInput
): CompilerProductionFixtureAbsenceReceipt => {
  const production = assertProductionSnapshot(input);
  assertFixtureAuthority(production.snapshot, input);
  const normalized = normalizeCompilerProductionBuildBundle(
    production.snapshot,
    input.productionBuildBundle
  );
  const markers = createCompilerProductionFixtureAbsenceMarkers(input);
  const snapshotFiles = compilerProductionSourceScanFiles(
    production.snapshot.files
  );
  const generatedFiles = compilerProductionSourceScanFiles(
    production.generatedFiles
  );
  const viteDistFiles = compilerProductionBundleScanFiles(
    normalized.bundle,
    normalized.bytes
  );
  const generatedFileBindings = Object.freeze(
    generatedFiles.map(({ binding }) => binding)
  );
  const buildBindings = compilerProductionBuildFileBindings(normalized.bundle);
  const markerSetDigest = digestCompilerValue(markers);
  const withoutDigest = Object.freeze({
    format: COMPILER_PRODUCTION_FIXTURE_ABSENCE_RECEIPT_FORMAT,
    owner: COMPILER_PRODUCTION_FIXTURE_ABSENCE_OWNER,
    productionSnapshotDigest: production.snapshot.contentDigest,
    target: production.snapshot.target,
    generatedFiles: Object.freeze({
      manifestDigest: digestCompilerValue(generatedFileBindings),
      files: generatedFileBindings,
    }),
    buildBundle: Object.freeze({
      bundleDigest: digestCompilerBytes(normalized.bytes),
      fileSetDigest: digestCompilerValue(buildBindings),
      files: buildBindings,
    }),
    forbiddenAuthority: Object.freeze({
      fixtureSnapshotDigest:
        input.forbiddenFixtureAuthority.snapshot.contentDigest,
      fixtureProjectionReceiptDigest:
        input.forbiddenFixtureAuthority.receipt.receiptDigest,
      diagnosticTestExtensionReceiptDigest:
        input.forbiddenFixtureAuthority.diagnosticTestExtension.receipt
          .receiptDigest,
      diagnosticTestEntrypoints: Object.freeze(
        input.forbiddenFixtureAuthority.diagnosticTestExtension.receipt.entrypoints.map(
          ({ path }) => path
        )
      ),
      diagnosticCanaryDigests: Object.freeze(
        input.forbiddenFixtureAuthority.diagnosticTestExtension.canaryValues.map(
          (value) => digestCompilerBytes(compilerBytes(value))
        )
      ),
      markerSetDigest,
    }),
    forbiddenMarkers: markers,
    scans: Object.freeze({
      snapshotFiles: scanCompilerProductionFixtureAbsenceFiles(
        'snapshot-files',
        snapshotFiles,
        markers
      ),
      generatedBuildFiles: scanCompilerProductionFixtureAbsenceFiles(
        'generated-build-files',
        generatedFiles,
        markers
      ),
      viteDistBundle: scanCompilerProductionFixtureAbsenceFiles(
        'vite-dist-bundle',
        viteDistFiles,
        markers
      ),
    }),
  });
  return Object.freeze({
    ...withoutDigest,
    receiptDigest: digestCompilerValue(withoutDigest),
  });
};

const assertReceiptSelfConsistency = (
  receipt: CompilerProductionFixtureAbsenceReceipt
): void => {
  const { receiptDigest, ...withoutDigest } = receipt;
  if (
    receipt.format !== COMPILER_PRODUCTION_FIXTURE_ABSENCE_RECEIPT_FORMAT ||
    receipt.owner !== COMPILER_PRODUCTION_FIXTURE_ABSENCE_OWNER ||
    receiptDigest !== digestCompilerValue(withoutDigest) ||
    receipt.forbiddenAuthority.markerSetDigest !==
      digestCompilerValue(receipt.forbiddenMarkers) ||
    receipt.forbiddenMarkers.some(
      ({ value, digest }) =>
        digest !== digestCompilerBytes(compilerBytes(value))
    ) ||
    compilerProductionFixedAbsenceMarkers().some(({ id, value }) =>
      receipt.forbiddenMarkers.every(
        (marker) => marker.id !== id || marker.value !== value
      )
    )
  ) {
    throw new CompilerProductionFixtureAbsenceError(
      'Production fixture-absence receipt identity or required marker set drifted.'
    );
  }
};

export const assertCompilerProductionFixtureAbsenceBuildBundle = (
  receipt: CompilerProductionFixtureAbsenceReceipt,
  bundle: ExecutionBuildBundle
): void => {
  assertReceiptSelfConsistency(receipt);
  const normalized = normalizeCompilerProductionBuildBundle(
    {
      contentDigest: receipt.productionSnapshotDigest,
      target: receipt.target,
    },
    bundle
  );
  const bindings = compilerProductionBuildFileBindings(normalized.bundle);
  const scan = scanCompilerProductionFixtureAbsenceFiles(
    'vite-dist-bundle',
    compilerProductionBundleScanFiles(normalized.bundle, normalized.bytes),
    receipt.forbiddenMarkers
  );
  if (
    receipt.buildBundle.bundleDigest !==
      digestCompilerBytes(normalized.bytes) ||
    receipt.buildBundle.fileSetDigest !== digestCompilerValue(bindings) ||
    !sameCanonicalJson(receipt.buildBundle.files, bindings) ||
    !sameCanonicalJson(receipt.scans.viteDistBundle, scan)
  ) {
    throw new CompilerProductionFixtureAbsenceError(
      'Production fixture-absence receipt does not bind the exact Vite dist bundle.'
    );
  }
};

export const assertCompilerProductionFixtureAbsenceReceipt = (
  receipt: CompilerProductionFixtureAbsenceReceipt,
  input: IssueCompilerProductionFixtureAbsenceReceiptInput
): void => {
  const expected = issueCompilerProductionFixtureAbsenceReceipt(input);
  if (!sameCanonicalJson(receipt, expected)) {
    throw new CompilerProductionFixtureAbsenceError(
      'Production fixture-absence receipt does not match its exact production and forbidden-authority inputs.'
    );
  }
};
