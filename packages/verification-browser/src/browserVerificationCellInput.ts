import { bytesToHex } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import type {
  VerificationAdapterInputRef,
  VerificationPlanCell,
} from '@prodivix/verification';
import {
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  BrowserPrivatePayloadError,
  decodePrivateJson,
  strictArray,
  strictEnum,
  strictFiniteNumber,
  strictIdentifier,
  strictObject,
  strictSafeInteger,
  strictSha256Digest,
} from './privateBoundary';
import { decodeKeyboardFocusJourneySpec } from './accessibilityKeyboard';
import {
  createPerformancePolicyDigest,
  type PerformancePolicyProfile,
} from './performance';
import {
  createBrowserSecurityPolicyDigest,
  type BrowserSecurityPolicyProfile,
} from './security';
import {
  BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
  BROWSER_VERIFICATION_CELL_INPUT_VERSION,
  BROWSER_VERIFICATION_PROFILE_MEDIA_TYPE,
  type BrowserAccessibilityCellProfile,
  type BrowserE2eCellProfile,
  type BrowserPerformanceCellProfile,
  type BrowserSecurityCellProfile,
  type BrowserVerificationCellInput,
  type BrowserVerificationCellProfile,
  type BrowserVisualCellProfile,
} from './browserAdapter.types';
import { assertBrowserVerificationPlainData } from './browserVerificationPlainData';
import {
  createVisualBaselineCompatibilityKey,
  type AuthoredSemanticMask,
  type VisualDifferenceThreshold,
} from './visualComparison';

const MAXIMUM_PROFILE_BYTES = BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumInputBytes;
const PROFILE_CHECK_KINDS = [
  'e2e',
  'visual',
  'accessibility',
  'performance',
  'security',
] as const;

const fail = (path: string, message: string): never => {
  throw new BrowserPrivatePayloadError('invalid-field', path, message);
};

const sourceText = (source: string | Uint8Array): string =>
  typeof source === 'string'
    ? source
    : new TextDecoder('utf-8', { fatal: true }).decode(source);

const sortedDigests = (value: unknown, path: string): readonly string[] => {
  const values = strictArray(value, path, 256).map((entry, index) =>
    strictSha256Digest(entry, `${path}[${index}]`)
  );
  if (new Set(values).size !== values.length) {
    fail(path, `${path} cannot contain duplicate digests.`);
  }
  return Object.freeze([...values].sort(compareUnicodeCodePoints));
};

export { assertBrowserVerificationPlainData } from './browserVerificationPlainData';

const decodeE2eProfile = (value: unknown): BrowserE2eCellProfile => {
  const profile = strictObject(value, '$.profile', [
    'kind',
    'scenarioId',
    'programDigest',
  ]);
  return Object.freeze({
    kind: strictEnum(profile.kind, '$.profile.kind', ['e2e'] as const),
    scenarioId: strictIdentifier(profile.scenarioId, '$.profile.scenarioId'),
    programDigest: strictSha256Digest(
      profile.programDigest,
      '$.profile.programDigest'
    ),
  });
};

const decodeThreshold = (value: unknown): VisualDifferenceThreshold => {
  const threshold = strictObject(value, '$.profile.threshold', [
    'maximumChannelDelta',
    'maximumChangedPixels',
    'maximumChangedRatio',
  ]);
  return Object.freeze({
    maximumChannelDelta: strictSafeInteger(
      threshold.maximumChannelDelta,
      '$.profile.threshold.maximumChannelDelta',
      { minimum: 0, maximum: 255 }
    ),
    maximumChangedPixels: strictSafeInteger(
      threshold.maximumChangedPixels,
      '$.profile.threshold.maximumChangedPixels',
      {
        minimum: 0,
        maximum: BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumVisualPixels,
      }
    ),
    maximumChangedRatio: strictFiniteNumber(
      threshold.maximumChangedRatio,
      '$.profile.threshold.maximumChangedRatio',
      { minimum: 0, maximum: 1 }
    ),
  });
};

const decodeMasks = (
  value: unknown,
  width: number,
  height: number
): readonly AuthoredSemanticMask[] => {
  const masks = strictArray(
    value,
    '$.profile.masks',
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumVisualMasks
  ).map((entry, index) => {
    const path = `$.profile.masks[${index}]`;
    const mask = strictObject(entry, path, [
      'maskId',
      'semanticTargetId',
      'authoredByPolicyDigest',
      'reasonCode',
      'region',
    ]);
    const region = strictObject(mask.region, `${path}.region`, [
      'x',
      'y',
      'width',
      'height',
    ]);
    const x = strictSafeInteger(region.x, `${path}.region.x`, {
      minimum: 0,
      maximum: width - 1,
    });
    const y = strictSafeInteger(region.y, `${path}.region.y`, {
      minimum: 0,
      maximum: height - 1,
    });
    const regionWidth = strictSafeInteger(
      region.width,
      `${path}.region.width`,
      { minimum: 1, maximum: width }
    );
    const regionHeight = strictSafeInteger(
      region.height,
      `${path}.region.height`,
      { minimum: 1, maximum: height }
    );
    if (x + regionWidth > width || y + regionHeight > height) {
      fail(`${path}.region`, 'Visual mask must stay within the raster bounds.');
    }
    return Object.freeze({
      maskId: strictIdentifier(mask.maskId, `${path}.maskId`),
      semanticTargetId: strictIdentifier(
        mask.semanticTargetId,
        `${path}.semanticTargetId`
      ),
      authoredByPolicyDigest: strictSha256Digest(
        mask.authoredByPolicyDigest,
        `${path}.authoredByPolicyDigest`
      ),
      reasonCode: strictIdentifier(mask.reasonCode, `${path}.reasonCode`),
      region: Object.freeze({
        x,
        y,
        width: regionWidth,
        height: regionHeight,
      }),
    });
  });
  const ids = masks.map(({ maskId }) => maskId);
  if (new Set(ids).size !== ids.length) {
    fail('$.profile.masks', 'Visual mask ids must be unique.');
  }
  return Object.freeze(
    [...masks].sort((left, right) =>
      compareUnicodeCodePoints(left.maskId, right.maskId)
    )
  );
};

const decodeVisualProfile = (value: unknown): BrowserVisualCellProfile => {
  const profile = strictObject(
    value,
    '$.profile',
    [
      'kind',
      'observationId',
      'stepId',
      'targetId',
      'captureTargetId',
      'baseline',
      'threshold',
      'masks',
    ],
    ['sourceTraceDigest']
  );
  strictEnum(profile.kind, '$.profile.kind', ['visual'] as const);
  const baseline = strictObject(profile.baseline, '$.profile.baseline', [
    'rasterDigest',
    'profile',
  ]);
  const baselineProfile =
    baseline.profile as BrowserVisualCellProfile['baseline']['profile'];
  createVisualBaselineCompatibilityKey(baselineProfile);
  const width = Math.round(
    baselineProfile.captureRegion.widthCssPixels *
      baselineProfile.viewport.devicePixelRatio
  );
  const height = Math.round(
    baselineProfile.captureRegion.heightCssPixels *
      baselineProfile.viewport.devicePixelRatio
  );
  if (
    width < 1 ||
    height < 1 ||
    width * height > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumVisualPixels
  ) {
    fail(
      '$.profile.baseline.profile.viewport',
      'Visual raster size is invalid.'
    );
  }
  const sourceTraceDigest =
    profile.sourceTraceDigest === undefined
      ? undefined
      : strictSha256Digest(
          profile.sourceTraceDigest,
          '$.profile.sourceTraceDigest'
        );
  return Object.freeze({
    kind: 'visual',
    observationId: strictIdentifier(
      profile.observationId,
      '$.profile.observationId'
    ),
    stepId: strictIdentifier(profile.stepId, '$.profile.stepId'),
    targetId: strictIdentifier(profile.targetId, '$.profile.targetId'),
    captureTargetId: strictIdentifier(
      profile.captureTargetId,
      '$.profile.captureTargetId'
    ),
    ...(sourceTraceDigest === undefined ? {} : { sourceTraceDigest }),
    baseline: Object.freeze({
      rasterDigest: strictSha256Digest(
        baseline.rasterDigest,
        '$.profile.baseline.rasterDigest'
      ),
      profile: baselineProfile,
    }),
    threshold: decodeThreshold(profile.threshold),
    masks: decodeMasks(profile.masks, width, height),
  });
};

const decodeAccessibilityProfile = (
  value: unknown
): BrowserAccessibilityCellProfile => {
  const profile = strictObject(value, '$.profile', [
    'kind',
    'scanTargetId',
    'keyboardFocusJourney',
  ]);
  strictEnum(profile.kind, '$.profile.kind', ['accessibility'] as const);
  const keyboardFocusJourney = decodeKeyboardFocusJourneySpec(
    profile.keyboardFocusJourney,
    '$.profile.keyboardFocusJourney'
  );
  return Object.freeze({
    kind: 'accessibility',
    scanTargetId: strictIdentifier(
      profile.scanTargetId,
      '$.profile.scanTargetId'
    ),
    keyboardFocusJourney,
  });
};

const decodePerformanceProfile = (
  value: unknown
): BrowserPerformanceCellProfile => {
  const profile = strictObject(value, '$.profile', [
    'kind',
    'profileDigest',
    'policy',
  ]);
  strictEnum(profile.kind, '$.profile.kind', ['performance'] as const);
  const policy = profile.policy as PerformancePolicyProfile;
  const profileDigest = strictSha256Digest(
    profile.profileDigest,
    '$.profile.profileDigest'
  );
  if (createPerformancePolicyDigest(policy) !== profileDigest) {
    fail(
      '$.profile.profileDigest',
      'Performance profile digest does not match its exact policy.'
    );
  }
  return Object.freeze({
    kind: 'performance',
    profileDigest,
    policy,
  });
};

const decodeSecurityProfile = (value: unknown): BrowserSecurityCellProfile => {
  const profile = strictObject(value, '$.profile', [
    'kind',
    'profileDigest',
    'observationSetDigest',
    'policy',
  ]);
  strictEnum(profile.kind, '$.profile.kind', ['security'] as const);
  const policy = profile.policy as BrowserSecurityPolicyProfile;
  const profileDigest = strictSha256Digest(
    profile.profileDigest,
    '$.profile.profileDigest'
  );
  if (createBrowserSecurityPolicyDigest(policy) !== profileDigest) {
    fail(
      '$.profile.profileDigest',
      'Security profile digest does not match its exact policy.'
    );
  }
  return Object.freeze({
    kind: 'security',
    profileDigest,
    observationSetDigest: strictSha256Digest(
      profile.observationSetDigest,
      '$.profile.observationSetDigest'
    ),
    policy,
  });
};

const decodeProfile = (
  value: unknown,
  kind: BrowserVerificationCellInput['checkKind']
): BrowserVerificationCellProfile => {
  switch (kind) {
    case 'e2e':
      return decodeE2eProfile(value);
    case 'visual':
      return decodeVisualProfile(value);
    case 'accessibility':
      return decodeAccessibilityProfile(value);
    case 'performance':
      return decodePerformanceProfile(value);
    case 'security':
      return decodeSecurityProfile(value);
  }
};

export const decodeBrowserVerificationCellInput = (
  source: string | Uint8Array | unknown
): BrowserVerificationCellInput => {
  if (typeof source !== 'string' && !(source instanceof Uint8Array)) {
    assertBrowserVerificationPlainData(source, '$');
  }
  if (
    (typeof source === 'string' &&
      new TextEncoder().encode(source).byteLength > MAXIMUM_PROFILE_BYTES) ||
    (source instanceof Uint8Array && source.byteLength > MAXIMUM_PROFILE_BYTES)
  ) {
    throw new BrowserPrivatePayloadError(
      'input-too-large',
      '$',
      `Browser verification profile exceeds ${MAXIMUM_PROFILE_BYTES} bytes.`
    );
  }
  const decoded = decodePrivateJson(source, 'Browser verification profile');
  const root = strictObject(
    decoded,
    '$',
    [
      'format',
      'version',
      'cellId',
      'checkKind',
      'scenarioId',
      'targetId',
      'frameworkTarget',
      'surface',
      'browserEngine',
      'viewport',
      'colorScheme',
      'motion',
      'locale',
      'executableSnapshotDigest',
      'scenarioProgramDigest',
      'controlProfileDigest',
      'fixtureSetDigests',
      'targetLeaseBindingDigest',
      'profile',
    ],
    ['baselineSetDigest']
  );
  if (
    root.format !== BROWSER_VERIFICATION_CELL_INPUT_FORMAT ||
    root.version !== BROWSER_VERIFICATION_CELL_INPUT_VERSION
  ) {
    fail('$', 'Browser verification profile format or version is unsupported.');
  }
  const checkKind = strictEnum(
    root.checkKind,
    '$.checkKind',
    PROFILE_CHECK_KINDS
  );
  const viewport = strictObject(root.viewport, '$.viewport', [
    'width',
    'height',
  ]);
  const baselineSetDigest =
    root.baselineSetDigest === undefined
      ? undefined
      : strictSha256Digest(root.baselineSetDigest, '$.baselineSetDigest');
  if ((checkKind === 'visual') !== (baselineSetDigest !== undefined)) {
    fail(
      '$.baselineSetDigest',
      'Only visual profiles require an exact Baseline Set digest.'
    );
  }
  const profile = decodeProfile(root.profile, checkKind);
  if (profile.kind !== checkKind) {
    fail('$.profile.kind', 'Browser profile kind drifted from checkKind.');
  }
  const normalized = Object.freeze({
    format: BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
    version: BROWSER_VERIFICATION_CELL_INPUT_VERSION,
    cellId: strictIdentifier(root.cellId, '$.cellId'),
    checkKind,
    scenarioId: strictIdentifier(root.scenarioId, '$.scenarioId'),
    targetId: strictIdentifier(root.targetId, '$.targetId'),
    frameworkTarget: strictIdentifier(
      root.frameworkTarget,
      '$.frameworkTarget'
    ),
    surface: strictEnum(root.surface, '$.surface', [
      'preview',
      'export',
      'ci',
    ] as const),
    browserEngine: strictEnum(root.browserEngine, '$.browserEngine', [
      'chromium',
      'firefox',
      'webkit',
    ] as const),
    viewport: Object.freeze({
      width: strictSafeInteger(viewport.width, '$.viewport.width', {
        minimum: 1,
        maximum: 16_384,
      }),
      height: strictSafeInteger(viewport.height, '$.viewport.height', {
        minimum: 1,
        maximum: 16_384,
      }),
    }),
    colorScheme: strictEnum(root.colorScheme, '$.colorScheme', [
      'light',
      'dark',
    ] as const),
    motion: strictEnum(root.motion, '$.motion', ['full', 'reduced'] as const),
    locale: strictIdentifier(root.locale, '$.locale'),
    executableSnapshotDigest: strictSha256Digest(
      root.executableSnapshotDigest,
      '$.executableSnapshotDigest'
    ),
    scenarioProgramDigest: strictSha256Digest(
      root.scenarioProgramDigest,
      '$.scenarioProgramDigest'
    ),
    controlProfileDigest: strictSha256Digest(
      root.controlProfileDigest,
      '$.controlProfileDigest'
    ),
    fixtureSetDigests: sortedDigests(
      root.fixtureSetDigests,
      '$.fixtureSetDigests'
    ),
    ...(baselineSetDigest === undefined ? {} : { baselineSetDigest }),
    targetLeaseBindingDigest: strictSha256Digest(
      root.targetLeaseBindingDigest,
      '$.targetLeaseBindingDigest'
    ),
    profile,
  });
  if (typeof source === 'string' || source instanceof Uint8Array) {
    if (canonicalJsonText(normalized) !== sourceText(source)) {
      throw new BrowserPrivatePayloadError(
        'invalid-json',
        '$',
        'Browser verification profile bytes must use canonical JSON.'
      );
    }
  }
  return normalized;
};

export const assertBrowserVerificationCellInputCoordinates = (
  input: BrowserVerificationCellInput,
  cell: VerificationPlanCell,
  context: Readonly<{
    executableSnapshotDigest: string;
    scenarioProgramDigest?: string;
    controlProfileDigest: string;
    fixtureSetDigests: readonly string[];
    baselineSetDigest?: string;
  }>
): void => {
  const expectedFixtures = [...context.fixtureSetDigests].sort(
    compareUnicodeCodePoints
  );
  if (
    input.cellId !== cell.id ||
    input.checkKind !== cell.checkKind ||
    input.scenarioId !== cell.scenarioId ||
    input.targetId !== cell.targetId ||
    input.frameworkTarget !== cell.frameworkTarget ||
    input.surface !== cell.surface ||
    input.browserEngine !== cell.browserEngine ||
    input.viewport.width !== cell.viewport.width ||
    input.viewport.height !== cell.viewport.height ||
    input.colorScheme !== cell.colorScheme ||
    input.motion !== cell.motion ||
    input.locale !== cell.locale ||
    input.executableSnapshotDigest !== context.executableSnapshotDigest ||
    input.scenarioProgramDigest !== context.scenarioProgramDigest ||
    input.controlProfileDigest !== context.controlProfileDigest ||
    input.baselineSetDigest !== context.baselineSetDigest ||
    input.fixtureSetDigests.length !== expectedFixtures.length ||
    input.fixtureSetDigests.some(
      (digest, index) => digest !== expectedFixtures[index]
    )
  ) {
    fail('$', 'Browser verification profile drifted from its Core-bound cell.');
  }
};

export const encodeBrowserVerificationCellInput = (
  input: BrowserVerificationCellInput
): Uint8Array => {
  const normalized = decodeBrowserVerificationCellInput(input);
  const bytes = new TextEncoder().encode(canonicalJsonText(normalized));
  if (bytes.byteLength > MAXIMUM_PROFILE_BYTES) {
    throw new BrowserPrivatePayloadError(
      'input-too-large',
      '$',
      `Browser verification profile exceeds ${MAXIMUM_PROFILE_BYTES} bytes.`
    );
  }
  return bytes;
};

export const digestBrowserVerificationBytes = (bytes: Uint8Array): string =>
  `sha256-${bytesToHex(sha256(bytes))}`;

export const createBrowserVerificationProfileInputRef = (
  id: string,
  input: BrowserVerificationCellInput
): Readonly<{
  ref: VerificationAdapterInputRef;
  bytes: Uint8Array;
}> => {
  const canonicalId = strictIdentifier(id, '$.id');
  const bytes = encodeBrowserVerificationCellInput(input);
  return Object.freeze({
    ref: Object.freeze({
      id: canonicalId,
      kind: 'verification-profile',
      digest: digestBrowserVerificationBytes(bytes),
      size: bytes.byteLength,
      mediaType: BROWSER_VERIFICATION_PROFILE_MEDIA_TYPE,
    }),
    bytes,
  });
};
