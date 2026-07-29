import {
  compareVerificationText,
  createVerificationAdapterRegistrySnapshot,
  type VerificationAdapterRegistration,
  type VerificationArtifactKind,
  type VerificationCheckKind,
  type VerificationInputKind,
} from '@prodivix/verification';
import { FIRST_PARTY_STATIC_VERIFICATION_ADAPTER_REGISTRATIONS } from '@prodivix/verification-adapters';
import { FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION } from '@prodivix/verification-browser';

export type GoldenG3V6AdapterFactorySlotId =
  'diagnostics' | 'build' | 'unit' | 'integration' | 'browser';

export type GoldenG3V6AdapterFactorySlot = Readonly<{
  id: GoldenG3V6AdapterFactorySlotId;
  adapterId: string;
  ownerPackage:
    '@prodivix/verification-adapters' | '@prodivix/verification-browser';
  executionBoundary: 'node' | 'browser';
  checkKinds: readonly VerificationCheckKind[];
}>;

export const GOLDEN_G3_V6_ADAPTER_IDS = Object.freeze({
  diagnostics: 'adapter:g3-v6:diagnostics',
  build: 'adapter:g3-v6:build',
  unit: 'adapter:g3-v6:unit',
  integration: 'adapter:g3-v6:integration',
  browser: 'adapter:g3-v6:browser',
});

export const GOLDEN_G3_V6_FRAMEWORK_TARGETS = Object.freeze([
  'react-vite',
  'vue-vite',
]);

const checkKinds = (
  ...values: VerificationCheckKind[]
): readonly VerificationCheckKind[] => Object.freeze(values);
const inputKinds = (
  ...values: VerificationInputKind[]
): readonly VerificationInputKind[] => Object.freeze(values);
const artifactKinds = (
  ...values: VerificationArtifactKind[]
): readonly VerificationArtifactKind[] => Object.freeze(values);
export const GOLDEN_G3_V6_ADAPTER_FACTORY_SLOTS: readonly GoldenG3V6AdapterFactorySlot[] =
  Object.freeze([
    Object.freeze({
      id: 'diagnostics',
      adapterId: GOLDEN_G3_V6_ADAPTER_IDS.diagnostics,
      ownerPackage: '@prodivix/verification-adapters',
      executionBoundary: 'node',
      checkKinds: checkKinds('diagnostics'),
    }),
    Object.freeze({
      id: 'build',
      adapterId: GOLDEN_G3_V6_ADAPTER_IDS.build,
      ownerPackage: '@prodivix/verification-adapters',
      executionBoundary: 'node',
      checkKinds: checkKinds('build'),
    }),
    Object.freeze({
      id: 'unit',
      adapterId: GOLDEN_G3_V6_ADAPTER_IDS.unit,
      ownerPackage: '@prodivix/verification-adapters',
      executionBoundary: 'node',
      checkKinds: checkKinds('unit'),
    }),
    Object.freeze({
      id: 'integration',
      adapterId: GOLDEN_G3_V6_ADAPTER_IDS.integration,
      ownerPackage: '@prodivix/verification-adapters',
      executionBoundary: 'node',
      checkKinds: checkKinds('integration'),
    }),
    Object.freeze({
      id: 'browser',
      adapterId: GOLDEN_G3_V6_ADAPTER_IDS.browser,
      ownerPackage: '@prodivix/verification-browser',
      executionBoundary: 'browser',
      checkKinds: checkKinds(
        'e2e',
        'visual',
        'accessibility',
        'performance',
        'security'
      ),
    }),
  ] satisfies GoldenG3V6AdapterFactorySlot[]);

export const goldenG3V6AdapterFactorySlotForCheckKind = (
  checkKind: VerificationCheckKind
): GoldenG3V6AdapterFactorySlot => {
  const slot = GOLDEN_G3_V6_ADAPTER_FACTORY_SLOTS.find((candidate) =>
    candidate.checkKinds.includes(checkKind)
  );
  if (!slot) {
    throw new Error(
      `Golden V6 has no adapter factory slot for "${checkKind}".`
    );
  }
  return slot;
};

type GoldenG3V6CheckContract = Readonly<{
  inputKinds: readonly VerificationInputKind[];
  artifactKinds: readonly VerificationArtifactKind[];
}>;

const CHECK_CONTRACTS: Readonly<
  Record<VerificationCheckKind, GoldenG3V6CheckContract>
> = Object.freeze({
  diagnostics: Object.freeze({
    inputKinds: inputKinds('diagnostic-snapshot'),
    artifactKinds: artifactKinds('trace'),
  }),
  build: Object.freeze({
    inputKinds: inputKinds('executable-snapshot'),
    artifactKinds: artifactKinds('build-log'),
  }),
  unit: Object.freeze({
    inputKinds: inputKinds('test-report'),
    artifactKinds: artifactKinds('coverage-summary'),
  }),
  integration: Object.freeze({
    inputKinds: inputKinds('executable-snapshot', 'test-report'),
    artifactKinds: artifactKinds('coverage-summary', 'trace'),
  }),
  e2e: Object.freeze({
    inputKinds: inputKinds(
      'executable-snapshot',
      'scenario-program',
      'verification-profile'
    ),
    artifactKinds: artifactKinds(
      'replay-record',
      'trace',
      'network-summary',
      'console-summary'
    ),
  }),
  visual: Object.freeze({
    inputKinds: inputKinds(
      'executable-snapshot',
      'scenario-program',
      'baseline-set',
      'verification-profile'
    ),
    artifactKinds: artifactKinds('screenshot', 'visual-diff', 'replay-record'),
  }),
  accessibility: Object.freeze({
    inputKinds: inputKinds(
      'executable-snapshot',
      'scenario-program',
      'verification-profile'
    ),
    artifactKinds: artifactKinds('accessibility-report', 'replay-record'),
  }),
  performance: Object.freeze({
    inputKinds: inputKinds(
      'executable-snapshot',
      'scenario-program',
      'verification-profile'
    ),
    artifactKinds: artifactKinds('performance-profile', 'replay-record'),
  }),
  security: Object.freeze({
    inputKinds: inputKinds(
      'executable-snapshot',
      'scenario-program',
      'security-observation-set',
      'verification-profile'
    ),
    artifactKinds: artifactKinds(
      'security-report',
      'network-summary',
      'replay-record'
    ),
  }),
} satisfies Record<VerificationCheckKind, GoldenG3V6CheckContract>);

export const goldenG3V6CheckContractForKind = (
  checkKind: VerificationCheckKind
): GoldenG3V6CheckContract => CHECK_CONTRACTS[checkKind];

export const GOLDEN_G3_V6_ADAPTERS: readonly VerificationAdapterRegistration[] =
  Object.freeze(
    [
      ...FIRST_PARTY_STATIC_VERIFICATION_ADAPTER_REGISTRATIONS,
      FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_REGISTRATION,
    ].sort((left, right) =>
      compareVerificationText(left.identity.adapterId, right.identity.adapterId)
    )
  );

export const digestGoldenG3V6AdapterRegistry = (
  adapters: readonly VerificationAdapterRegistration[]
): string => createVerificationAdapterRegistrySnapshot(adapters).snapshotDigest;

export const GOLDEN_G3_V6_ADAPTER_REGISTRY_DIGEST =
  digestGoldenG3V6AdapterRegistry(GOLDEN_G3_V6_ADAPTERS);
