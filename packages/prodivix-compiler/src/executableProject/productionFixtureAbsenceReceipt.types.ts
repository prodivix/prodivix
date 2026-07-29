import type {
  ExecutableProjectFile,
  ExecutableProjectSnapshot,
  ExecutableProjectTarget,
  ExecutionBuildBundle,
} from '@prodivix/runtime-core';
import type { CompilerDiagnosticTestExtensionReceipt } from './diagnosticTestExtensionReceipt';
import type {
  CompilerFixtureProjectionReceipt,
  IssueCompilerFixtureProjectionReceiptInput,
} from './fixtureProjectionReceipt';

export const COMPILER_PRODUCTION_FIXTURE_ABSENCE_RECEIPT_FORMAT =
  'prodivix.compiler-production-fixture-absence-receipt.v1' as const;
export const COMPILER_PRODUCTION_FIXTURE_ABSENCE_OWNER =
  '@prodivix/prodivix-compiler' as const;

export type CompilerProductionFixtureAbsenceMarker = Readonly<{
  id: string;
  value: string;
  digest: string;
}>;

export type CompilerProductionFixtureAbsenceFileBinding = Readonly<{
  path: string;
  size: number;
  digest: string;
  sourceTraceDigest?: string;
}>;

export type CompilerProductionFixtureAbsenceScanReceipt = Readonly<{
  scope: 'snapshot-files' | 'generated-build-files' | 'vite-dist-bundle';
  fileSetDigest: string;
  markerSetDigest: string;
  scannedFileCount: number;
  scannedByteCount: number;
  findingCount: 0;
  status: 'clean';
  scanDigest: string;
}>;

export type CompilerProductionFixtureAbsenceReceipt = Readonly<{
  format: typeof COMPILER_PRODUCTION_FIXTURE_ABSENCE_RECEIPT_FORMAT;
  owner: typeof COMPILER_PRODUCTION_FIXTURE_ABSENCE_OWNER;
  productionSnapshotDigest: string;
  target: ExecutableProjectTarget;
  generatedFiles: Readonly<{
    manifestDigest: string;
    files: readonly CompilerProductionFixtureAbsenceFileBinding[];
  }>;
  buildBundle: Readonly<{
    bundleDigest: string;
    fileSetDigest: string;
    files: readonly CompilerProductionFixtureAbsenceFileBinding[];
  }>;
  forbiddenAuthority: Readonly<{
    fixtureSnapshotDigest: string;
    fixtureProjectionReceiptDigest: string;
    diagnosticTestExtensionReceiptDigest: string;
    diagnosticTestEntrypoints: readonly string[];
    diagnosticCanaryDigests: readonly string[];
    markerSetDigest: string;
  }>;
  forbiddenMarkers: readonly CompilerProductionFixtureAbsenceMarker[];
  scans: Readonly<{
    snapshotFiles: CompilerProductionFixtureAbsenceScanReceipt;
    generatedBuildFiles: CompilerProductionFixtureAbsenceScanReceipt;
    viteDistBundle: CompilerProductionFixtureAbsenceScanReceipt;
  }>;
  receiptDigest: string;
}>;

export type CompilerProductionDiagnosticTestExtensionAuthority = Readonly<{
  baseSnapshot: ExecutableProjectSnapshot;
  extendedSnapshot: ExecutableProjectSnapshot;
  receipt: CompilerDiagnosticTestExtensionReceipt;
  canaryValues: readonly string[];
}>;

export type CompilerProductionForbiddenFixtureAuthority =
  IssueCompilerFixtureProjectionReceiptInput &
    Readonly<{
      receipt: CompilerFixtureProjectionReceipt;
      diagnosticTestExtension: CompilerProductionDiagnosticTestExtensionAuthority;
    }>;

export type IssueCompilerProductionFixtureAbsenceReceiptInput = Readonly<{
  productionSnapshot: ExecutableProjectSnapshot;
  productionGeneratedFiles: readonly ExecutableProjectFile[];
  productionBuildBundle: ExecutionBuildBundle;
  forbiddenFixtureAuthority: CompilerProductionForbiddenFixtureAuthority;
}>;

export type CompilerProductionFixtureAbsenceFinding = Readonly<{
  scope: CompilerProductionFixtureAbsenceScanReceipt['scope'];
  path: string;
  surface: 'path' | 'contents';
  markerId: string;
  byteOffset: number;
}>;

export class CompilerProductionFixtureAbsenceError extends Error {
  readonly code = 'VER-COMPILER-PRODUCTION-FIXTURE-LEAK';
  readonly findings: readonly CompilerProductionFixtureAbsenceFinding[];

  constructor(
    message: string,
    findings: readonly CompilerProductionFixtureAbsenceFinding[] = []
  ) {
    super(message);
    this.name = 'CompilerProductionFixtureAbsenceError';
    this.findings = Object.freeze([...findings]);
  }
}
