import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  digestBehaviorValue,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  decodeVerificationBaselineSet,
  encodeVerificationBaselineSet,
  digestVerificationValue,
  type VerificationAdapterInputRef,
  type VerificationBaselineEntry,
  type VerificationBaselineSet,
} from '@prodivix/verification';
import {
  BROWSER_BASELINE_SET_MEDIA_TYPE,
  BROWSER_SCENARIO_PROGRAM_MEDIA_TYPE,
  type BrowserVerificationCellInput,
} from './browserAdapter.types';
import { assertBrowserVerificationPlainData } from './browserVerificationPlainData';
import {
  BrowserPrivatePayloadError,
  decodePrivateJson,
  strictIdentifier,
} from './privateBoundary';
import { createVisualBaselineCompatibilityKey } from './visualComparison';

const PROGRAM_KEYS = Object.freeze(
  [
    'scenarioId',
    'scenarioDigest',
    'workspaceRevision',
    'semanticSnapshotDigest',
    'executableSnapshotDigest',
    'compilerDigest',
    'registryDigest',
    'controlProfileDigest',
    'fixtureSetDigests',
    'baselineSetDigests',
    'requiredCapabilities',
    'capabilityManifest',
    'targetManifest',
    'instructions',
    'observations',
    'sourceTrace',
    'budgets',
    'programDigest',
  ].sort(compareUnicodeCodePoints)
);

const sourceText = (source: string | Uint8Array): string =>
  typeof source === 'string'
    ? source
    : new TextDecoder('utf-8', { fatal: true }).decode(source);

const decodeCanonicalJson = (
  source: string | Uint8Array,
  label: string
): unknown => {
  const decoded = decodePrivateJson(source, label);
  assertBrowserVerificationPlainData(decoded, '$');
  if (canonicalJsonText(decoded) !== sourceText(source)) {
    throw new BrowserPrivatePayloadError(
      'invalid-json',
      '$',
      `${label} bytes must use canonical JSON.`
    );
  }
  return decoded;
};

const sameDigestSet = (
  left: readonly string[],
  right: readonly string[]
): boolean => {
  const leftSorted = [...left].sort(compareUnicodeCodePoints);
  const rightSorted = [...right].sort(compareUnicodeCodePoints);
  return sameCanonicalJson(leftSorted, rightSorted);
};

export const decodeBrowserScenarioProgram = (
  source: string | Uint8Array
): BehaviorScenarioProgram => {
  const decoded = decodeCanonicalJson(
    source,
    'Behavior Scenario Program input'
  );
  if (
    decoded === null ||
    typeof decoded !== 'object' ||
    Array.isArray(decoded) ||
    !sameCanonicalJson(
      Object.keys(decoded).sort(compareUnicodeCodePoints),
      PROGRAM_KEYS
    )
  ) {
    throw new BrowserPrivatePayloadError(
      'invalid-field',
      '$',
      'Behavior Scenario Program fields drifted.'
    );
  }
  const program = decoded as BehaviorScenarioProgram;
  const { programDigest, ...withoutDigest } = program;
  if (
    typeof programDigest !== 'string' ||
    digestBehaviorValue(withoutDigest) !== programDigest
  ) {
    throw new BrowserPrivatePayloadError(
      'result-drift',
      '$.programDigest',
      'Behavior Scenario Program content address drifted.'
    );
  }
  return Object.freeze(program);
};

export const assertBrowserScenarioProgramBinding = (
  program: BehaviorScenarioProgram,
  profile: BrowserVerificationCellInput,
  expected: Readonly<{
    executableSnapshotDigest: string;
    scenarioProgramDigest?: string;
    controlProfileDigest: string;
    fixtureSetDigests: readonly string[];
  }>
): void => {
  if (
    program.programDigest !== profile.scenarioProgramDigest ||
    program.programDigest !== expected.scenarioProgramDigest ||
    program.scenarioId !== profile.scenarioId ||
    program.executableSnapshotDigest !== expected.executableSnapshotDigest ||
    program.controlProfileDigest !== expected.controlProfileDigest ||
    !sameDigestSet(program.fixtureSetDigests, expected.fixtureSetDigests) ||
    (profile.profile.kind === 'e2e' &&
      (profile.profile.scenarioId !== program.scenarioId ||
        profile.profile.programDigest !== program.programDigest))
  ) {
    throw new BrowserPrivatePayloadError(
      'result-drift',
      '$',
      'Behavior Scenario Program drifted from its Core-bound cell.'
    );
  }
};

export const decodeBrowserBaselineSet = (
  source: string | Uint8Array
): VerificationBaselineSet => {
  const decoded = decodeCanonicalJson(
    source,
    'Verification Baseline Set input'
  );
  const result = decodeVerificationBaselineSet(decoded);
  if (!result.ok) {
    throw new BrowserPrivatePayloadError(
      'invalid-field',
      '$',
      `Verification Baseline Set is invalid: ${result.issues
        .map(({ message }) => message)
        .join('; ')}`
    );
  }
  return result.value;
};

export const selectBrowserVisualBaselineEntry = (
  baselineSet: VerificationBaselineSet,
  profile:
    | Extract<BrowserVerificationCellInput, Readonly<{ checkKind: 'visual' }>>
    | BrowserVerificationCellInput
): VerificationBaselineEntry => {
  if (profile.profile.kind !== 'visual') {
    throw new TypeError('Visual baseline selection requires a visual profile.');
  }
  const visualProfile = profile.profile;
  const baselineProfile = visualProfile.baseline.profile;
  const normalizerDigest = digestVerificationValue(baselineProfile.normalizer);
  const compatibilityProfileDigest =
    createVisualBaselineCompatibilityKey(baselineProfile);
  const matches = baselineSet.entries.filter(
    (entry) =>
      entry.scenarioId === profile.scenarioId &&
      entry.stepId === visualProfile.stepId &&
      entry.targetId === visualProfile.targetId &&
      entry.frameworkTarget === profile.frameworkTarget &&
      entry.surface === profile.surface &&
      entry.browserEngine === profile.browserEngine &&
      entry.viewport.width === profile.viewport.width &&
      entry.viewport.height === profile.viewport.height &&
      entry.colorScheme === profile.colorScheme &&
      entry.motion === profile.motion &&
      entry.locale === profile.locale &&
      entry.devicePixelRatio === baselineProfile.viewport.devicePixelRatio &&
      entry.normalizerDigest === normalizerDigest &&
      entry.compatibilityProfileDigest === compatibilityProfileDigest &&
      entry.asset.mediaType === 'image/png'
  );
  if (matches.length !== 1) {
    throw new BrowserPrivatePayloadError(
      'result-drift',
      '$.entries',
      'Verification Baseline Set must contain exactly one matching visual entry.'
    );
  }
  return matches[0]!;
};

const digestBytes = (bytes: Uint8Array): string =>
  `sha256-${bytesToHex(sha256(bytes))}`;

const createInputRef = (
  id: string,
  kind: 'scenario-program' | 'baseline-set',
  mediaType: string,
  bytes: Uint8Array
): Readonly<{ ref: VerificationAdapterInputRef; bytes: Uint8Array }> =>
  Object.freeze({
    ref: Object.freeze({
      id: strictIdentifier(id, '$.id'),
      kind,
      digest: digestBytes(bytes),
      size: bytes.byteLength,
      mediaType,
    }),
    bytes,
  });

export const createBrowserScenarioProgramInputRef = (
  id: string,
  program: BehaviorScenarioProgram
): Readonly<{ ref: VerificationAdapterInputRef; bytes: Uint8Array }> => {
  const bytes = new TextEncoder().encode(canonicalJsonText(program));
  decodeBrowserScenarioProgram(bytes);
  return createInputRef(
    id,
    'scenario-program',
    BROWSER_SCENARIO_PROGRAM_MEDIA_TYPE,
    bytes
  );
};

export const createBrowserBaselineSetInputRef = (
  id: string,
  baselineSet: VerificationBaselineSet
): Readonly<{ ref: VerificationAdapterInputRef; bytes: Uint8Array }> => {
  const bytes = new TextEncoder().encode(
    canonicalJsonText(encodeVerificationBaselineSet(baselineSet))
  );
  decodeBrowserBaselineSet(bytes);
  return createInputRef(
    id,
    'baseline-set',
    BROWSER_BASELINE_SET_MEDIA_TYPE,
    bytes
  );
};
