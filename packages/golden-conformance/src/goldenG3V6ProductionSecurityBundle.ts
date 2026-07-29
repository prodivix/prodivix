import {
  EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET,
  EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET,
  WORKSPACE_VERIFICATION_CREDENTIAL_CANARY,
  WORKSPACE_VERIFICATION_PROBE_CANARY,
  WORKSPACE_VERIFICATION_PROBE_ENDPOINT,
  WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
  WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
  assertCompilerProductionFixtureAbsenceBuildBundle,
  scanProductionBundleForVerificationProbe,
  type CompilerProductionFixtureAbsenceReceipt,
  type ProductionVerificationProbeScanResult,
} from '@prodivix/prodivix-compiler';
import {
  EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
  createExecutionSecretLeakGuard,
  decodeExecutionBuildBundle,
  inspectExecutionArtifactContents,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
  type ExecutionSecretLeakInspection,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import { digestVerificationValue } from '@prodivix/verification';
import { digestBrowserVerificationBytes } from '@prodivix/verification-browser';

const SECURITY_BUNDLE_ENVELOPE_PATH =
  '.prodivix-authority/execution-build-bundle.json';
const EXECUTION_ONLY_OUTPUT_PATH_PATTERN =
  /(?:^|\/)(?:[^/]*\.(?:spec|test)\.[^/]+|[^/]*(?:fixture|mock-provision)[^/]*)$/u;
const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/u;

export const GOLDEN_G3_V6_PRODUCTION_PROBE_MARKERS = Object.freeze([
  WORKSPACE_VERIFICATION_PROBE_CANARY,
  WORKSPACE_VERIFICATION_PROBE_ENDPOINT,
  WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
  WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
  WORKSPACE_VERIFICATION_CREDENTIAL_CANARY,
]);

export const GOLDEN_G3_V6_ARTIFACT_SECRET_MARKERS = Object.freeze([
  WORKSPACE_VERIFICATION_CREDENTIAL_CANARY,
]);

export type GoldenG3V6ProductionSecurityBundleOwnerInput = Readonly<{
  productionSnapshot: ExecutableProjectSnapshot;
  forbiddenFixtureSourceSnapshot: ExecutableProjectSnapshot;
  productionFixtureAbsenceReceipt: CompilerProductionFixtureAbsenceReceipt;
  buildBundle: ExecutionBuildBundle;
  servedBundleDigest: string;
  materializedBundleBytes?: Uint8Array;
}>;

type SecretInspectionFact = Readonly<{
  path: string;
  digest: string;
  inspection: ExecutionSecretLeakInspection;
}>;

type ProbeInspectionFact = Readonly<{
  status: ProductionVerificationProbeScanResult['status'];
  findings: readonly Readonly<{
    path: string;
    marker: string;
    byteOffset: number;
  }>[];
}>;

export type GoldenG3V6ProductionSecurityRuleInspection = Readonly<{
  expectedDigest: string;
  observedDigest: string;
  violationCount: number;
  diagnosticCodes: readonly string[];
  blockedReasonCode?: string;
  sourceResult: unknown;
}>;

export type GoldenG3V6ProductionSecurityBundleInspection = Readonly<{
  productionSnapshotDigest: string;
  canarySourceSnapshotDigest: string;
  canarySourceDigest: string;
  servedBundleDigest: string;
  scannedBundleDigest: string;
  materializedBundleDigest: string;
  canonicalBundleDigest: string;
  bundleFileSetDigest: string;
  compilerFixtureAbsenceReceiptDigest: string;
  compilerFixtureAbsenceBundleScanDigest: string;
  compilerFixtureAbsenceMarkerSetDigest: string;
  exactBundleBinding: boolean;
  rules: Readonly<{
    secret: GoldenG3V6ProductionSecurityRuleInspection;
    productionProbe: GoldenG3V6ProductionSecurityRuleInspection;
    outputArtifact: GoldenG3V6ProductionSecurityRuleInspection;
  }>;
}>;

export type GoldenG3V6ProductionSecurityBundleOwner = Readonly<{
  productionSnapshotDigest: string;
  canarySourceSnapshotDigest: string;
  servedBundleDigest: string;
  productionProbeMarkers: readonly string[];
  inspect(): GoldenG3V6ProductionSecurityBundleInspection;
}>;

export class GoldenG3V6ProductionSecurityError extends Error {
  readonly code = 'GOLDEN_G3_V6_PRODUCTION_SECURITY';
  readonly failedRuleIds: readonly string[];

  constructor(
    message: string,
    failedRuleIds: readonly string[],
    options: Readonly<{ cause?: unknown }> = {}
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause }
    );
    this.name = 'GoldenG3V6ProductionSecurityError';
    this.failedRuleIds = Object.freeze([...failedRuleIds]);
  }
}

const encodeBuildBundle = (bundle: ExecutionBuildBundle): Uint8Array =>
  new TextEncoder().encode(
    canonicalJsonText({
      format: bundle.format,
      snapshotDigest: bundle.snapshotDigest,
      target: bundle.target,
      files: bundle.files.map((file) => ({
        path: file.path,
        size: file.size,
        digest: file.digest,
        encoding: 'base64',
        contents: Buffer.from(file.contents).toString('base64'),
      })),
    })
  );

export const digestGoldenG3V6ProductionBuildBundle = (
  bundle: ExecutionBuildBundle
): string => digestBrowserVerificationBytes(encodeBuildBundle(bundle));

const readStringProperty = (
  value: unknown,
  key: string,
  label: string
): string => {
  if (!isPlainObject(value) || typeof value[key] !== 'string') {
    throw new GoldenG3V6ProductionSecurityError(
      `${label} must provide an exact "${key}" string.`,
      Object.freeze([])
    );
  }
  return value[key];
};

const fixtureCanaries = (
  fixtureSource: ExecutableProjectSnapshot
): readonly string[] => {
  const dataProvision = fixtureSource.dataMockProvision;
  const serverProvision = fixtureSource.serverRuntimeMockProvision;
  if (!dataProvision || !isPlainObject(serverProvision)) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden forbidden fixture source must retain real Data and Server provisions.',
      Object.freeze([])
    );
  }
  const principal = serverProvision.principal;
  if (!isPlainObject(principal)) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden forbidden fixture source must retain its real principal.',
      Object.freeze([])
    );
  }
  const values = [
    dataProvision.fixtureSetId,
    canonicalJsonText(dataProvision),
    readStringProperty(
      serverProvision,
      'fixtureSetId',
      'Server fixture provision'
    ),
    canonicalJsonText(serverProvision),
    readStringProperty(principal, 'providerId', 'Server fixture principal'),
    readStringProperty(principal, 'principalId', 'Server fixture principal'),
    WORKSPACE_VERIFICATION_CREDENTIAL_CANARY,
  ];
  const normalized = [...new Set(values)].sort(compareUnicodeCodePoints);
  if (normalized.some((value) => value.length < 4)) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden forbidden fixture source produced an invalid canary.',
      Object.freeze([])
    );
  }
  return Object.freeze(normalized);
};

const sourceFileText = (
  snapshot: ExecutableProjectSnapshot,
  path: string
): string => {
  const contents = snapshot.files.find((file) => file.path === path)?.contents;
  if (typeof contents !== 'string') {
    throw new GoldenG3V6ProductionSecurityError(
      `Golden production snapshot is missing "${path}".`,
      Object.freeze([])
    );
  }
  return contents;
};

const assertProductionAndFixtureSnapshots = (
  production: ExecutableProjectSnapshot,
  fixtureSource: ExecutableProjectSnapshot
): void => {
  if (
    production.dataMockProvision !== undefined ||
    production.serverRuntimeMockProvision !== undefined
  ) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden production snapshot must not retain Data or Server mock provisions.',
      Object.freeze([])
    );
  }
  if (
    !sameCanonicalJson(production.workspace, fixtureSource.workspace) ||
    !sameCanonicalJson(production.target, fixtureSource.target) ||
    production.contentDigest === fixtureSource.contentDigest
  ) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden production and forbidden fixture snapshots must bind the same Workspace/framework but distinct content digests.',
      Object.freeze([])
    );
  }
  fixtureCanaries(fixtureSource);
  const dataRuntime = sourceFileText(
    production,
    'src/prodivix-data-runtime.ts'
  );
  const serverRuntime = sourceFileText(
    production,
    'src/prodivix-server-runtime.ts'
  );
  if (
    !dataRuntime.includes(
      JSON.stringify(EXECUTION_PARENT_GATEWAY_DATA_RUNTIME_TARGET)
    ) ||
    !serverRuntime.includes(
      JSON.stringify(EXECUTION_PARENT_GATEWAY_SERVER_RUNTIME_TARGET)
    ) ||
    !production.capabilityRequirements.preview.includes('network') ||
    !production.capabilityRequirements.preview.includes('server-function')
  ) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden production snapshot must use the exact parent-gateway Data and Server targets.',
      Object.freeze([])
    );
  }
};

const cloneAndValidateBundle = (
  snapshot: ExecutableProjectSnapshot,
  input: ExecutionBuildBundle
): Readonly<{ bundle: ExecutionBuildBundle; bytes: Uint8Array }> => {
  const bytes = encodeBuildBundle(input);
  const bundle = decodeExecutionBuildBundle(bytes);
  if (
    bundle.snapshotDigest !== snapshot.contentDigest ||
    !sameCanonicalJson(bundle.target, snapshot.target)
  ) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden production build bundle drifted from its executable snapshot.',
      Object.freeze([])
    );
  }
  return Object.freeze({ bundle, bytes });
};

const probeResultValue = (
  result: ProductionVerificationProbeScanResult
): ProbeInspectionFact =>
  Object.freeze({
    status: result.status,
    findings: Object.freeze(
      result.findings.map(({ path, marker, byteOffset }) =>
        Object.freeze({ path, marker, byteOffset })
      )
    ),
  });

const directSecretInspections = (
  guard: ReturnType<typeof createExecutionSecretLeakGuard>,
  materializedBundleBytes: Uint8Array,
  bundle: ExecutionBuildBundle
): readonly SecretInspectionFact[] =>
  Object.freeze([
    Object.freeze({
      path: SECURITY_BUNDLE_ENVELOPE_PATH,
      digest: digestBrowserVerificationBytes(materializedBundleBytes),
      inspection: guard.inspectBytes(
        'artifact-content',
        materializedBundleBytes
      ),
    }),
    ...bundle.files.map((file) =>
      Object.freeze({
        path: file.path,
        digest: file.digest,
        inspection: guard.inspectBytes('artifact-content', file.contents),
      })
    ),
  ]);

const inspectBundle = (
  input: Readonly<{
    productionSnapshotDigest: string;
    canarySourceSnapshotDigest: string;
    canaries: readonly string[];
    servedBundleDigest: string;
    canonicalBundleBytes: Uint8Array;
    materializedBundleBytes: Uint8Array;
    productionFixtureAbsenceReceipt: CompilerProductionFixtureAbsenceReceipt;
  }>
): GoldenG3V6ProductionSecurityBundleInspection => {
  const canonicalBundleBytes = new Uint8Array(input.canonicalBundleBytes);
  const materializedBundleBytes = new Uint8Array(input.materializedBundleBytes);
  const bundle = decodeExecutionBuildBundle(canonicalBundleBytes);
  const canonicalBundleDigest =
    digestBrowserVerificationBytes(canonicalBundleBytes);
  const materializedBundleDigest = digestBrowserVerificationBytes(
    materializedBundleBytes
  );
  const bundleFileSetDigest = digestVerificationValue(
    bundle.files.map(({ path, size, digest }) => ({ path, size, digest }))
  );
  const canarySourceDigest = digestVerificationValue({
    snapshotDigest: input.canarySourceSnapshotDigest,
    protectedValueSetDigest: digestVerificationValue(input.canaries),
  });
  const bundleFacts = Object.freeze({
    canonicalBundleDigest,
    materializedBundleDigest,
    bundleFileSetDigest,
    canarySourceDigest,
    compilerFixtureAbsenceReceiptDigest:
      input.productionFixtureAbsenceReceipt.receiptDigest,
    compilerFixtureAbsenceBundleScanDigest:
      input.productionFixtureAbsenceReceipt.scans.viteDistBundle.scanDigest,
    compilerFixtureAbsenceMarkerSetDigest:
      input.productionFixtureAbsenceReceipt.forbiddenAuthority.markerSetDigest,
  });
  const guard = createExecutionSecretLeakGuard({
    secretValues: input.canaries,
  });
  const secretInspections = directSecretInspections(
    guard,
    materializedBundleBytes,
    bundle
  );
  const executionOnlyPaths = bundle.files
    .map(({ path }) => path)
    .filter((path) => EXECUTION_ONLY_OUTPUT_PATH_PATTERN.test(path))
    .sort(compareUnicodeCodePoints);
  const secretSourceResult = Object.freeze({
    inspections: secretInspections,
    executionOnlyPaths: Object.freeze(executionOnlyPaths),
  });
  const expectedSecretDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v6-secret-output-scan',
    version: 1,
    bundleFacts,
    inspections: secretInspections.map(({ path, digest }) => ({
      path,
      digest,
      inspection: { safe: true },
    })),
    executionOnlyPaths: [],
  });
  const observedSecretDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v6-secret-output-scan',
    version: 1,
    bundleFacts,
    ...secretSourceResult,
  });
  const secretViolationCount =
    secretInspections.filter(
      ({ inspection }) =>
        !inspection.safe && inspection.reason === 'secret-canary'
    ).length + executionOnlyPaths.length;

  const compilerScanFiles = Object.freeze([
    Object.freeze({
      path: SECURITY_BUNDLE_ENVELOPE_PATH,
      contents: materializedBundleBytes,
    }),
    ...bundle.files.map(({ path, contents }) =>
      Object.freeze({ path, contents })
    ),
  ]);
  const probeScan = scanProductionBundleForVerificationProbe(compilerScanFiles);
  const compilerProbeEvidence = Object.freeze({
    compilerFixtureAbsenceReceiptDigest:
      input.productionFixtureAbsenceReceipt.receiptDigest,
    compilerFixtureAbsenceBundleScan:
      input.productionFixtureAbsenceReceipt.scans.viteDistBundle,
  });
  const probeSourceResult = Object.freeze({
    ...probeResultValue(probeScan),
    ...compilerProbeEvidence,
  });
  const probeIdentity = Object.freeze({
    format: 'prodivix.golden-g3-v6-production-probe-scan',
    version: 1,
    bundleFacts,
    markerSetDigest: digestVerificationValue(
      GOLDEN_G3_V6_PRODUCTION_PROBE_MARKERS
    ),
  });
  const expectedProbeDigest = digestVerificationValue({
    ...probeIdentity,
    status: 'clean',
    findings: [],
    ...compilerProbeEvidence,
  });
  const observedProbeDigest = digestVerificationValue({
    ...probeIdentity,
    ...probeSourceResult,
  });

  const artifactInspection = inspectExecutionArtifactContents(
    guard,
    'artifact-content',
    EXECUTION_BUILD_BUNDLE_MEDIA_TYPE,
    materializedBundleBytes
  );
  const outputInspectable =
    artifactInspection.safe || artifactInspection.reason === 'secret-canary';
  const outputSourceResult = Object.freeze({
    inspection: artifactInspection,
    exactEnvelope: canonicalBundleDigest === materializedBundleDigest,
    inspectability: outputInspectable ? 'inspectable' : 'uninspectable',
  });
  const expectedOutputDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v6-output-artifact-inspection',
    version: 1,
    bundleFacts,
    inspectability: 'inspectable',
  });
  const observedOutputDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v6-output-artifact-inspection',
    version: 1,
    bundleFacts,
    inspectability: outputInspectable ? 'inspectable' : 'uninspectable',
  });

  return Object.freeze({
    productionSnapshotDigest: input.productionSnapshotDigest,
    canarySourceSnapshotDigest: input.canarySourceSnapshotDigest,
    canarySourceDigest,
    servedBundleDigest: input.servedBundleDigest,
    scannedBundleDigest: materializedBundleDigest,
    materializedBundleDigest,
    canonicalBundleDigest,
    bundleFileSetDigest,
    compilerFixtureAbsenceReceiptDigest:
      input.productionFixtureAbsenceReceipt.receiptDigest,
    compilerFixtureAbsenceBundleScanDigest:
      input.productionFixtureAbsenceReceipt.scans.viteDistBundle.scanDigest,
    compilerFixtureAbsenceMarkerSetDigest:
      input.productionFixtureAbsenceReceipt.forbiddenAuthority.markerSetDigest,
    exactBundleBinding:
      input.servedBundleDigest === canonicalBundleDigest &&
      canonicalBundleDigest === materializedBundleDigest &&
      input.productionFixtureAbsenceReceipt.buildBundle.bundleDigest ===
        canonicalBundleDigest,
    rules: Object.freeze({
      secret: Object.freeze({
        expectedDigest: expectedSecretDigest,
        observedDigest: observedSecretDigest,
        violationCount: secretViolationCount,
        diagnosticCodes:
          secretViolationCount === 0
            ? Object.freeze([])
            : Object.freeze(['VER-SEC-SECRET-CANARY']),
        sourceResult: secretSourceResult,
      }),
      productionProbe: Object.freeze({
        expectedDigest: expectedProbeDigest,
        observedDigest: observedProbeDigest,
        violationCount: probeScan.findings.length,
        diagnosticCodes:
          probeScan.findings.length === 0
            ? Object.freeze([])
            : Object.freeze(['VER-SEC-PROBE-LEAK']),
        sourceResult: probeSourceResult,
      }),
      outputArtifact: Object.freeze({
        expectedDigest: expectedOutputDigest,
        observedDigest: observedOutputDigest,
        violationCount: 0,
        diagnosticCodes: outputInspectable
          ? Object.freeze([])
          : Object.freeze(['VER-SEC-OUTPUT-UNINSPECTABLE']),
        ...(outputInspectable
          ? {}
          : {
              blockedReasonCode: 'runtime-core-artifact-uninspectable',
            }),
        sourceResult: outputSourceResult,
      }),
    }),
  });
};

export const createGoldenG3V6ProductionSecurityBundleOwner = (
  input: GoldenG3V6ProductionSecurityBundleOwnerInput
): GoldenG3V6ProductionSecurityBundleOwner => {
  if (!SHA256_PATTERN.test(input.servedBundleDigest)) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden served bundle digest must be canonical SHA-256.',
      Object.freeze([])
    );
  }
  assertProductionAndFixtureSnapshots(
    input.productionSnapshot,
    input.forbiddenFixtureSourceSnapshot
  );
  const cloned = cloneAndValidateBundle(
    input.productionSnapshot,
    input.buildBundle
  );
  if (
    input.productionFixtureAbsenceReceipt.productionSnapshotDigest !==
      input.productionSnapshot.contentDigest ||
    input.productionFixtureAbsenceReceipt.forbiddenAuthority
      .fixtureSnapshotDigest !==
      input.forbiddenFixtureSourceSnapshot.contentDigest
  ) {
    throw new GoldenG3V6ProductionSecurityError(
      'Golden production fixture-absence receipt drifted from its production or forbidden fixture snapshot.',
      Object.freeze([])
    );
  }
  try {
    assertCompilerProductionFixtureAbsenceBuildBundle(
      input.productionFixtureAbsenceReceipt,
      cloned.bundle
    );
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : 'Compiler production fixture-absence validation failed.';
    throw new GoldenG3V6ProductionSecurityError(
      `Golden production security rejected the compiler fixture-absence authority: ${detail}`,
      Object.freeze([]),
      { cause: error }
    );
  }
  const canaries = fixtureCanaries(input.forbiddenFixtureSourceSnapshot);
  const state = Object.freeze({
    productionSnapshotDigest: input.productionSnapshot.contentDigest,
    canarySourceSnapshotDigest:
      input.forbiddenFixtureSourceSnapshot.contentDigest,
    canaries,
    servedBundleDigest: input.servedBundleDigest,
    canonicalBundleBytes: new Uint8Array(cloned.bytes),
    materializedBundleBytes: new Uint8Array(
      input.materializedBundleBytes ?? cloned.bytes
    ),
    productionFixtureAbsenceReceipt: input.productionFixtureAbsenceReceipt,
  });
  return Object.freeze({
    productionSnapshotDigest: state.productionSnapshotDigest,
    canarySourceSnapshotDigest: state.canarySourceSnapshotDigest,
    servedBundleDigest: state.servedBundleDigest,
    productionProbeMarkers: Object.freeze(
      state.productionFixtureAbsenceReceipt.forbiddenMarkers.map(
        ({ value }) => value
      )
    ),
    inspect: () => inspectBundle(state),
  });
};
