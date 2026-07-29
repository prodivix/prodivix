import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  BrowserPrivatePayloadError,
  decodePrivateJson,
  strictEnum,
  strictFiniteNumber,
  strictIdentifier,
  strictObject,
  strictSafeInteger,
  strictSha256Digest,
  strictString,
} from './privateBoundary';
import {
  BROWSER_VERIFICATION_TARGET_BINDING_FORMAT,
  BROWSER_VERIFICATION_TARGET_BINDING_VERSION,
  type BrowserVerificationRuntimeIdentity,
  type BrowserVerificationTargetBinding,
  type BrowserVerificationTargetLease,
} from './browserAdapter.types';

const fail = (path: string, message: string): never => {
  throw new BrowserPrivatePayloadError('invalid-field', path, message);
};

export const normalizeBrowserVerificationRuntimeIdentity = (
  input: BrowserVerificationRuntimeIdentity
): BrowserVerificationRuntimeIdentity => {
  const decoded = decodePrivateJson(input, 'Browser runtime identity');
  const identity = strictObject(decoded, '$', [
    'machineClass',
    'operatingSystemImageDigest',
    'browserImageDigest',
    'browserEngine',
    'browserVersion',
    'fontSetDigest',
    'viewport',
    'colorScheme',
    'motionPreference',
    'locale',
    'cacheClass',
    'rendererGeneration',
    'normalizer',
  ]);
  const viewport = strictObject(identity.viewport, '$.viewport', [
    'widthCssPixels',
    'heightCssPixels',
    'devicePixelRatio',
  ]);
  const normalizer = strictObject(identity.normalizer, '$.normalizer', [
    'id',
    'version',
  ]);
  return Object.freeze({
    machineClass: strictIdentifier(identity.machineClass, '$.machineClass'),
    operatingSystemImageDigest: strictSha256Digest(
      identity.operatingSystemImageDigest,
      '$.operatingSystemImageDigest'
    ),
    browserImageDigest: strictSha256Digest(
      identity.browserImageDigest,
      '$.browserImageDigest'
    ),
    browserEngine: strictEnum(identity.browserEngine, '$.browserEngine', [
      'chromium',
      'firefox',
      'webkit',
    ] as const),
    browserVersion: strictString(
      identity.browserVersion,
      '$.browserVersion',
      128
    ),
    fontSetDigest: strictSha256Digest(
      identity.fontSetDigest,
      '$.fontSetDigest'
    ),
    viewport: Object.freeze({
      widthCssPixels: strictSafeInteger(
        viewport.widthCssPixels,
        '$.viewport.widthCssPixels',
        { minimum: 1, maximum: 16_384 }
      ),
      heightCssPixels: strictSafeInteger(
        viewport.heightCssPixels,
        '$.viewport.heightCssPixels',
        { minimum: 1, maximum: 16_384 }
      ),
      devicePixelRatio: strictFiniteNumber(
        viewport.devicePixelRatio,
        '$.viewport.devicePixelRatio',
        { minimum: 0.25, maximum: 8 }
      ),
    }),
    colorScheme: strictEnum(identity.colorScheme, '$.colorScheme', [
      'light',
      'dark',
    ] as const),
    motionPreference: strictEnum(
      identity.motionPreference,
      '$.motionPreference',
      ['full', 'reduced'] as const
    ),
    locale: strictIdentifier(identity.locale, '$.locale'),
    cacheClass: strictEnum(identity.cacheClass, '$.cacheClass', [
      'cold',
      'warm',
    ] as const),
    rendererGeneration: strictIdentifier(
      identity.rendererGeneration,
      '$.rendererGeneration'
    ),
    normalizer: Object.freeze({
      id: strictIdentifier(normalizer.id, '$.normalizer.id'),
      version: strictIdentifier(normalizer.version, '$.normalizer.version'),
    }),
  });
};

export const createBrowserVerificationRuntimeEnvironmentDigest = (
  input: BrowserVerificationRuntimeIdentity
): string =>
  digestVerificationValue({
    format: 'prodivix.browser-runtime-environment',
    version: 1,
    identity: normalizeBrowserVerificationRuntimeIdentity(input),
  });

export const createBrowserVerificationOriginDigest = (
  originInput: string
): string => {
  let parsed: URL;
  try {
    parsed = new URL(originInput);
  } catch (error) {
    throw new BrowserPrivatePayloadError(
      'invalid-field',
      '$.origin',
      'Browser target origin must be an absolute HTTP(S) origin.',
      { cause: error }
    );
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    parsed.origin !== originInput
  ) {
    fail('$.origin', 'Browser target lease must contain an origin only.');
  }
  return digestVerificationValue({
    format: 'prodivix.browser-target-origin',
    version: 1,
    origin: parsed.origin,
  });
};

export const normalizeBrowserVerificationTargetBinding = (
  input: BrowserVerificationTargetBinding
): BrowserVerificationTargetBinding => {
  const decoded = decodePrivateJson(input, 'Browser target binding');
  const binding = strictObject(decoded, '$', [
    'format',
    'version',
    'originDigest',
    'attemptId',
    'generation',
    'executableSnapshotDigest',
    'targetId',
    'frameworkTarget',
    'surface',
    'browserEngine',
    'viewport',
    'colorScheme',
    'motion',
    'locale',
    'runtimeEnvironmentDigest',
  ]);
  if (
    binding.format !== BROWSER_VERIFICATION_TARGET_BINDING_FORMAT ||
    binding.version !== BROWSER_VERIFICATION_TARGET_BINDING_VERSION
  ) {
    fail('$', 'Browser target binding format or version is unsupported.');
  }
  const viewport = strictObject(binding.viewport, '$.viewport', [
    'width',
    'height',
  ]);
  return Object.freeze({
    format: BROWSER_VERIFICATION_TARGET_BINDING_FORMAT,
    version: BROWSER_VERIFICATION_TARGET_BINDING_VERSION,
    originDigest: strictSha256Digest(binding.originDigest, '$.originDigest'),
    attemptId: strictIdentifier(binding.attemptId, '$.attemptId'),
    generation: strictSafeInteger(binding.generation, '$.generation', {
      minimum: 1,
      maximum: Number.MAX_SAFE_INTEGER,
    }),
    executableSnapshotDigest: strictSha256Digest(
      binding.executableSnapshotDigest,
      '$.executableSnapshotDigest'
    ),
    targetId: strictIdentifier(binding.targetId, '$.targetId'),
    frameworkTarget: strictIdentifier(
      binding.frameworkTarget,
      '$.frameworkTarget'
    ),
    surface: strictEnum(binding.surface, '$.surface', [
      'preview',
      'export',
      'ci',
    ] as const),
    browserEngine: strictEnum(binding.browserEngine, '$.browserEngine', [
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
    colorScheme: strictEnum(binding.colorScheme, '$.colorScheme', [
      'light',
      'dark',
    ] as const),
    motion: strictEnum(binding.motion, '$.motion', [
      'full',
      'reduced',
    ] as const),
    locale: strictIdentifier(binding.locale, '$.locale'),
    runtimeEnvironmentDigest: strictSha256Digest(
      binding.runtimeEnvironmentDigest,
      '$.runtimeEnvironmentDigest'
    ),
  });
};

export const createBrowserVerificationTargetBindingDigest = (
  binding: BrowserVerificationTargetBinding
): string =>
  digestVerificationValue(normalizeBrowserVerificationTargetBinding(binding));

export const createBrowserVerificationTargetBinding = (
  input: Readonly<{
    origin: string;
    attemptId: string;
    generation: number;
    executableSnapshotDigest: string;
    cell: VerificationPlanCell;
    runtimeIdentity: BrowserVerificationRuntimeIdentity;
  }>
): Readonly<{
  binding: BrowserVerificationTargetBinding;
  bindingDigest: string;
  runtimeEnvironmentDigest: string;
}> => {
  const runtimeIdentity = normalizeBrowserVerificationRuntimeIdentity(
    input.runtimeIdentity
  );
  const browserEngine =
    input.cell.browserEngine ??
    fail('$.cell.browserEngine', 'Browser Plan cell requires an engine.');
  if (
    runtimeIdentity.browserEngine !== browserEngine ||
    runtimeIdentity.viewport.widthCssPixels !== input.cell.viewport.width ||
    runtimeIdentity.viewport.heightCssPixels !== input.cell.viewport.height ||
    runtimeIdentity.colorScheme !== input.cell.colorScheme ||
    runtimeIdentity.motionPreference !== input.cell.motion ||
    runtimeIdentity.locale !== input.cell.locale
  ) {
    fail(
      '$.runtimeIdentity',
      'Provider runtime identity drifted from the exact Plan cell coordinates.'
    );
  }
  const runtimeEnvironmentDigest =
    createBrowserVerificationRuntimeEnvironmentDigest(runtimeIdentity);
  const binding = normalizeBrowserVerificationTargetBinding({
    format: BROWSER_VERIFICATION_TARGET_BINDING_FORMAT,
    version: BROWSER_VERIFICATION_TARGET_BINDING_VERSION,
    originDigest: createBrowserVerificationOriginDigest(input.origin),
    attemptId: strictIdentifier(input.attemptId, '$.attemptId'),
    generation: strictSafeInteger(input.generation, '$.generation', {
      minimum: 1,
      maximum: Number.MAX_SAFE_INTEGER,
    }),
    executableSnapshotDigest: strictSha256Digest(
      input.executableSnapshotDigest,
      '$.executableSnapshotDigest'
    ),
    targetId: input.cell.targetId,
    frameworkTarget: input.cell.frameworkTarget,
    surface: input.cell.surface,
    browserEngine,
    viewport: Object.freeze({
      width: input.cell.viewport.width,
      height: input.cell.viewport.height,
    }),
    colorScheme: input.cell.colorScheme,
    motion: input.cell.motion,
    locale: input.cell.locale,
    runtimeEnvironmentDigest,
  });
  return Object.freeze({
    binding,
    bindingDigest: createBrowserVerificationTargetBindingDigest(binding),
    runtimeEnvironmentDigest,
  });
};

export const assertBrowserVerificationTargetLease = (
  lease: BrowserVerificationTargetLease,
  input: Readonly<{
    cell: VerificationPlanCell;
    attemptId: string;
    generation: number;
    executableSnapshotDigest: string;
    expectedBindingDigest: string;
    runtimeEnvironmentDigest: string;
  }>
): BrowserVerificationTargetLease => {
  const normalizedIdentity = normalizeBrowserVerificationRuntimeIdentity(
    lease.runtimeIdentity
  );
  const reconstructed = createBrowserVerificationTargetBinding({
    origin: lease.origin,
    attemptId: input.attemptId,
    generation: input.generation,
    executableSnapshotDigest: input.executableSnapshotDigest,
    cell: input.cell,
    runtimeIdentity: normalizedIdentity,
  });
  const normalizedBinding = normalizeBrowserVerificationTargetBinding(
    lease.binding
  );
  if (
    !strictIdentifier(lease.leaseId, '$.leaseId') ||
    canonicalJsonText(normalizedBinding) !==
      canonicalJsonText(reconstructed.binding) ||
    lease.bindingDigest !== reconstructed.bindingDigest ||
    lease.bindingDigest !== input.expectedBindingDigest ||
    reconstructed.runtimeEnvironmentDigest !== input.runtimeEnvironmentDigest
  ) {
    fail('$', 'Browser target lease identity or binding digest drifted.');
  }
  return Object.freeze({
    leaseId: lease.leaseId,
    origin: lease.origin,
    binding: normalizedBinding,
    bindingDigest: lease.bindingDigest,
    runtimeIdentity: normalizedIdentity,
  });
};
