import {
  EXECUTABLE_PROJECT_DATA_MOCK_PROVISION_PATH,
  EXECUTABLE_PROJECT_SERVER_RUNTIME_MOCK_PROVISION_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
  EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
} from '@prodivix/runtime-core';
import { SERVER_RUNTIME_TEST_PROVISION_FORMAT } from '@prodivix/server-runtime';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
  COMPILER_DIAGNOSTIC_TEST_EXTENSION_RECEIPT_FORMAT,
} from './diagnosticTestExtensionReceipt';
import {
  COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
  COMPILER_FIXTURE_PROJECTION_FILE_FORMAT,
  COMPILER_FIXTURE_PROJECTION_RECEIPT_FORMAT,
  COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
} from './fixtureProjectionReceipt';
import {
  compilerBytes,
  digestCompilerBytes,
} from './executableProjectSnapshotCanonical';
import {
  CompilerProductionFixtureAbsenceError,
  type CompilerProductionFixtureAbsenceMarker,
  type IssueCompilerProductionFixtureAbsenceReceiptInput,
} from './productionFixtureAbsenceReceipt.types';
import { WORKSPACE_VERIFICATION_CREDENTIAL_CANARY } from '#src/workspace/productionVerificationProbeScanner';
import {
  WORKSPACE_VERIFICATION_PROBE_CANARY,
  WORKSPACE_VERIFICATION_PROBE_ENDPOINT,
  WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
  WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
} from '#src/workspace/workspaceVerificationProbeContract';

const EXECUTABLE_SERVER_RUNTIME_TEST_PROJECTION_FORMAT =
  'prodivix.executable-server-runtime-provision.v1';
const EXECUTABLE_SERVER_RUNTIME_TEST_MODE = 'deterministic-test';
const DIAGNOSTIC_PUBLIC_CANARY_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9 .,:;_()'!-]{7,511}$/u;
const DIAGNOSTIC_SENSITIVE_TEXT_PATTERN =
  /(?:api[-_ ]?key|bearer|cookie|credential|password|private[-_ ]?key|secret|token)/iu;

export const compilerProductionFixedAbsenceMarkers = (): readonly Readonly<{
  id: string;
  value: string;
}>[] =>
  Object.freeze([
    {
      id: 'verification-probe:canary',
      value: WORKSPACE_VERIFICATION_PROBE_CANARY,
    },
    {
      id: 'verification-probe:endpoint',
      value: WORKSPACE_VERIFICATION_PROBE_ENDPOINT,
    },
    {
      id: 'verification-probe:module-id',
      value: WORKSPACE_VERIFICATION_PROBE_MODULE_ID,
    },
    {
      id: 'verification-probe:module-path',
      value: WORKSPACE_VERIFICATION_PROBE_MODULE_PATH,
    },
    {
      id: 'verification-probe:credential-canary',
      value: WORKSPACE_VERIFICATION_CREDENTIAL_CANARY,
    },
    {
      id: 'diagnostic-extension:format',
      value: COMPILER_DIAGNOSTIC_TEST_EXTENSION_RECEIPT_FORMAT,
    },
    {
      id: 'diagnostic-extension:owner',
      value: COMPILER_DIAGNOSTIC_TEST_EXTENSION_OWNER,
    },
    {
      id: 'fixture-projection:file-format',
      value: COMPILER_FIXTURE_PROJECTION_FILE_FORMAT,
    },
    {
      id: 'fixture-projection:receipt-format',
      value: COMPILER_FIXTURE_PROJECTION_RECEIPT_FORMAT,
    },
    {
      id: 'fixture-projection:source-path',
      value: COMPILER_FIXTURE_PROJECTION_SOURCE_PATH,
    },
    {
      id: 'fixture-projection:build-path',
      value: COMPILER_FIXTURE_PROJECTION_BUILD_PATH,
    },
    {
      id: 'fixture-projection:data-mock-path',
      value: EXECUTABLE_PROJECT_DATA_MOCK_PROVISION_PATH,
    },
    {
      id: 'fixture-projection:server-mock-path',
      value: EXECUTABLE_PROJECT_SERVER_RUNTIME_MOCK_PROVISION_PATH,
    },
    {
      id: 'fixture-projection:server-provision-format',
      value: SERVER_RUNTIME_TEST_PROVISION_FORMAT,
    },
    {
      id: 'fixture-projection:runtime-envelope-format',
      value: EXECUTABLE_SERVER_RUNTIME_TEST_PROJECTION_FORMAT,
    },
    {
      id: 'fixture-projection:runtime-test-mode',
      value: EXECUTABLE_SERVER_RUNTIME_TEST_MODE,
    },
    {
      id: 'auth-session:endpoint',
      value: EXECUTION_AUTH_SESSION_FIXTURE_ENDPOINT_PATH,
    },
    {
      id: 'auth-session:response-format',
      value: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_FORMAT,
    },
    {
      id: 'auth-session:response-media-type',
      value: EXECUTION_AUTH_SESSION_FIXTURE_RESPONSE_MEDIA_TYPE,
    },
  ]);

const dynamicMarkerValues = (
  input: IssueCompilerProductionFixtureAbsenceReceiptInput
): readonly Readonly<{ id: string; value: string }>[] => {
  const fixture = input.forbiddenFixtureAuthority;
  const diagnostic = fixture.diagnosticTestExtension;
  return Object.freeze([
    {
      id: 'fixture-authority:snapshot-digest',
      value: fixture.snapshot.contentDigest,
    },
    {
      id: 'fixture-authority:receipt-digest',
      value: fixture.receipt.receiptDigest,
    },
    {
      id: 'diagnostic-extension:receipt-digest',
      value: diagnostic.receipt.receiptDigest,
    },
    ...diagnostic.receipt.entrypoints.map(({ path }, index) => ({
      id: `diagnostic-extension:entrypoint:${index}`,
      value: path,
    })),
    ...diagnostic.canaryValues.map((value, index) => ({
      id: `diagnostic-extension:canary:${index}`,
      value,
    })),
    ...fixture.receipt.fixtureSets.flatMap(({ id, digest }, index) => [
      {
        id: `fixture-projection:fixture-set-id:${index}`,
        value: id,
      },
      {
        id: `fixture-projection:fixture-set-digest:${index}`,
        value: digest,
      },
    ]),
    ...fixture.receipt.fixtureBindings.flatMap(
      ({ fixtureId, projectionDigest }, index) => [
        {
          id: `fixture-projection:fixture-id:${index}`,
          value: fixtureId,
        },
        {
          id: `fixture-projection:binding-digest:${index}`,
          value: projectionDigest,
        },
      ]
    ),
  ]);
};

export const areCompilerProductionDiagnosticCanariesPublic = (
  canaries: readonly string[]
): boolean =>
  canaries.every(
    (canary) =>
      typeof canary === 'string' &&
      canary === canary.trim() &&
      canary === canary.normalize('NFC') &&
      compilerBytes(canary).byteLength <= 512 &&
      DIAGNOSTIC_PUBLIC_CANARY_PATTERN.test(canary) &&
      !DIAGNOSTIC_SENSITIVE_TEXT_PATTERN.test(canary) &&
      !canary.includes('://') &&
      !canary.includes('/') &&
      !canary.includes('\\')
  );

export const createCompilerProductionFixtureAbsenceMarkers = (
  input: IssueCompilerProductionFixtureAbsenceReceiptInput
): readonly CompilerProductionFixtureAbsenceMarker[] => {
  const byValue = new Map<string, { id: string; value: string }>();
  for (const candidate of [
    ...compilerProductionFixedAbsenceMarkers(),
    ...dynamicMarkerValues(input),
  ]) {
    if (
      typeof candidate.value !== 'string' ||
      candidate.value !== candidate.value.trim() ||
      candidate.value !== candidate.value.normalize('NFC') ||
      compilerBytes(candidate.value).byteLength < 4
    ) {
      throw new CompilerProductionFixtureAbsenceError(
        `Forbidden production marker "${candidate.id}" is not a bounded canonical value.`
      );
    }
    const current = byValue.get(candidate.value);
    if (!current || compareUnicodeCodePoints(candidate.id, current.id) < 0) {
      byValue.set(candidate.value, candidate);
    }
  }
  return Object.freeze(
    [...byValue.values()]
      .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
      .map(({ id, value }) =>
        Object.freeze({
          id,
          value,
          digest: digestCompilerBytes(compilerBytes(value)),
        })
      )
  );
};
