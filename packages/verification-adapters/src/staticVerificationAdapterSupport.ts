import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  createVerificationAdapterRegistration,
  digestVerificationValue,
  type PreparedVerificationInvocation,
  type VerificationAbortSignal,
  type VerificationAdapter,
  type VerificationAdapterContext,
  type VerificationAdapterDescriptor,
  type VerificationAdapterInputRef,
  type VerificationAdapterPreparedInvocationCandidate,
  type VerificationAdapterPrepareInput,
  type VerificationAdapterToolIdentity,
  type VerificationArtifactKind,
  type VerificationCheckReportPayload,
  type VerificationCheckReportTerminal,
  type VerificationEventSink,
  type VerificationInputKind,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  VERIFICATION_ADAPTER_INPUT_LIMITS,
  type PreparedVerificationAdapterArtifact,
} from './verificationAdapterInputs';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

export class VerificationAdapterContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'VerificationAdapterContractError';
    this.code = code;
  }
}

type ExpectedInputRef = Readonly<{
  id: string;
  kind: VerificationInputKind;
  mediaType: string;
  maximumBytes?: number;
}>;

export type StaticVerificationProjection = Readonly<{
  terminal: VerificationCheckReportTerminal;
  payload: VerificationCheckReportPayload;
  artifacts: readonly PreparedVerificationAdapterArtifact[];
  diagnosticCodes: readonly string[];
}>;

type PrepareProjectionContext = Readonly<{
  input: VerificationAdapterPrepareInput;
  readInput(id: string): Promise<Uint8Array>;
}>;

export type StaticVerificationAdapterSpec = Readonly<{
  descriptor: VerificationAdapterDescriptor;
  tool: VerificationAdapterToolIdentity;
  expectedInputs: readonly ExpectedInputRef[];
  prepareProjection(
    context: PrepareProjectionContext
  ): Promise<StaticVerificationProjection>;
}>;

export type InvocationState = {
  phase: 'preparing' | 'ready' | 'executing' | 'collecting' | 'cleaned';
  canaryId: string;
  input: VerificationAdapterPrepareInput;
  prepared?: VerificationAdapterPreparedInvocationCandidate;
  invocation?: PreparedVerificationInvocation;
  projection?: StaticVerificationProjection;
};

export const contractError = (
  message: string
): VerificationAdapterContractError =>
  new VerificationAdapterContractError('VER-4001', message);

export const infrastructureError = (
  message: string
): VerificationAdapterContractError =>
  new VerificationAdapterContractError('VER-4002', message);

export const assertDigest = (value: string, label: string): void => {
  if (!DIGEST_PATTERN.test(value)) {
    throw contractError(`${label} must be a canonical SHA-256 digest.`);
  }
};

export const assertToken = (value: string, label: string): void => {
  if (!TOKEN_PATTERN.test(value)) {
    throw contractError(`${label} must be a canonical identifier.`);
  }
};

const abortReason = (signal: VerificationAbortSignal): string =>
  signal.reason && TOKEN_PATTERN.test(signal.reason)
    ? signal.reason
    : 'verification-adapter-aborted';

export const assertNotAborted = (signal: VerificationAbortSignal): void => {
  if (signal.aborted) {
    throw new VerificationAdapterContractError(
      'VER-4002',
      `Verification adapter was cancelled: ${abortReason(signal)}.`
    );
  }
};

const sameStringSet = (
  left: readonly string[],
  right: readonly string[]
): boolean => {
  const normalizedLeft = [...left].sort(compareUnicodeCodePoints);
  const normalizedRight = [...right].sort(compareUnicodeCodePoints);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((entry, index) => entry === normalizedRight[index])
  );
};

export const providerSupportsSurface = (
  providerKind: VerificationAdapterPrepareInput['providerKind'],
  surface: VerificationPlanCell['surface']
): boolean => {
  switch (surface) {
    case 'preview':
      return (
        providerKind === 'browser' ||
        providerKind === 'local' ||
        providerKind === 'remote'
      );
    case 'export':
      return (
        providerKind === 'export' ||
        providerKind === 'local' ||
        providerKind === 'remote'
      );
    case 'ci':
      return providerKind === 'ci' || providerKind === 'remote';
  }
};

const artifactKindsMatch = (
  artifacts: readonly PreparedVerificationAdapterArtifact[],
  expectedKinds: readonly VerificationArtifactKind[]
): boolean => {
  // These four static adapters require one opaque staged artifact for each
  // kind requested by their Plan cell. This is not a global artifact-count
  // rule: browser families may legitimately emit several artifacts per kind.
  const actualKinds = artifacts.map(({ kind }) => kind);
  return (
    new Set(actualKinds).size === actualKinds.length &&
    sameStringSet(actualKinds, expectedKinds)
  );
};

const collectPayloadDiagnosticCodes = (
  payload: VerificationCheckReportPayload
): readonly string[] => {
  switch (payload.kind) {
    case 'diagnostics':
    case 'build':
      return payload.findings.flatMap(({ diagnosticCodes }) => diagnosticCodes);
    case 'unit':
    case 'integration':
      return payload.suites.flatMap(({ cases }) =>
        cases.flatMap(({ diagnosticCodes }) => diagnosticCodes)
      );
    case 'e2e':
      return payload.steps.flatMap(({ diagnosticCodes }) => diagnosticCodes);
    case 'visual':
    case 'performance':
      return [];
    case 'accessibility':
      return [
        ...payload.findings.flatMap(({ diagnosticCodes }) => diagnosticCodes),
        ...payload.journeys.flatMap(({ diagnosticCodes }) => diagnosticCodes),
      ];
    case 'security':
      return payload.findings.flatMap(({ diagnosticCodes }) => diagnosticCodes);
  }
};

const normalizeDiagnosticCodes = (
  values: readonly string[]
): readonly string[] => {
  const normalized = [...new Set(values)].sort(compareUnicodeCodePoints);
  for (const value of normalized) assertToken(value, 'Diagnostic code');
  return Object.freeze(normalized);
};

export const validateProjection = (
  projection: StaticVerificationProjection,
  cell: VerificationPlanCell,
  descriptor: VerificationAdapterDescriptor
): StaticVerificationProjection => {
  if (projection.payload.kind !== cell.checkKind) {
    throw contractError(
      'Verification projection payload does not match its Plan cell.'
    );
  }
  if (!artifactKindsMatch(projection.artifacts, cell.artifactKinds)) {
    throw contractError(
      'Verification projection artifacts do not exactly satisfy the Plan cell.'
    );
  }
  if (
    projection.artifacts.some(
      ({ kind }) => !descriptor.artifactKinds.includes(kind)
    )
  ) {
    throw contractError(
      'Verification projection produced an undeclared artifact kind.'
    );
  }
  const totalBytes = projection.artifacts.reduce(
    (total, artifact) => total + artifact.size,
    0
  );
  if (totalBytes > descriptor.budgets.maximumArtifactBytes) {
    throw contractError('Verification projection exceeds its artifact budget.');
  }
  return Object.freeze({
    ...projection,
    artifacts: Object.freeze(
      [...projection.artifacts].sort((left, right) =>
        compareUnicodeCodePoints(left.id, right.id)
      )
    ),
    diagnosticCodes: normalizeDiagnosticCodes([
      ...projection.diagnosticCodes,
      ...collectPayloadDiagnosticCodes(projection.payload),
    ]),
  });
};

export const validateInputRefs = (
  context: VerificationAdapterContext,
  expectedInputs: readonly ExpectedInputRef[]
): ReadonlyMap<string, VerificationAdapterInputRef> => {
  if (context.inputRefs.length !== expectedInputs.length) {
    throw contractError('Verification adapter input reference count drifted.');
  }
  const refs = new Map<string, VerificationAdapterInputRef>();
  for (const ref of context.inputRefs) {
    assertToken(ref.id, 'Input reference id');
    assertDigest(ref.digest, `Input reference ${ref.id} digest`);
    if (
      !Number.isSafeInteger(ref.size) ||
      ref.size <= 0 ||
      ref.size > 512 * 1024 * 1024
    ) {
      throw contractError(`Input reference ${ref.id} size is invalid.`);
    }
    if (refs.has(ref.id)) {
      throw contractError(`Input reference ${ref.id} is duplicated.`);
    }
    refs.set(ref.id, ref);
  }
  for (const expected of expectedInputs) {
    const ref = refs.get(expected.id);
    if (
      !ref ||
      ref.kind !== expected.kind ||
      ref.mediaType !== expected.mediaType ||
      ref.size >
        (expected.maximumBytes ??
          VERIFICATION_ADAPTER_INPUT_LIMITS.maximumJsonBytes)
    ) {
      throw contractError(
        `Input reference ${expected.id} does not satisfy its exact contract.`
      );
    }
  }
  return refs;
};

export const identityForDescriptor = (
  descriptor: VerificationAdapterDescriptor
) => createVerificationAdapterRegistration(descriptor).identity;

export const preflightCell = (
  spec: StaticVerificationAdapterSpec,
  factoryContext: Readonly<{
    registrySnapshotDigest: string;
    adapter: VerificationAdapterContext['adapter'];
    runtimeZone: string;
  }>,
  cell: VerificationPlanCell,
  context: VerificationAdapterContext
): Awaited<ReturnType<VerificationAdapter['preflight']>> => {
  if (
    context.registrySnapshotDigest !== factoryContext.registrySnapshotDigest ||
    !sameCanonicalJson(context.adapter, factoryContext.adapter) ||
    !sameCanonicalJson(cell.adapter, context.adapter)
  ) {
    return Object.freeze({
      status: 'blocked',
      reasonCode: 'VER-4001',
      message: 'Adapter or registry identity drifted after Plan creation.',
    });
  }
  if (
    !spec.descriptor.checkKinds.includes(cell.checkKind) ||
    !spec.descriptor.surfaces.includes(cell.surface) ||
    !spec.descriptor.targets.includes(cell.frameworkTarget) ||
    cell.browserEngine !== undefined
  ) {
    return Object.freeze({
      status: 'unsupported',
      reasonCode: 'VER-3002',
      message: 'Plan cell is outside this adapter capability snapshot.',
    });
  }
  if (
    cell.preflight.status !== 'supported' ||
    context.runtimeZone !== factoryContext.runtimeZone ||
    context.inputDigest !== cell.inputDigest ||
    context.controlProfileDigest !== cell.controlProfileRef.digest ||
    !sameStringSet(
      context.fixtureSetDigests,
      cell.fixtureSetRef?.digest ? [cell.fixtureSetRef.digest] : []
    ) ||
    !sameStringSet(
      context.controlCapabilityIds,
      spec.descriptor.controlCapabilities
    ) ||
    !sameStringSet(cell.inputKinds, spec.descriptor.inputKinds) ||
    cell.artifactKinds.some(
      (kind) => !spec.descriptor.artifactKinds.includes(kind)
    )
  ) {
    return Object.freeze({
      status: 'blocked',
      reasonCode: 'VER-4001',
      message:
        'Plan cell or runtime context does not satisfy the adapter contract.',
    });
  }
  try {
    validateInputRefs(context, spec.expectedInputs);
    assertDigest(context.inputDigest, 'Adapter input digest');
    assertDigest(context.resolvedInputSetDigest, 'Resolved input set digest');
    assertDigest(
      context.runtimeEnvironmentDigest,
      'Runtime environment digest'
    );
    assertDigest(
      context.executableSnapshotDigest,
      'Executable Snapshot digest'
    );
    assertDigest(context.controlProfileDigest, 'Control Profile digest');
    context.fixtureSetDigests.forEach((value) =>
      assertDigest(value, 'Fixture Set digest')
    );
    assertDigest(
      context.controlCapabilitySnapshotDigest,
      'Control capability snapshot digest'
    );
    assertDigest(context.appliedControlDigest, 'Applied control digest');
  } catch (error) {
    return Object.freeze({
      status: 'blocked',
      reasonCode: 'VER-4001',
      message:
        error instanceof Error
          ? error.message
          : 'Adapter input reference validation failed.',
    });
  }
  return Object.freeze({ status: 'supported' });
};

export const emitExact = (
  sink: VerificationEventSink,
  event: Parameters<VerificationEventSink['emit']>[0]
): void => {
  const receipt = sink.emit(event);
  if (receipt.status !== 'accepted') {
    throw infrastructureError(
      `Core event sink rejected ${event.eventId}: ${receipt.reason}.`
    );
  }
};

export const eventId = (
  invocation: PreparedVerificationInvocation,
  suffix: string
): string =>
  `event:${digestVerificationValue({
    invocationId: invocation.invocationId,
    suffix,
  }).slice('sha256-'.length)}`;

export const invocationCoordinatesMatch = (
  state: InvocationState,
  input: Readonly<{
    planDigest: string;
    cellId: string;
    attemptId: string;
    generation: number;
  }>
): boolean =>
  state.input.planDigest === input.planDigest &&
  state.input.cell.id === input.cellId &&
  state.input.attemptId === input.attemptId &&
  state.input.generation === input.generation;

export const preparedInvocationMatches = (
  state: InvocationState,
  invocation: PreparedVerificationInvocation
): boolean => {
  if (
    !state.prepared ||
    invocation.resolvedInputSetDigest !==
      state.input.context.resolvedInputSetDigest
  ) {
    return false;
  }
  const { resolvedInputSetDigest: _coreOwnedDigest, ...candidate } = invocation;
  return sameCanonicalJson(state.prepared, candidate);
};
