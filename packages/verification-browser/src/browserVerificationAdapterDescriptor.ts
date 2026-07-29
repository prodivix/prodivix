import {
  createVerificationAdapterRegistration,
  digestVerificationValue,
  normalizeVerificationAdapterDescriptor,
  type VerificationAdapterToolIdentity,
} from '@prodivix/verification';
import { DETERMINISTIC_RUNTIME_CONTROL_IDS } from '@prodivix/runtime-core';

export const FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_ID =
  'adapter:g3-v6:browser' as const;

const PACKAGE_NAME = '@prodivix/verification-browser';
const PACKAGE_VERSION = '0.0.1';

export const FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR =
  normalizeVerificationAdapterDescriptor({
    id: FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_ID,
    implementation: {
      packageName: PACKAGE_NAME,
      packageVersion: PACKAGE_VERSION,
      buildDigest: digestVerificationValue({
        packageName: PACKAGE_NAME,
        packageVersion: PACKAGE_VERSION,
        implementation: 'first-party-playwright-browser-adapter.v1',
      }),
      toolchainDigest: digestVerificationValue({
        packageName: PACKAGE_NAME,
        packageVersion: PACKAGE_VERSION,
        playwright: '1.61.1',
        axeCore: '4.12.1',
        boundary: 'bounded-private-payloads',
      }),
      schemaDigest: digestVerificationValue({
        format: 'prodivix.verification-check-report-candidate',
        version: 1,
        browserCellInput: 'prodivix.browser-verification-cell-input@1',
      }),
    },
    checkKinds: ['e2e', 'visual', 'accessibility', 'performance', 'security'],
    surfaces: ['preview', 'export', 'ci'],
    targets: ['react-vite', 'vue-vite'],
    browserEngines: ['chromium', 'firefox', 'webkit'],
    controlCapabilities: DETERMINISTIC_RUNTIME_CONTROL_IDS,
    inputKinds: [
      'verification-profile',
      'executable-snapshot',
      'scenario-program',
      'baseline-set',
      'security-observation-set',
    ],
    artifactKinds: [
      'replay-record',
      'trace',
      'network-summary',
      'console-summary',
      'screenshot',
      'visual-diff',
      'accessibility-report',
      'performance-profile',
      'security-report',
    ],
    budgets: {
      maximumDurationMs: 60_000,
      maximumArtifactBytes: 64 * 1024 * 1024,
      maximumEvents: 1_024,
    },
    trustInputs: ['local-unattested', 'remote-attested', 'ci-attested'],
  });

export const FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_TOOL: VerificationAdapterToolIdentity =
  Object.freeze({
    name: 'prodivix-playwright-browser-aggregate',
    version: PACKAGE_VERSION,
    schemaVersion: 1,
    schemaDigest:
      FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR.implementation
        .schemaDigest,
  });

export const FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION =
  createVerificationAdapterRegistration(
    FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR,
    {
      tool: FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_TOOL,
      runtimeZones: ['browser'],
    }
  );
