import { describe, expect, it } from 'vitest';
import {
  createVerificationAdapterCapabilityDigest,
  createVerificationAdapterDescriptorDigest,
  createVerificationAdapterRegistration,
  createVerificationAdapterRegistrySnapshot,
  matchVerificationAdapterRegistryEntry,
  normalizeVerificationAdapterDescriptor,
} from './verificationAdapterRegistry';
import { digestVerificationValue } from './verificationCanonical';
import type { VerificationAdapterDescriptor } from './verification.types';

const sha = (value: string): string => digestVerificationValue(value);

const descriptor = (
  id: string,
  checkKinds: VerificationAdapterDescriptor['checkKinds'] = ['unit']
): VerificationAdapterDescriptor => ({
  id,
  implementation: {
    packageName: '@prodivix/verification-test-adapter',
    packageVersion: '1.0.0',
    buildDigest: sha(`${id}:build`),
    toolchainDigest: sha(`${id}:toolchain`),
    schemaDigest: sha(`${id}:schema`),
  },
  checkKinds,
  surfaces: ['ci', 'preview'],
  targets: ['vue-vite', 'react-vite'],
  browserEngines: ['firefox', 'chromium'],
  controlCapabilities: ['control:z', 'control:a'],
  inputKinds: [
    'test-report',
    'security-observation-set',
    'executable-snapshot',
  ],
  artifactKinds: ['trace', 'coverage-summary'],
  budgets: {
    maximumDurationMs: 1_000,
    maximumArtifactBytes: 1_024,
    maximumEvents: 16,
  },
  trustInputs: ['remote-attested', 'local-unattested'],
});

describe('Verification adapter registry hard cut', () => {
  it('normalizes descriptor arrays and derives both identities in Core', () => {
    const normalized = normalizeVerificationAdapterDescriptor(
      descriptor('adapter:unit')
    );
    expect(normalized.targets).toEqual(['react-vite', 'vue-vite']);
    expect(normalized.controlCapabilities).toEqual(['control:a', 'control:z']);
    expect(normalized.inputKinds).toEqual([
      'executable-snapshot',
      'security-observation-set',
      'test-report',
    ]);
    const registration = createVerificationAdapterRegistration(normalized, {
      runtimeZones: ['worker:z', 'worker:a'],
    });
    expect(registration.identity).toEqual({
      adapterId: normalized.id,
      descriptorDigest: createVerificationAdapterDescriptorDigest(normalized),
      toolchainDigest: normalized.implementation.toolchainDigest,
      capabilityDigest: createVerificationAdapterCapabilityDigest(normalized),
    });
    expect(registration.runtimeZones).toEqual(['worker:a', 'worker:z']);
  });

  it('makes registry snapshots immutable and order independent', () => {
    const left = createVerificationAdapterRegistration(
      descriptor('adapter:left')
    );
    const right = createVerificationAdapterRegistration(
      descriptor('adapter:right', ['integration'])
    );
    const first = createVerificationAdapterRegistrySnapshot([left, right]);
    const second = createVerificationAdapterRegistrySnapshot([right, left]);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.entries)).toBe(true);
    expect(first.entries.map(({ descriptor: value }) => value.id)).toEqual([
      'adapter:left',
      'adapter:right',
    ]);
    expect(
      matchVerificationAdapterRegistryEntry(first, right.identity)?.descriptor
        .id
    ).toBe('adapter:right');
  });

  it('rejects unknown fields, duplicate ids, and caller identity drift', () => {
    expect(() =>
      normalizeVerificationAdapterDescriptor({
        ...descriptor('adapter:unknown'),
        vendorPayload: {},
      })
    ).toThrow(/unknown, missing, or unsafe/u);
    const registration = createVerificationAdapterRegistration(
      descriptor('adapter:drift')
    );
    expect(() =>
      createVerificationAdapterRegistrySnapshot([registration, registration])
    ).toThrow(/unique/u);
    expect(() =>
      createVerificationAdapterRegistrySnapshot([
        {
          ...registration,
          identity: {
            ...registration.identity,
            capabilityDigest: sha('forged-capability'),
          },
        },
      ])
    ).toThrow(/does not match/u);
    expect(() =>
      normalizeVerificationAdapterDescriptor({
        ...descriptor('adapter:over-budget'),
        budgets: {
          maximumDurationMs: 86_400_001,
          maximumArtifactBytes: 512 * 1024 * 1024 + 1,
          maximumEvents: 4_097,
        },
      })
    ).toThrow(/positive safe integer/u);
    expect(() =>
      normalizeVerificationAdapterDescriptor({
        ...descriptor('adapter:no-input'),
        inputKinds: [],
      })
    ).toThrow(/invalid number/u);
  });
});
