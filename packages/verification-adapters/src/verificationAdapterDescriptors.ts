import {
  createVerificationAdapterRegistration,
  digestVerificationValue,
  normalizeVerificationAdapterDescriptor,
  type VerificationAdapterDescriptor,
  type VerificationAdapterRegistration,
  type VerificationAdapterToolIdentity,
  type VerificationArtifactKind,
  type VerificationCheckKind,
  type VerificationInputKind,
  type VerificationSurface,
} from '@prodivix/verification';
import {
  BUILD_VERIFICATION_RESULT_FORMAT,
  DIAGNOSTIC_VERIFICATION_SNAPSHOT_FORMAT,
  TEST_VERIFICATION_RESULT_FORMAT,
} from './verificationAdapterInputs';

export const FIRST_PARTY_VERIFICATION_ADAPTER_IDS = Object.freeze({
  diagnostics: 'adapter:g3-v6:diagnostics',
  build: 'adapter:g3-v6:build',
  unit: 'adapter:g3-v6:unit',
  integration: 'adapter:g3-v6:integration',
});

const PACKAGE_NAME = '@prodivix/verification-adapters';
const PACKAGE_VERSION = '0.0.1';
const TARGETS = Object.freeze(['react-vite', 'vue-vite']);
const TRUST_INPUTS = Object.freeze([
  'ci-attested',
  'local-unattested',
  'remote-attested',
] as const);
const BUDGETS = Object.freeze({
  maximumDurationMs: 60_000,
  maximumArtifactBytes: 10_000_000,
  maximumEvents: 4_096,
});

type DescriptorInput = Readonly<{
  id: string;
  checkKind: VerificationCheckKind;
  surface: VerificationSurface;
  inputKinds: readonly VerificationInputKind[];
  artifactKinds: readonly VerificationArtifactKind[];
  schema: string;
}>;

const createDescriptor = ({
  id,
  checkKind,
  surface,
  inputKinds,
  artifactKinds,
  schema,
}: DescriptorInput): VerificationAdapterDescriptor => {
  const toolchainDigest = digestVerificationValue({
    packageName: PACKAGE_NAME,
    packageVersion: PACKAGE_VERSION,
    executionBoundary: 'node',
    publicInputs: [
      'ExecutionBuildBundle',
      'ExecutionTestReport',
      'VerificationCheckReportCandidate',
    ],
  });
  return normalizeVerificationAdapterDescriptor({
    id,
    implementation: {
      packageName: PACKAGE_NAME,
      packageVersion: PACKAGE_VERSION,
      buildDigest: digestVerificationValue({
        packageName: PACKAGE_NAME,
        packageVersion: PACKAGE_VERSION,
        adapterId: id,
        implementation: 'first-party-controlled-static-adapter.v1',
      }),
      toolchainDigest,
      schemaDigest: digestVerificationValue({
        adapterId: id,
        schema,
      }),
    },
    checkKinds: [checkKind],
    surfaces: [surface],
    targets: TARGETS,
    browserEngines: [],
    controlCapabilities: [],
    inputKinds,
    artifactKinds,
    budgets: BUDGETS,
    trustInputs: TRUST_INPUTS,
  });
};

export const DIAGNOSTICS_VERIFICATION_ADAPTER_DESCRIPTOR = createDescriptor({
  id: FIRST_PARTY_VERIFICATION_ADAPTER_IDS.diagnostics,
  checkKind: 'diagnostics',
  surface: 'ci',
  inputKinds: ['diagnostic-snapshot'],
  artifactKinds: ['trace'],
  schema: DIAGNOSTIC_VERIFICATION_SNAPSHOT_FORMAT,
});

export const BUILD_VERIFICATION_ADAPTER_DESCRIPTOR = createDescriptor({
  id: FIRST_PARTY_VERIFICATION_ADAPTER_IDS.build,
  checkKind: 'build',
  surface: 'export',
  inputKinds: ['executable-snapshot'],
  artifactKinds: ['build-log'],
  schema: BUILD_VERIFICATION_RESULT_FORMAT,
});

export const UNIT_VERIFICATION_ADAPTER_DESCRIPTOR = createDescriptor({
  id: FIRST_PARTY_VERIFICATION_ADAPTER_IDS.unit,
  checkKind: 'unit',
  surface: 'ci',
  inputKinds: ['test-report'],
  artifactKinds: ['coverage-summary'],
  schema: TEST_VERIFICATION_RESULT_FORMAT,
});

export const INTEGRATION_VERIFICATION_ADAPTER_DESCRIPTOR = createDescriptor({
  id: FIRST_PARTY_VERIFICATION_ADAPTER_IDS.integration,
  checkKind: 'integration',
  surface: 'ci',
  inputKinds: ['executable-snapshot', 'test-report'],
  artifactKinds: ['coverage-summary', 'trace'],
  schema: TEST_VERIFICATION_RESULT_FORMAT,
});

const createTool = (
  descriptor: VerificationAdapterDescriptor,
  name: string
): VerificationAdapterToolIdentity =>
  Object.freeze({
    name,
    version: PACKAGE_VERSION,
    schemaVersion: 1,
    schemaDigest: descriptor.implementation.schemaDigest,
  });

export const DIAGNOSTICS_VERIFICATION_ADAPTER_TOOL = createTool(
  DIAGNOSTICS_VERIFICATION_ADAPTER_DESCRIPTOR,
  'prodivix-diagnostic-snapshot'
);
export const BUILD_VERIFICATION_ADAPTER_TOOL = createTool(
  BUILD_VERIFICATION_ADAPTER_DESCRIPTOR,
  'prodivix-execution-build-bundle'
);
export const UNIT_VERIFICATION_ADAPTER_TOOL = createTool(
  UNIT_VERIFICATION_ADAPTER_DESCRIPTOR,
  'prodivix-execution-test-report'
);
export const INTEGRATION_VERIFICATION_ADAPTER_TOOL = createTool(
  INTEGRATION_VERIFICATION_ADAPTER_DESCRIPTOR,
  'prodivix-execution-test-report'
);

const createRegistration = (
  descriptor: VerificationAdapterDescriptor,
  tool: VerificationAdapterToolIdentity
): VerificationAdapterRegistration =>
  createVerificationAdapterRegistration(descriptor, {
    tool,
    runtimeZones: ['node'],
  });

export const DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION = createRegistration(
  DIAGNOSTICS_VERIFICATION_ADAPTER_DESCRIPTOR,
  DIAGNOSTICS_VERIFICATION_ADAPTER_TOOL
);
export const BUILD_VERIFICATION_ADAPTER_REGISTRATION = createRegistration(
  BUILD_VERIFICATION_ADAPTER_DESCRIPTOR,
  BUILD_VERIFICATION_ADAPTER_TOOL
);
export const UNIT_VERIFICATION_ADAPTER_REGISTRATION = createRegistration(
  UNIT_VERIFICATION_ADAPTER_DESCRIPTOR,
  UNIT_VERIFICATION_ADAPTER_TOOL
);
export const INTEGRATION_VERIFICATION_ADAPTER_REGISTRATION = createRegistration(
  INTEGRATION_VERIFICATION_ADAPTER_DESCRIPTOR,
  INTEGRATION_VERIFICATION_ADAPTER_TOOL
);

export const FIRST_PARTY_STATIC_VERIFICATION_ADAPTER_REGISTRATIONS =
  Object.freeze([
    BUILD_VERIFICATION_ADAPTER_REGISTRATION,
    DIAGNOSTICS_VERIFICATION_ADAPTER_REGISTRATION,
    INTEGRATION_VERIFICATION_ADAPTER_REGISTRATION,
    UNIT_VERIFICATION_ADAPTER_REGISTRATION,
  ]);
