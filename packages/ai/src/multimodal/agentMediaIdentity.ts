import {
  computeBinaryAssetDigest,
  normalizeBinaryAssetMediaType,
} from '@prodivix/assets';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type {
  AgentContextAuthority,
  AgentGroundingReference,
  AgentJsonValue,
  AgentSensitivity,
  AgentWorkspaceRevisionVector,
  CanonicalDigest,
} from '../domain/agent.types';
import {
  canonicalizeAgentWorkspaceRevision,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentWorkspaceRevisionVector,
  sameAgentWorkspaceRevision,
} from '../domain/agentCanonical';
import { createAgentCapabilityProfile } from '../providers/agentProviderIdentity';
import type { AgentCapabilityProfile } from '../providers/agentProvider.types';
import type {
  AgentMediaLimits,
  AgentMediaOmission,
  AgentMediaSafetyScannerDescriptor,
  AgentMediaSourceDescriptor,
  AgentMediaTransformerDescriptor,
  AgentModalityKind,
  AgentModalityProfile,
  AgentScreenshotCaptureIdentity,
  AgentUntrustedProvenanceClaim,
  AgentVisualObservation,
} from './agentMultimodal.types';

const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;

const modalityKinds = new Set<AgentModalityKind>([
  'text',
  'code',
  'raster-image',
  'svg',
  'screenshot',
  'pdf',
  'document',
  'audio',
  'video',
  'accessibility-tree',
]);
const contextAuthorities = new Set<AgentContextAuthority>([
  'canonical',
  'derived',
  'user-provided',
  'external-untrusted',
]);
const groundingKinds = new Set<AgentGroundingReference['kind']>([
  'workspace-document',
  'semantic-symbol',
  'code-artifact',
  'source-trace',
  'issue',
  'behavior-scenario',
  'verification',
  'external',
]);
const sensitivities = new Set<AgentSensitivity>([
  'public',
  'internal',
  'confidential',
  'restricted',
]);
const transformOperations = new Set<
  AgentMediaTransformerDescriptor['operations'][number]
>([
  'decode',
  'resize',
  'crop',
  'color-convert',
  'rasterize',
  'page-select',
  'ocr',
  'transcribe',
  'frame-sample',
  'compress',
  'redact',
]);

const assertIdentity = (value: string, label: string): void => {
  if (!identityPattern.test(value)) throw new TypeError(`${label} is invalid.`);
};

const assertDigest = (value: string, label: string): void => {
  if (!isAgentCanonicalDigest(value)) {
    throw new TypeError(`${label} must be a canonical digest.`);
  }
};

const assertCount = (
  value: number | undefined,
  label: string,
  minimum = 0
): void => {
  if (
    value !== undefined &&
    (!Number.isSafeInteger(value) || value < minimum)
  ) {
    throw new TypeError(`${label} must be a bounded integer.`);
  }
};

const uniqueSorted = <T extends string>(
  values: readonly T[],
  label: string
): readonly T[] => {
  if (values.length === 0 || new Set(values).size !== values.length) {
    throw new TypeError(`${label} must be non-empty and unique.`);
  }
  return Object.freeze([...values].sort(compareUnicodeCodePoints));
};

const validateMediaLimits = (limits: AgentMediaLimits): AgentMediaLimits => {
  for (const [label, value] of Object.entries(limits)) {
    assertCount(
      value,
      `Media limit ${label}`,
      label === 'maxTransforms' ? 1 : 0
    );
  }
  if (
    limits.maxSourceBytes < 1 ||
    limits.maxFinalBytes < 1 ||
    limits.maxTransforms < 1 ||
    limits.maxTransformElapsedMs < 1 ||
    limits.maxTransformMemoryBytes < 1
  ) {
    throw new TypeError('Required media hard limits must be positive.');
  }
  return Object.freeze({ ...limits });
};

const modalityProfileBase = (
  input: Omit<AgentModalityProfile, 'profileDigest'>
) => ({
  acceptedMediaTypes: uniqueSorted(
    input.acceptedMediaTypes.map(normalizeBinaryAssetMediaType),
    'Accepted media types'
  ),
  direction: input.direction,
  hardLimits: validateMediaLimits(input.hardLimits),
  kind: input.kind,
  modalityProfileId: input.modalityProfileId,
  providerRepresentationDigest: input.providerRepresentationDigest,
  transformPolicyDigest: input.transformPolicyDigest,
});

export const createAgentModalityProfile = (
  input: Omit<AgentModalityProfile, 'profileDigest'>
): AgentModalityProfile => {
  assertIdentity(input.modalityProfileId, 'Modality profile id');
  if (
    !modalityKinds.has(input.kind) ||
    (input.direction !== 'input' && input.direction !== 'output')
  ) {
    throw new TypeError('Modality kind or direction is invalid.');
  }
  assertDigest(input.transformPolicyDigest, 'Transform policy digest');
  assertDigest(
    input.providerRepresentationDigest,
    'Provider representation digest'
  );
  const base = modalityProfileBase(input);
  return Object.freeze({
    ...base,
    profileDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentModalityProfile = (
  profile: AgentModalityProfile
): boolean => {
  try {
    return (
      createAgentModalityProfile(profile).profileDigest ===
      profile.profileDigest
    );
  } catch {
    return false;
  }
};

export const createRequiredAgentModalityProfiles = (): Readonly<{
  raster: AgentModalityProfile;
  screenshot: AgentModalityProfile;
  pdf: AgentModalityProfile;
  document: AgentModalityProfile;
}> => {
  const visualLimits: AgentMediaLimits = Object.freeze({
    maxSourceBytes: 16 * 1024 * 1024,
    maxFinalBytes: 8 * 1024 * 1024,
    maxWidth: 8_192,
    maxHeight: 8_192,
    maxPixels: 32 * 1024 * 1024,
    maxTransforms: 8,
    maxTransformElapsedMs: 30_000,
    maxTransformMemoryBytes: 256 * 1024 * 1024,
  });
  const documentLimits: AgentMediaLimits = Object.freeze({
    maxSourceBytes: 32 * 1024 * 1024,
    maxFinalBytes: 16 * 1024 * 1024,
    maxWidth: 8_192,
    maxHeight: 8_192,
    maxPixels: 64 * 1024 * 1024,
    maxPages: 128,
    maxTransforms: 16,
    maxTransformElapsedMs: 60_000,
    maxTransformMemoryBytes: 512 * 1024 * 1024,
  });
  const profile = (
    modalityProfileId: string,
    kind: AgentModalityKind,
    acceptedMediaTypes: readonly string[],
    hardLimits: AgentMediaLimits
  ) =>
    createAgentModalityProfile({
      modalityProfileId,
      kind,
      direction: 'input',
      acceptedMediaTypes,
      transformPolicyDigest: digestAgentCanonicalValue({
        policy: 'g4-required-media-transform',
        kind,
      }),
      hardLimits,
      providerRepresentationDigest: digestAgentCanonicalValue({
        normalization: 'g4-native-provider-media-blocks',
        kind,
      }),
    });
  return Object.freeze({
    raster: profile(
      'g4-raster-image-input',
      'raster-image',
      ['image/jpeg', 'image/png'],
      visualLimits
    ),
    screenshot: profile(
      'g4-screenshot-input',
      'screenshot',
      ['image/jpeg', 'image/png'],
      visualLimits
    ),
    pdf: profile('g4-pdf-input', 'pdf', ['application/pdf'], documentLimits),
    document: profile(
      'g4-document-input-representation',
      'document',
      [
        'application/json',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ],
      documentLimits
    ),
  });
};

export const createRequiredAgentMultimodalCapabilityProfiles = (): Readonly<{
  visual: AgentCapabilityProfile;
  document: AgentCapabilityProfile;
}> => {
  const modalities = createRequiredAgentModalityProfiles();
  const create = (
    profileId: 'g4-visual-input' | 'g4-document-input',
    refs: readonly string[],
    feature: 'visual-input' | 'document-input'
  ): AgentCapabilityProfile =>
    createAgentCapabilityProfile({
      profileId,
      inputModalityRefs: ['text', ...refs],
      outputModalityRefs: ['text'],
      outputContracts: ['structured', 'text'],
      toolExecutionLoci: ['client-hosted'],
      deliveryModes: ['response', 'stream'],
      providerStateModes: ['stateless'],
      cacheModes: ['disabled'],
      contextMutationModes: ['none'],
      reasoningModes: ['none', 'summary'],
      featureFlags: [
        'bounded-text-input',
        feature,
        'structured-output',
        'streaming',
        'refusal-normalization',
        'truncation-normalization',
        'usage-reporting',
      ],
      hardLimits: {
        maxInputBytes: refs.reduce(
          (total, ref) =>
            total +
            ([
              modalities.raster,
              modalities.screenshot,
              modalities.pdf,
              modalities.document,
            ].find(({ modalityProfileId }) => modalityProfileId === ref)
              ?.hardLimits.maxFinalBytes ?? 0),
          64 * 1024
        ),
        maxOutputUnits: [{ unit: 'text-token-output', maximum: '8192' }],
        maxToolCalls: 8,
        maxParallelToolCalls: 1,
        maxBackgroundRuntimeMs: 0,
      },
    });
  return Object.freeze({
    visual: create(
      'g4-visual-input',
      [
        modalities.raster.modalityProfileId,
        modalities.screenshot.modalityProfileId,
      ],
      'visual-input'
    ),
    document: create(
      'g4-document-input',
      [modalities.document.modalityProfileId, modalities.pdf.modalityProfileId],
      'document-input'
    ),
  });
};

export const createAgentScreenshotCaptureIdentity = (
  input: Omit<AgentScreenshotCaptureIdentity, 'captureDigest'>
): AgentScreenshotCaptureIdentity => {
  const { captureDigest: _captureDigest, ...cleanInput } =
    input as AgentScreenshotCaptureIdentity;
  if (!isAgentWorkspaceRevisionVector(input.workspaceRevision)) {
    throw new TypeError('Screenshot capture requires a valid revision.');
  }
  for (const [label, digest] of [
    ['Renderer identity', input.rendererIdentityDigest],
    ['Browser identity', input.browserIdentityDigest],
    ['Font set', input.fontSetDigest],
  ] as const) {
    assertDigest(digest, `${label} digest`);
  }
  assertCount(input.viewport.width, 'Screenshot viewport width', 1);
  assertCount(input.viewport.height, 'Screenshot viewport height', 1);
  if (
    !decimalPattern.test(input.devicePixelRatio) ||
    Number(input.devicePixelRatio) <= 0 ||
    !input.locale.trim() ||
    !['light', 'dark'].includes(input.colorScheme) ||
    !['frozen', 'running'].includes(input.animationState) ||
    typeof input.reducedMotion !== 'boolean' ||
    !Number.isFinite(Date.parse(input.capturedAt))
  ) {
    throw new TypeError('Screenshot capture identity is invalid.');
  }
  const base = Object.freeze({
    ...cleanInput,
    workspaceRevision: canonicalizeAgentWorkspaceRevision(
      input.workspaceRevision
    ),
    viewport: Object.freeze({ ...input.viewport }),
  });
  return Object.freeze({
    ...base,
    captureDigest: digestAgentCanonicalValue(base),
  });
};

const sourceDescriptorBase = (
  input: Omit<AgentMediaSourceDescriptor, 'descriptorDigest'>
) => ({
  authority: input.authority,
  byteLength: input.byteLength,
  contentDigest: input.contentDigest,
  kind: input.kind,
  mediaSourceId: input.mediaSourceId,
  mediaType: normalizeBinaryAssetMediaType(input.mediaType),
  sensitivity: input.sensitivity,
  source: Object.freeze({ ...input.source }),
  ...(input.workspaceRevision
    ? {
        workspaceRevision: canonicalizeAgentWorkspaceRevision(
          input.workspaceRevision
        ),
      }
    : {}),
  ...(input.dimensions
    ? { dimensions: Object.freeze({ ...input.dimensions }) }
    : {}),
  ...(input.pageCount !== undefined ? { pageCount: input.pageCount } : {}),
  ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
  ...(input.frameRate !== undefined ? { frameRate: input.frameRate } : {}),
  ...(input.sampleRate !== undefined ? { sampleRate: input.sampleRate } : {}),
  ...(input.channelCount !== undefined
    ? { channelCount: input.channelCount }
    : {}),
  ...(input.sourceTraceRef ? { sourceTraceRef: input.sourceTraceRef } : {}),
  ...(input.provenanceRef ? { provenanceRef: input.provenanceRef } : {}),
  ...(input.screenshotCapture
    ? { screenshotCapture: input.screenshotCapture }
    : {}),
});

export const createAgentMediaSourceDescriptor = (
  input: Omit<AgentMediaSourceDescriptor, 'descriptorDigest'>
): AgentMediaSourceDescriptor => {
  assertIdentity(input.mediaSourceId, 'Media source id');
  assertDigest(input.contentDigest, 'Media content digest');
  assertCount(input.byteLength, 'Media byte length', 1);
  if (
    !modalityKinds.has(input.kind) ||
    !contextAuthorities.has(input.authority) ||
    !groundingKinds.has(input.source.kind) ||
    !sensitivities.has(input.sensitivity) ||
    !input.source.id.trim()
  ) {
    throw new TypeError('Media grounding source is empty.');
  }
  if (input.authority !== 'external-untrusted' && !input.workspaceRevision) {
    throw new TypeError('Trusted media must bind an exact Workspace revision.');
  }
  if (
    input.workspaceRevision &&
    !isAgentWorkspaceRevisionVector(input.workspaceRevision)
  ) {
    throw new TypeError('Media Workspace revision is invalid.');
  }
  if (input.dimensions) {
    assertCount(input.dimensions.width, 'Media width', 1);
    assertCount(input.dimensions.height, 'Media height', 1);
  }
  assertCount(input.pageCount, 'Media page count', 1);
  assertCount(input.durationMs, 'Media duration');
  assertCount(input.sampleRate, 'Media sample rate', 1);
  assertCount(input.channelCount, 'Media channel count', 1);
  if (
    input.frameRate !== undefined &&
    (!decimalPattern.test(input.frameRate) || Number(input.frameRate) <= 0)
  ) {
    throw new TypeError('Media frame rate is not canonical.');
  }
  if (
    (input.sourceTraceRef !== undefined && !input.sourceTraceRef.trim()) ||
    (input.provenanceRef !== undefined && !input.provenanceRef.trim())
  ) {
    throw new TypeError('Media trace or provenance reference is empty.');
  }
  if (input.kind === 'screenshot') {
    if (
      !input.screenshotCapture ||
      input.authority !== 'derived' ||
      !input.sourceTraceRef ||
      !input.workspaceRevision ||
      !sameAgentWorkspaceRevision(
        input.screenshotCapture.workspaceRevision,
        input.workspaceRevision
      ) ||
      createAgentScreenshotCaptureIdentity(input.screenshotCapture)
        .captureDigest !== input.screenshotCapture.captureDigest
    ) {
      throw new TypeError(
        'Screenshot media requires derived capture and SourceTrace identity.'
      );
    }
  } else if (input.screenshotCapture) {
    throw new TypeError('Only screenshot media can carry capture identity.');
  }
  if (input.source.kind === 'workspace-document' && !input.provenanceRef) {
    throw new TypeError('Workspace media requires verified asset provenance.');
  }
  const base = sourceDescriptorBase(input);
  return Object.freeze({
    ...base,
    descriptorDigest: digestAgentCanonicalValue(base),
  });
};

export const materializeAgentMediaSourceDescriptor = (
  input: Omit<
    AgentMediaSourceDescriptor,
    'contentDigest' | 'byteLength' | 'descriptorDigest'
  > &
    Readonly<{ contents: Uint8Array }>
): AgentMediaSourceDescriptor => {
  if (
    !(input.contents instanceof Uint8Array) ||
    input.contents.byteLength < 1
  ) {
    throw new TypeError('Media source must contain bytes.');
  }
  const { contents, ...descriptor } = input;
  return createAgentMediaSourceDescriptor({
    ...descriptor,
    contentDigest: computeBinaryAssetDigest(contents),
    byteLength: contents.byteLength,
  });
};

export const validateAgentMediaSourceDescriptor = (
  source: AgentMediaSourceDescriptor
): boolean => {
  try {
    return (
      createAgentMediaSourceDescriptor(source).descriptorDigest ===
      source.descriptorDigest
    );
  } catch {
    return false;
  }
};

export const createAgentMediaOmission = (
  input: Omit<AgentMediaOmission, 'omissionDigest'>
): AgentMediaOmission => {
  const { omissionDigest: _omissionDigest, ...cleanInput } =
    input as AgentMediaOmission;
  if (
    !['page-range', 'pixel-region', 'frame-range', 'time-range'].includes(
      input.kind
    ) ||
    !['budget', 'policy', 'redacted', 'selection', 'unsupported'].includes(
      input.reason
    ) ||
    !Number.isFinite(input.start) ||
    !Number.isFinite(input.end) ||
    input.start < 0 ||
    input.end <= input.start
  ) {
    throw new TypeError('Media omission range is invalid.');
  }
  const base = Object.freeze({ ...cleanInput });
  return Object.freeze({
    ...base,
    omissionDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentMediaTransformerDescriptor = (
  input: Omit<AgentMediaTransformerDescriptor, 'descriptorDigest'>
): AgentMediaTransformerDescriptor => {
  const { descriptorDigest: _descriptorDigest, ...cleanInput } =
    input as AgentMediaTransformerDescriptor;
  assertIdentity(input.transformerId, 'Media transformer id');
  assertIdentity(input.transformerVersion, 'Media transformer version');
  assertDigest(input.implementationDigest, 'Transformer implementation digest');
  if (
    input.deterministic !== true ||
    input.operations.some((operation) => !transformOperations.has(operation))
  ) {
    throw new TypeError('G4 media transformer must be deterministic.');
  }
  const base = Object.freeze({
    ...cleanInput,
    operations: uniqueSorted(input.operations, 'Transformer operations'),
    inputMediaTypes: uniqueSorted(
      input.inputMediaTypes.map(normalizeBinaryAssetMediaType),
      'Transformer input media types'
    ),
    outputMediaTypes: uniqueSorted(
      input.outputMediaTypes.map(normalizeBinaryAssetMediaType),
      'Transformer output media types'
    ),
  });
  return Object.freeze({
    ...base,
    descriptorDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentMediaSafetyScannerDescriptor = (
  input: Omit<AgentMediaSafetyScannerDescriptor, 'descriptorDigest'>
): AgentMediaSafetyScannerDescriptor => {
  const { descriptorDigest: _descriptorDigest, ...cleanInput } =
    input as AgentMediaSafetyScannerDescriptor;
  assertIdentity(input.scannerId, 'Media scanner id');
  assertIdentity(input.scannerVersion, 'Media scanner version');
  assertDigest(input.implementationDigest, 'Scanner implementation digest');
  const base = Object.freeze({
    ...cleanInput,
    supportedMediaTypes: uniqueSorted(
      input.supportedMediaTypes.map(normalizeBinaryAssetMediaType),
      'Scanner media types'
    ),
  });
  return Object.freeze({
    ...base,
    descriptorDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentUntrustedProvenanceClaim = (
  input: Omit<AgentUntrustedProvenanceClaim, 'claimDigest'>
): AgentUntrustedProvenanceClaim => {
  const { claimDigest: _claimDigest, ...cleanInput } =
    input as AgentUntrustedProvenanceClaim;
  if (
    !['license', 'originality', 'safety', 'identity'].includes(input.kind) ||
    !['provider-claimed', 'unknown'].includes(input.confidence) ||
    !input.claim.trim() ||
    input.claim.length > 4_096
  ) {
    throw new TypeError('Provider provenance claim is invalid.');
  }
  const base = Object.freeze({ ...cleanInput });
  return Object.freeze({
    ...base,
    claimDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentVisualObservation = (
  input: Omit<AgentVisualObservation, 'observationDigest'>
): AgentVisualObservation => {
  const { observationDigest: _observationDigest, ...cleanInput } =
    input as AgentVisualObservation;
  assertIdentity(input.observationId, 'Visual observation id');
  assertDigest(input.representationDigest, 'Visual representation digest');
  if (!isAgentWorkspaceRevisionVector(input.workspaceRevision)) {
    throw new TypeError('Visual observation revision is invalid.');
  }
  if (input.coordinates) {
    for (const [label, value] of Object.entries(input.coordinates)) {
      if (!Number.isFinite(value) || value < 0) {
        throw new TypeError(`Visual coordinate ${label} is invalid.`);
      }
    }
    if (input.coordinates.width <= 0 || input.coordinates.height <= 0) {
      throw new TypeError('Visual observation bounds must be positive.');
    }
  }
  const base = Object.freeze({
    ...cleanInput,
    workspaceRevision: canonicalizeAgentWorkspaceRevision(
      input.workspaceRevision
    ),
    ...(input.coordinates
      ? { coordinates: Object.freeze({ ...input.coordinates }) }
      : {}),
  });
  return Object.freeze({
    ...base,
    observationDigest: digestAgentCanonicalValue(base),
  });
};

export const digestAgentMediaParameters = (
  parameters: AgentJsonValue
): CanonicalDigest => digestAgentCanonicalValue(parameters);

export const sourceDescriptorForContents = (
  contents: Uint8Array,
  input: Readonly<{
    mediaSourceId: string;
    kind: AgentModalityKind;
    authority: AgentContextAuthority;
    source: AgentGroundingReference;
    workspaceRevision?: AgentWorkspaceRevisionVector;
    mediaType: string;
    sensitivity: AgentSensitivity;
  }>
): AgentMediaSourceDescriptor =>
  materializeAgentMediaSourceDescriptor({ ...input, contents });
