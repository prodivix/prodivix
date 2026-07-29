import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  digestVerificationValue,
  serializeVerificationValue,
} from './verificationCanonical';
import type {
  VerificationAdapterDescriptor,
  VerificationAdapterIdentity,
  VerificationAdapterKnownLimitation,
  VerificationAdapterRegistration,
  VerificationAdapterRegistryEntry,
  VerificationAdapterRegistrySnapshot,
  VerificationAdapterToolIdentity,
  VerificationArtifactKind,
  VerificationBrowserEngine,
  VerificationCheckKind,
  VerificationEvidenceTrust,
  VerificationInputKind,
  VerificationSurface,
} from './verification.types';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const PACKAGE_NAME_PATTERN =
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,127}$/u;
const hasControlCharacter = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

const CHECK_KINDS = new Set<VerificationCheckKind>([
  'diagnostics',
  'build',
  'unit',
  'integration',
  'e2e',
  'visual',
  'accessibility',
  'performance',
  'security',
]);
const SURFACES = new Set<VerificationSurface>(['preview', 'export', 'ci']);
const BROWSER_ENGINES = new Set<VerificationBrowserEngine>([
  'chromium',
  'firefox',
  'webkit',
]);
const INPUT_KINDS = new Set<VerificationInputKind>([
  'diagnostic-snapshot',
  'executable-snapshot',
  'scenario-program',
  'test-report',
  'baseline-set',
  'verification-profile',
  'security-observation-set',
]);
const ARTIFACT_KINDS = new Set<VerificationArtifactKind>([
  'screenshot',
  'visual-diff',
  'accessibility-report',
  'trace',
  'network-summary',
  'console-summary',
  'coverage-summary',
  'performance-profile',
  'security-report',
  'build-log',
  'replay-record',
]);
const TRUST_INPUTS = new Set<VerificationEvidenceTrust>([
  'local-unattested',
  'remote-attested',
  'ci-attested',
  'imported-untrusted',
]);

const exactRecord = (
  value: unknown,
  allowedKeys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const keys = Object.keys(value);
  if (
    keys.length !== allowedKeys.length ||
    keys.some((key) => isUnsafeObjectKey(key) || !allowedKeys.includes(key))
  ) {
    throw new TypeError(`${label} has unknown, missing, or unsafe fields.`);
  }
  return value;
};

const optionalExactRecord = (
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[],
  label: string
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const keys = Object.keys(value);
  if (
    requiredKeys.some((key) => !keys.includes(key)) ||
    keys.some(
      (key) =>
        isUnsafeObjectKey(key) ||
        (!requiredKeys.includes(key) && !optionalKeys.includes(key))
    )
  ) {
    throw new TypeError(`${label} has unknown, missing, or unsafe fields.`);
  }
  return value;
};

const canonicalText = (
  value: unknown,
  label: string,
  maximumLength = 256
): string => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximumLength ||
    value !== value.trim() ||
    value !== value.normalize('NFC') ||
    hasControlCharacter(value)
  ) {
    throw new TypeError(`${label} must be canonical text.`);
  }
  return value;
};

const token = (value: unknown, label: string): string => {
  const normalized = canonicalText(value, label);
  if (!TOKEN_PATTERN.test(normalized)) {
    throw new TypeError(`${label} must be a canonical identifier.`);
  }
  return normalized;
};

const digest = (value: unknown, label: string): string => {
  const normalized = canonicalText(value, label, 71);
  if (!DIGEST_PATTERN.test(normalized)) {
    throw new TypeError(`${label} must be a SHA-256 digest.`);
  }
  return normalized;
};

const canonicalArray = <T extends string>(
  value: unknown,
  allowed: ReadonlySet<T> | undefined,
  label: string,
  options: Readonly<{ minimum?: number; maximum?: number }> = {}
): readonly T[] => {
  const minimum = options.minimum ?? 0;
  const maximum = options.maximum ?? 256;
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new TypeError(`${label} has an invalid number of values.`);
  }
  const normalized = value.map((entry, index) => {
    const result = token(entry, `${label}[${index}]`) as T;
    if (allowed && !allowed.has(result)) {
      throw new TypeError(`${label}[${index}] is unsupported.`);
    }
    return result;
  });
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${label} must not contain duplicate values.`);
  }
  return Object.freeze([...normalized].sort(compareUnicodeCodePoints));
};

const positiveSafeInteger = (
  value: unknown,
  label: string,
  maximum = Number.MAX_SAFE_INTEGER
): number => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) <= 0 ||
    (value as number) > maximum
  ) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value as number;
};

const normalizeImplementation = (
  value: unknown
): VerificationAdapterDescriptor['implementation'] => {
  const record = exactRecord(
    value,
    [
      'packageName',
      'packageVersion',
      'buildDigest',
      'toolchainDigest',
      'schemaDigest',
    ],
    'Verification adapter implementation identity'
  );
  const packageName = canonicalText(record.packageName, 'packageName', 256);
  if (!PACKAGE_NAME_PATTERN.test(packageName)) {
    throw new TypeError('packageName is not a canonical package name.');
  }
  const packageVersion = canonicalText(
    record.packageVersion,
    'packageVersion',
    128
  );
  if (!VERSION_PATTERN.test(packageVersion)) {
    throw new TypeError('packageVersion is not canonical.');
  }
  return Object.freeze({
    packageName,
    packageVersion,
    buildDigest: digest(record.buildDigest, 'buildDigest'),
    toolchainDigest: digest(record.toolchainDigest, 'toolchainDigest'),
    schemaDigest: digest(record.schemaDigest, 'schemaDigest'),
  });
};

const normalizeBudgets = (
  value: unknown
): VerificationAdapterDescriptor['budgets'] => {
  const record = exactRecord(
    value,
    ['maximumDurationMs', 'maximumArtifactBytes', 'maximumEvents'],
    'Verification adapter budgets'
  );
  return Object.freeze({
    maximumDurationMs: positiveSafeInteger(
      record.maximumDurationMs,
      'maximumDurationMs',
      86_400_000
    ),
    maximumArtifactBytes: positiveSafeInteger(
      record.maximumArtifactBytes,
      'maximumArtifactBytes',
      512 * 1024 * 1024
    ),
    maximumEvents: positiveSafeInteger(
      record.maximumEvents,
      'maximumEvents',
      4_096
    ),
  });
};

export const normalizeVerificationAdapterDescriptor = (
  value: unknown
): VerificationAdapterDescriptor => {
  const record = exactRecord(
    value,
    [
      'id',
      'implementation',
      'checkKinds',
      'surfaces',
      'targets',
      'browserEngines',
      'controlCapabilities',
      'inputKinds',
      'artifactKinds',
      'budgets',
      'trustInputs',
    ],
    'Verification adapter descriptor'
  );
  return Object.freeze({
    id: token(record.id, 'Verification adapter id'),
    implementation: normalizeImplementation(record.implementation),
    checkKinds: canonicalArray(record.checkKinds, CHECK_KINDS, 'checkKinds', {
      minimum: 1,
    }),
    surfaces: canonicalArray(record.surfaces, SURFACES, 'surfaces', {
      minimum: 1,
    }),
    targets: canonicalArray(record.targets, undefined, 'targets', {
      minimum: 1,
    }),
    browserEngines: canonicalArray(
      record.browserEngines,
      BROWSER_ENGINES,
      'browserEngines'
    ),
    controlCapabilities: canonicalArray(
      record.controlCapabilities,
      undefined,
      'controlCapabilities',
      { maximum: 1_024 }
    ),
    inputKinds: canonicalArray(record.inputKinds, INPUT_KINDS, 'inputKinds', {
      minimum: 1,
    }),
    artifactKinds: canonicalArray(
      record.artifactKinds,
      ARTIFACT_KINDS,
      'artifactKinds'
    ),
    budgets: normalizeBudgets(record.budgets),
    trustInputs: canonicalArray(
      record.trustInputs,
      TRUST_INPUTS,
      'trustInputs',
      { minimum: 1 }
    ),
  });
};

const capabilityValue = (descriptor: VerificationAdapterDescriptor) =>
  Object.freeze({
    checkKinds: descriptor.checkKinds,
    surfaces: descriptor.surfaces,
    targets: descriptor.targets,
    browserEngines: descriptor.browserEngines,
    controlCapabilities: descriptor.controlCapabilities,
    inputKinds: descriptor.inputKinds,
    artifactKinds: descriptor.artifactKinds,
    budgets: descriptor.budgets,
    trustInputs: descriptor.trustInputs,
  });

export const createVerificationAdapterDescriptorDigest = (
  descriptor: VerificationAdapterDescriptor
): string =>
  digestVerificationValue(normalizeVerificationAdapterDescriptor(descriptor));

export const createVerificationAdapterCapabilityDigest = (
  descriptor: VerificationAdapterDescriptor
): string => {
  const normalized = normalizeVerificationAdapterDescriptor(descriptor);
  return digestVerificationValue(capabilityValue(normalized));
};

const identityForDescriptor = (
  descriptor: VerificationAdapterDescriptor
): VerificationAdapterIdentity =>
  Object.freeze({
    adapterId: descriptor.id,
    descriptorDigest: digestVerificationValue(descriptor),
    toolchainDigest: descriptor.implementation.toolchainDigest,
    capabilityDigest: digestVerificationValue(capabilityValue(descriptor)),
  });

const normalizeTool = (
  value: unknown,
  descriptor: VerificationAdapterDescriptor
): VerificationAdapterToolIdentity => {
  if (value === undefined) {
    return Object.freeze({
      name: descriptor.implementation.packageName,
      version: descriptor.implementation.packageVersion,
      schemaVersion: 1,
      schemaDigest: descriptor.implementation.schemaDigest,
    });
  }
  const record = exactRecord(
    value,
    ['name', 'version', 'schemaVersion', 'schemaDigest'],
    'Verification adapter tool identity'
  );
  const name = canonicalText(record.name, 'tool.name');
  const version = canonicalText(record.version, 'tool.version', 128);
  if (!VERSION_PATTERN.test(version)) {
    throw new TypeError('tool.version is not canonical.');
  }
  return Object.freeze({
    name,
    version,
    schemaVersion: positiveSafeInteger(
      record.schemaVersion,
      'tool.schemaVersion'
    ),
    schemaDigest: digest(record.schemaDigest, 'tool.schemaDigest'),
  });
};

const normalizeLimitation = (
  value: unknown,
  index: number
): VerificationAdapterKnownLimitation => {
  const record = exactRecord(
    value,
    [
      'code',
      'messageKey',
      'checkKinds',
      'surfaces',
      'targets',
      'browserEngines',
    ],
    `knownLimitations[${index}]`
  );
  return Object.freeze({
    code: token(record.code, `knownLimitations[${index}].code`),
    messageKey: token(
      record.messageKey,
      `knownLimitations[${index}].messageKey`
    ),
    checkKinds: canonicalArray(
      record.checkKinds,
      CHECK_KINDS,
      `knownLimitations[${index}].checkKinds`
    ),
    surfaces: canonicalArray(
      record.surfaces,
      SURFACES,
      `knownLimitations[${index}].surfaces`
    ),
    targets: canonicalArray(
      record.targets,
      undefined,
      `knownLimitations[${index}].targets`
    ),
    browserEngines: canonicalArray(
      record.browserEngines,
      BROWSER_ENGINES,
      `knownLimitations[${index}].browserEngines`
    ),
  });
};

const normalizeRegistration = (
  value: VerificationAdapterRegistration
): VerificationAdapterRegistryEntry => {
  const record = optionalExactRecord(
    value,
    ['descriptor', 'identity'],
    ['tool', 'runtimeZones', 'knownLimitations'],
    'Verification adapter registration'
  );
  const descriptor = normalizeVerificationAdapterDescriptor(record.descriptor);
  const expectedIdentity = identityForDescriptor(descriptor);
  const identity = exactRecord(
    record.identity,
    ['adapterId', 'descriptorDigest', 'toolchainDigest', 'capabilityDigest'],
    'Verification adapter identity'
  );
  const suppliedIdentity: VerificationAdapterIdentity = Object.freeze({
    adapterId: token(identity.adapterId, 'adapterIdentity.adapterId'),
    descriptorDigest: digest(
      identity.descriptorDigest,
      'adapterIdentity.descriptorDigest'
    ),
    toolchainDigest: digest(
      identity.toolchainDigest,
      'adapterIdentity.toolchainDigest'
    ),
    capabilityDigest: digest(
      identity.capabilityDigest,
      'adapterIdentity.capabilityDigest'
    ),
  });
  if (!sameCanonicalJson(suppliedIdentity, expectedIdentity)) {
    throw new TypeError(
      `Adapter "${descriptor.id}" identity does not match its canonical descriptor.`
    );
  }
  const knownLimitations = (
    record.knownLimitations === undefined ? [] : record.knownLimitations
  ) as unknown;
  if (!Array.isArray(knownLimitations) || knownLimitations.length > 256) {
    throw new TypeError('knownLimitations is invalid or over budget.');
  }
  const normalizedLimitations = knownLimitations
    .map(normalizeLimitation)
    .sort(
      (left, right) =>
        compareUnicodeCodePoints(left.code, right.code) ||
        compareUnicodeCodePoints(
          serializeVerificationValue(left),
          serializeVerificationValue(right)
        )
    );
  if (
    new Set(normalizedLimitations.map(({ code }) => code)).size !==
    normalizedLimitations.length
  ) {
    throw new TypeError('knownLimitations contains duplicate codes.');
  }
  return Object.freeze({
    descriptor,
    descriptorDigest: expectedIdentity.descriptorDigest,
    capabilityDigest: expectedIdentity.capabilityDigest,
    tool: normalizeTool(record.tool, descriptor),
    runtimeZones: canonicalArray(
      record.runtimeZones ?? [],
      undefined,
      'runtimeZones'
    ),
    knownLimitations: Object.freeze(normalizedLimitations),
  });
};

export const createVerificationAdapterRegistration = (
  descriptor: VerificationAdapterDescriptor,
  options: Readonly<{
    tool?: VerificationAdapterToolIdentity;
    runtimeZones?: readonly string[];
    knownLimitations?: readonly VerificationAdapterKnownLimitation[];
  }> = {}
): VerificationAdapterRegistration => {
  const normalizedDescriptor =
    normalizeVerificationAdapterDescriptor(descriptor);
  const entry = normalizeRegistration({
    descriptor: normalizedDescriptor,
    identity: identityForDescriptor(normalizedDescriptor),
    ...options,
  });
  return Object.freeze({
    descriptor: entry.descriptor,
    identity: Object.freeze({
      adapterId: entry.descriptor.id,
      descriptorDigest: entry.descriptorDigest,
      toolchainDigest: entry.descriptor.implementation.toolchainDigest,
      capabilityDigest: entry.capabilityDigest,
    }),
    tool: entry.tool,
    runtimeZones: entry.runtimeZones,
    knownLimitations: entry.knownLimitations,
  });
};

export const createVerificationAdapterRegistrySnapshot = (
  registrations: readonly VerificationAdapterRegistration[]
): VerificationAdapterRegistrySnapshot => {
  if (!Array.isArray(registrations) || registrations.length > 256) {
    throw new TypeError(
      'Verification adapter registrations are invalid or over budget.'
    );
  }
  const entries = registrations
    .map(normalizeRegistration)
    .sort((left, right) =>
      compareUnicodeCodePoints(left.descriptor.id, right.descriptor.id)
    );
  if (
    new Set(entries.map(({ descriptor }) => descriptor.id)).size !==
    entries.length
  ) {
    throw new TypeError('Verification adapter ids must be unique.');
  }
  const frozenEntries = Object.freeze(entries);
  return Object.freeze({
    entries: frozenEntries,
    snapshotDigest: digestVerificationValue(frozenEntries),
  });
};

export const verificationAdapterRegistrationFromEntry = (
  entry: VerificationAdapterRegistryEntry
): VerificationAdapterRegistration =>
  Object.freeze({
    descriptor: entry.descriptor,
    identity: Object.freeze({
      adapterId: entry.descriptor.id,
      descriptorDigest: entry.descriptorDigest,
      toolchainDigest: entry.descriptor.implementation.toolchainDigest,
      capabilityDigest: entry.capabilityDigest,
    }),
    tool: entry.tool,
    runtimeZones: entry.runtimeZones,
    knownLimitations: entry.knownLimitations,
  });

export const matchVerificationAdapterRegistryEntry = (
  snapshot: VerificationAdapterRegistrySnapshot,
  identity: VerificationAdapterIdentity
): VerificationAdapterRegistryEntry | undefined => {
  const reconstructed = createVerificationAdapterRegistrySnapshot(
    snapshot.entries.map(verificationAdapterRegistrationFromEntry)
  );
  if (reconstructed.snapshotDigest !== snapshot.snapshotDigest) {
    return undefined;
  }
  return reconstructed.entries.find(
    (entry) =>
      entry.descriptor.id === identity.adapterId &&
      entry.descriptorDigest === identity.descriptorDigest &&
      entry.capabilityDigest === identity.capabilityDigest &&
      entry.descriptor.implementation.toolchainDigest ===
        identity.toolchainDigest
  );
};
