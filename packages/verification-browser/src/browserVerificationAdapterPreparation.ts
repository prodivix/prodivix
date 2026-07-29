import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  compareVerificationText,
  type VerificationAbortSignal,
  type VerificationAdapter,
  type VerificationAdapterContext,
  type VerificationAdapterInputRef,
  type VerificationAdapterPrepareInput,
  type VerificationArtifactKind,
  type VerificationInputKind,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  BROWSER_BASELINE_SET_MEDIA_TYPE,
  BROWSER_SCENARIO_PROGRAM_MEDIA_TYPE,
  BROWSER_VERIFICATION_PROFILE_MEDIA_TYPE,
  type BrowserVerificationCellInput,
  type BrowserVerificationCellPolicy,
  type FirstPartyBrowserVerificationAdapterOptions,
} from './browserAdapter.types';
import { FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR } from './browserVerificationAdapterDescriptor';
import { digestBrowserVerificationBytes } from './browserVerificationCellInput';
import {
  assertBrowserScenarioProgramBinding,
  decodeBrowserBaselineSet,
  decodeBrowserScenarioProgram,
  selectBrowserVisualBaselineEntry,
} from './browserVerificationInputMaterial';
import {
  BROWSER_SECURITY_OBSERVATION_SET_MEDIA_TYPE,
  assertBrowserSecurityObservationSetAuthority,
  decodeBrowserSecurityObservationSet,
} from './securityObservationSet';
import { decodeRgbaPng } from './rgbaPng';
import { BROWSER_PRIVATE_PAYLOAD_LIMITS } from './privateBoundary';
import { createRgbaRasterDigest } from './visualComparison';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const MAXIMUM_INPUT_BYTES = 512 * 1024 * 1024;

export const BROWSER_CHECK_CONTRACTS = Object.freeze({
  e2e: Object.freeze({
    inputKinds: Object.freeze([
      'executable-snapshot',
      'scenario-program',
      'verification-profile',
    ] as const),
    artifactKinds: Object.freeze([
      'console-summary',
      'network-summary',
      'replay-record',
      'trace',
    ] as const),
  }),
  visual: Object.freeze({
    inputKinds: Object.freeze([
      'baseline-set',
      'executable-snapshot',
      'scenario-program',
      'verification-profile',
    ] as const),
    artifactKinds: Object.freeze([
      'replay-record',
      'screenshot',
      'visual-diff',
    ] as const),
  }),
  accessibility: Object.freeze({
    inputKinds: Object.freeze([
      'executable-snapshot',
      'scenario-program',
      'verification-profile',
    ] as const),
    artifactKinds: Object.freeze([
      'accessibility-report',
      'replay-record',
    ] as const),
  }),
  performance: Object.freeze({
    inputKinds: Object.freeze([
      'executable-snapshot',
      'scenario-program',
      'verification-profile',
    ] as const),
    artifactKinds: Object.freeze([
      'performance-profile',
      'replay-record',
    ] as const),
  }),
  security: Object.freeze({
    inputKinds: Object.freeze([
      'executable-snapshot',
      'scenario-program',
      'security-observation-set',
      'verification-profile',
    ] as const),
    artifactKinds: Object.freeze([
      'network-summary',
      'replay-record',
      'security-report',
    ] as const),
  }),
} as const satisfies Readonly<
  Record<
    'e2e' | 'visual' | 'accessibility' | 'performance' | 'security',
    Readonly<{
      inputKinds: readonly VerificationInputKind[];
      artifactKinds: readonly VerificationArtifactKind[];
    }>
  >
>);

export class BrowserVerificationAdapterContractError extends Error {
  readonly code: 'VER-4001' | 'VER-4002';

  constructor(code: 'VER-4001' | 'VER-4002', message: string) {
    super(message);
    this.name = 'BrowserVerificationAdapterContractError';
    this.code = code;
  }
}

export const browserContractError = (
  message: string
): BrowserVerificationAdapterContractError =>
  new BrowserVerificationAdapterContractError('VER-4001', message);

export const browserInfrastructureError = (
  message: string
): BrowserVerificationAdapterContractError =>
  new BrowserVerificationAdapterContractError('VER-4002', message);

export const assertBrowserDigest = (value: string, label: string): void => {
  if (!DIGEST_PATTERN.test(value)) {
    throw browserContractError(`${label} must be a canonical SHA-256 digest.`);
  }
};

export const assertBrowserToken = (value: string, label: string): void => {
  if (!TOKEN_PATTERN.test(value)) {
    throw browserContractError(`${label} must be a canonical identifier.`);
  }
};

export const assertBrowserNotAborted = (
  signal: VerificationAbortSignal
): void => {
  if (signal.aborted) {
    throw browserInfrastructureError(
      `Browser verification attempt was cancelled: ${
        signal.reason && TOKEN_PATTERN.test(signal.reason)
          ? signal.reason
          : 'verification-adapter-aborted'
      }.`
    );
  }
};

export const sameBrowserVerificationSet = (
  left: readonly string[],
  right: readonly string[]
): boolean => {
  const normalizedLeft = [...left].sort(compareVerificationText);
  const normalizedRight = [...right].sort(compareVerificationText);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
};

const browserCheckKind = (
  cell: VerificationPlanCell
): keyof typeof BROWSER_CHECK_CONTRACTS | undefined =>
  cell.checkKind in BROWSER_CHECK_CONTRACTS
    ? (cell.checkKind as keyof typeof BROWSER_CHECK_CONTRACTS)
    : undefined;

export const browserProviderSupportsSurface = (
  providerKind: VerificationAdapterPrepareInput['providerKind'],
  surface: VerificationPlanCell['surface']
): boolean => {
  if (surface === 'preview') {
    return ['browser', 'local', 'remote'].includes(providerKind);
  }
  if (surface === 'export') {
    return ['export', 'local', 'remote'].includes(providerKind);
  }
  return ['ci', 'remote'].includes(providerKind);
};

export const validateBrowserInputRefs = (
  cell: VerificationPlanCell,
  context: VerificationAdapterContext
): ReadonlyMap<VerificationInputKind, VerificationAdapterInputRef> => {
  const kind = browserCheckKind(cell);
  if (!kind)
    throw browserContractError('Browser adapter received a static check.');
  const contract = BROWSER_CHECK_CONTRACTS[kind];
  if (
    !sameBrowserVerificationSet(cell.inputKinds, contract.inputKinds) ||
    context.inputRefs.length !== contract.inputKinds.length
  ) {
    throw browserContractError('Browser input reference set drifted.');
  }
  const refs = new Map<VerificationInputKind, VerificationAdapterInputRef>();
  let totalBytes = 0;
  for (const ref of context.inputRefs) {
    assertBrowserToken(ref.id, 'Browser input reference id');
    assertBrowserDigest(ref.digest, `Browser input ${ref.id} digest`);
    if (
      refs.has(ref.kind) ||
      !(contract.inputKinds as readonly VerificationInputKind[]).includes(
        ref.kind
      ) ||
      !Number.isSafeInteger(ref.size) ||
      ref.size < 0 ||
      ref.size > MAXIMUM_INPUT_BYTES ||
      (ref.kind !== 'executable-snapshot' &&
        ref.size > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumInputBytes)
    ) {
      throw browserContractError(
        'Browser input reference is duplicated or invalid.'
      );
    }
    if (
      ref.kind === 'verification-profile' &&
      ref.mediaType !== BROWSER_VERIFICATION_PROFILE_MEDIA_TYPE
    ) {
      throw browserContractError(
        'Browser verification profile media type is not exact.'
      );
    }
    if (
      ref.kind === 'scenario-program' &&
      ref.mediaType !== BROWSER_SCENARIO_PROGRAM_MEDIA_TYPE
    ) {
      throw browserContractError(
        'Browser Scenario Program media type is not exact.'
      );
    }
    if (
      ref.kind === 'baseline-set' &&
      ref.mediaType !== BROWSER_BASELINE_SET_MEDIA_TYPE
    ) {
      throw browserContractError(
        'Browser Baseline Set media type is not exact.'
      );
    }
    if (
      ref.kind === 'security-observation-set' &&
      ref.mediaType !== BROWSER_SECURITY_OBSERVATION_SET_MEDIA_TYPE
    ) {
      throw browserContractError(
        'Browser security observation set media type is not exact.'
      );
    }
    refs.set(ref.kind, ref);
    totalBytes += ref.size;
  }
  if (
    !Number.isSafeInteger(totalBytes) ||
    totalBytes > MAXIMUM_INPUT_BYTES ||
    contract.inputKinds.some((inputKind) => !refs.has(inputKind))
  ) {
    throw browserContractError(
      'Browser input reference budget or coverage drifted.'
    );
  }
  if (
    refs.get('executable-snapshot')?.digest !==
      context.executableSnapshotDigest ||
    (context.baselineSetDigest !== undefined &&
      refs.get('baseline-set')?.digest !== context.baselineSetDigest)
  ) {
    throw browserContractError(
      'Browser executable or Baseline Set ref drifted from its domain digest.'
    );
  }
  return refs;
};

export const preflightBrowserCell = (
  cell: VerificationPlanCell,
  context: VerificationAdapterContext,
  factoryContext: Readonly<{
    registrySnapshotDigest: string;
    runtimeZone: string;
  }>
): Awaited<ReturnType<VerificationAdapter['preflight']>> => {
  const kind = browserCheckKind(cell);
  if (
    !kind ||
    cell.browserEngine === undefined ||
    !FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR.targets.includes(
      cell.frameworkTarget
    ) ||
    !FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR.surfaces.includes(
      cell.surface
    ) ||
    !FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR.browserEngines.includes(
      cell.browserEngine
    )
  ) {
    return Object.freeze({
      status: 'unsupported',
      reasonCode: 'VER-3002',
      message: 'Plan cell is outside the browser adapter capability snapshot.',
    });
  }
  const contract = BROWSER_CHECK_CONTRACTS[kind];
  if (
    cell.preflight.status !== 'supported' ||
    factoryContext.runtimeZone !== 'browser' ||
    context.runtimeZone !== 'browser' ||
    context.registrySnapshotDigest !== factoryContext.registrySnapshotDigest ||
    !sameCanonicalJson(cell.adapter, context.adapter) ||
    context.inputDigest !== cell.inputDigest ||
    context.controlProfileDigest !== cell.controlProfileRef.digest ||
    !sameBrowserVerificationSet(
      context.fixtureSetDigests,
      cell.fixtureSetRef?.digest ? [cell.fixtureSetRef.digest] : []
    ) ||
    context.baselineSetDigest !== cell.baselineSetRef?.digest ||
    !sameBrowserVerificationSet(
      context.controlCapabilityIds,
      FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR.controlCapabilities
    ) ||
    !sameBrowserVerificationSet(cell.inputKinds, contract.inputKinds) ||
    !sameBrowserVerificationSet(cell.artifactKinds, contract.artifactKinds)
  ) {
    return Object.freeze({
      status: 'blocked',
      reasonCode: 'VER-4001',
      message: 'Browser Plan cell or controlled runtime context drifted.',
    });
  }
  try {
    validateBrowserInputRefs(cell, context);
    assertBrowserDigest(
      context.runtimeEnvironmentDigest,
      'Runtime environment digest'
    );
    assertBrowserDigest(
      context.resolvedInputSetDigest,
      'Resolved input set digest'
    );
    assertBrowserDigest(
      context.controlCapabilitySnapshotDigest,
      'Control capability snapshot digest'
    );
    assertBrowserDigest(context.appliedControlDigest, 'Applied control digest');
  } catch (error) {
    return Object.freeze({
      status: 'blocked',
      reasonCode: 'VER-4001',
      message:
        error instanceof Error
          ? error.message
          : 'Browser input validation failed.',
    });
  }
  return Object.freeze({ status: 'supported' });
};

export const readBrowserInputBytes = async (
  ref: VerificationAdapterInputRef,
  context: VerificationAdapterContext
): Promise<Uint8Array> => {
  assertBrowserNotAborted(context.abortSignal);
  let resolved: Uint8Array;
  try {
    resolved = await context.inputResolver.read(ref, context.abortSignal);
  } catch {
    throw browserInfrastructureError(
      `Browser input ${ref.id} could not be read.`
    );
  }
  assertBrowserNotAborted(context.abortSignal);
  if (!(resolved instanceof Uint8Array)) {
    throw browserContractError(
      `Browser input ${ref.id} bytes drifted from their content address.`
    );
  }
  const copy = new Uint8Array(resolved);
  if (
    copy.byteLength !== ref.size ||
    digestBrowserVerificationBytes(copy) !== ref.digest
  ) {
    throw browserContractError(
      `Browser input ${ref.id} bytes drifted from their content address.`
    );
  }
  return copy;
};

export const resolveBrowserCellPolicy = async (
  profile: BrowserVerificationCellInput,
  input: VerificationAdapterPrepareInput,
  refs: ReadonlyMap<VerificationInputKind, VerificationAdapterInputRef>,
  bytesByKind: ReadonlyMap<VerificationInputKind, Uint8Array>,
  options: FirstPartyBrowserVerificationAdapterOptions
): Promise<BrowserVerificationCellPolicy> => {
  const scenarioBytes = bytesByKind.get('scenario-program');
  if (!scenarioBytes) {
    throw browserContractError('Browser Scenario Program input is missing.');
  }
  const program = decodeBrowserScenarioProgram(scenarioBytes);
  assertBrowserScenarioProgramBinding(program, profile, input.context);
  switch (profile.profile.kind) {
    case 'e2e':
      return Object.freeze({ kind: 'e2e', program });
    case 'accessibility':
      return Object.freeze({ kind: 'accessibility', program });
    case 'performance':
      return Object.freeze({ kind: 'performance', program });
    case 'security': {
      const observationBytes = bytesByKind.get('security-observation-set');
      const observationRef = refs.get('security-observation-set');
      if (
        !observationBytes ||
        !observationRef ||
        observationRef.digest !== profile.profile.observationSetDigest
      ) {
        throw browserContractError(
          'Security observation set content address is missing or drifted.'
        );
      }
      const observationSet =
        decodeBrowserSecurityObservationSet(observationBytes);
      if (
        !sameCanonicalJson(observationSet.binding, {
          cellId: input.cell.id,
          attemptId: input.attemptId,
          generation: input.generation,
          executableSnapshotDigest: input.context.executableSnapshotDigest,
          runtimeEnvironmentDigest: input.context.runtimeEnvironmentDigest,
          controlProfileDigest: input.context.controlProfileDigest,
        })
      ) {
        throw browserContractError(
          'Security observation set binding drifted from the exact attempt.'
        );
      }
      const authorityVerifiedObservationSet =
        await assertBrowserSecurityObservationSetAuthority(
          observationSet,
          options.securityObservationAuthority,
          input.context.abortSignal
        );
      assertBrowserNotAborted(input.context.abortSignal);
      return Object.freeze({
        kind: 'security',
        program,
        observationSet: authorityVerifiedObservationSet,
      });
    }
    case 'visual': {
      const baselineBytes = bytesByKind.get('baseline-set');
      if (!baselineBytes || !options.baselineAssets) {
        throw browserContractError(
          'Visual baseline set or baseline asset owner is missing.'
        );
      }
      const baselineSet = decodeBrowserBaselineSet(baselineBytes);
      const baselineEntry = selectBrowserVisualBaselineEntry(
        baselineSet,
        profile
      );
      const baselineBytesFromOwner = await options.baselineAssets.read(
        baselineEntry,
        input.context.abortSignal
      );
      assertBrowserNotAborted(input.context.abortSignal);
      if (
        !(baselineBytesFromOwner instanceof Uint8Array) ||
        digestBrowserVerificationBytes(baselineBytesFromOwner) !==
          baselineEntry.asset.digest
      ) {
        throw browserContractError(
          'Visual baseline asset content address is missing or drifted.'
        );
      }
      const baselineImage = decodeRgbaPng(
        new Uint8Array(baselineBytesFromOwner)
      );
      if (
        createRgbaRasterDigest(baselineImage) !==
        profile.profile.baseline.rasterDigest
      ) {
        throw browserContractError(
          'Visual baseline raster digest drifted from its profile.'
        );
      }
      return Object.freeze({
        kind: 'visual',
        program,
        baselineEntry,
        baselineImage,
      });
    }
  }
};
