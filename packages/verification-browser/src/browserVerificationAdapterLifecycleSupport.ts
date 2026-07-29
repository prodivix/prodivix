import {
  compareVerificationText,
  digestVerificationValue,
  type PreparedVerificationInvocation,
  type VerificationAbortSignal,
  type VerificationAdapterPrepareInput,
  type VerificationCheckReportCandidate,
  type VerificationEventSink,
} from '@prodivix/verification';
import type {
  BrowserVerificationCellInput,
  BrowserVerificationCellPolicy,
  FirstPartyBrowserVerificationAdapterOptions,
} from './browserAdapter.types';
import { FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR } from './browserVerificationAdapterDescriptor';
import {
  BROWSER_CHECK_CONTRACTS,
  assertBrowserNotAborted,
  browserContractError,
  browserInfrastructureError,
  sameBrowserVerificationSet,
} from './browserVerificationAdapterPreparation';
import type { PreparedBrowserVerificationArtifact } from './browserVerificationArtifacts';
import type {
  BrowserRuntimeControlAttestation,
  BrowserRuntimeControlLease,
  BrowserRuntimeControlPort,
} from './browserRuntimeControlPort';
import type { BrowserToolSession } from './browserVerificationPort';

export type BrowserInvocationState = {
  phase: 'preparing' | 'ready' | 'executing' | 'collecting' | 'cleaned';
  canaryId: string;
  input: VerificationAdapterPrepareInput;
  profile?: BrowserVerificationCellInput;
  policy?: BrowserVerificationCellPolicy;
  lease?: Awaited<
    ReturnType<
      FirstPartyBrowserVerificationAdapterOptions['targetLease']['acquire']
    >
  >;
  runtimeControlLease?: BrowserRuntimeControlLease;
  runtimeControlAttestation?: BrowserRuntimeControlAttestation;
  session?: BrowserToolSession;
  invocation?: Omit<PreparedVerificationInvocation, 'resolvedInputSetDigest'>;
  unsubscribeAbort?: () => void;
};

export const browserInvocationMatches = (
  state: BrowserInvocationState,
  invocation: PreparedVerificationInvocation
): boolean => {
  if (
    state.invocation === undefined ||
    invocation.resolvedInputSetDigest !==
      state.input.context.resolvedInputSetDigest
  ) {
    return false;
  }
  return Object.entries(state.invocation).every(
    ([key, value]) =>
      invocation[key as keyof PreparedVerificationInvocation] === value
  );
};

export const emitBrowserEvent = (
  sink: VerificationEventSink,
  event: Parameters<VerificationEventSink['emit']>[0]
): void => {
  const receipt = sink.emit(event);
  if (receipt.status !== 'accepted') {
    throw browserInfrastructureError(
      `Core rejected browser event ${event.eventId}: ${receipt.reason}.`
    );
  }
};

export const browserEventId = (
  invocation: PreparedVerificationInvocation,
  suffix: string
): string =>
  `event:${digestVerificationValue({
    invocationId: invocation.invocationId,
    suffix,
  }).slice('sha256-'.length)}`;

export const stageBrowserArtifacts = async (
  state: BrowserInvocationState,
  invocation: PreparedVerificationInvocation,
  sink: VerificationEventSink,
  artifacts: readonly PreparedBrowserVerificationArtifact[]
): Promise<VerificationCheckReportCandidate['artifacts']> => {
  const expectedKinds =
    BROWSER_CHECK_CONTRACTS[
      state.input.cell.checkKind as keyof typeof BROWSER_CHECK_CONTRACTS
    ].artifactKinds;
  if (
    new Set(artifacts.map(({ id }) => id)).size !== artifacts.length ||
    !sameBrowserVerificationSet(
      artifacts.map(({ kind }) => kind),
      expectedKinds
    )
  ) {
    throw browserContractError(
      'Browser artifacts do not exactly satisfy the Plan cell contract.'
    );
  }
  const totalBytes = artifacts.reduce(
    (total, artifact) => total + artifact.size,
    0
  );
  if (
    !Number.isSafeInteger(totalBytes) ||
    totalBytes >
      FIRST_PARTY_BROWSER_VERIFICATION_ADAPTER_DESCRIPTOR.budgets
        .maximumArtifactBytes
  ) {
    throw browserContractError(
      'Browser artifacts exceed the adapter byte budget.'
    );
  }
  const staged: VerificationCheckReportCandidate['artifacts'][number][] = [];
  for (const artifact of [...artifacts].sort((left, right) =>
    compareVerificationText(left.id, right.id)
  )) {
    assertBrowserNotAborted(state.input.context.abortSignal);
    const result = await state.input.context.artifactStaging.stage(
      {
        id: artifact.id,
        kind: artifact.kind,
        mediaType: artifact.mediaType,
        bytes: new Uint8Array(artifact.bytes),
      },
      state.input.context.abortSignal
    );
    assertBrowserNotAborted(state.input.context.abortSignal);
    if (result.status !== 'staged') {
      throw browserInfrastructureError(
        `Browser artifact ${artifact.id} was rejected: ${result.reasonCode}.`
      );
    }
    if (
      result.digest !== artifact.digest ||
      result.size !== artifact.size ||
      result.mediaType !== artifact.mediaType
    ) {
      throw browserContractError(
        `Browser artifact ${artifact.id} staging identity drifted.`
      );
    }
    staged.push(
      Object.freeze({
        id: artifact.id,
        kind: artifact.kind,
        digest: artifact.digest,
        size: artifact.size,
        mediaType: artifact.mediaType,
      })
    );
    emitBrowserEvent(sink, {
      kind: 'artifact',
      eventId: browserEventId(invocation, `artifact:${artifact.id}`),
      artifactId: artifact.id,
      digest: artifact.digest,
    });
  }
  return Object.freeze(staged);
};

export const browserStateCoordinatesMatch = (
  state: BrowserInvocationState,
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

export const cleanupBrowserState = async (
  state: BrowserInvocationState,
  signal: VerificationAbortSignal,
  targetLease: FirstPartyBrowserVerificationAdapterOptions['targetLease'],
  runtimeControls: BrowserRuntimeControlPort
): Promise<
  Readonly<{
    status: 'clean' | 'residual' | 'failed';
    residualCanaryIds: readonly string[];
    diagnosticCodes: readonly string[];
  }>
> => {
  state.unsubscribeAbort?.();
  state.phase = 'cleaned';
  let sessionFailed = false;
  if (state.session) {
    try {
      await state.session.close();
    } catch {
      sessionFailed = true;
    }
  }
  let runtimeRelease:
    Awaited<ReturnType<BrowserRuntimeControlPort['release']>> | undefined;
  if (state.runtimeControlLease) {
    try {
      runtimeRelease = await runtimeControls.release(
        state.runtimeControlLease,
        state.runtimeControlAttestation?.phase === 'terminal'
          ? state.runtimeControlAttestation
          : undefined,
        signal
      );
    } catch {
      runtimeRelease = Object.freeze({
        status: 'failed' as const,
        residualCanaryIds: Object.freeze([]),
        diagnosticCodes: Object.freeze(['VER-BROWSER-RUNTIME-CONTROL-RELEASE']),
      });
    }
  }
  if (!state.lease) {
    const runtimeFailed = runtimeRelease?.status === 'failed';
    return Object.freeze({
      status:
        sessionFailed || runtimeFailed
          ? 'failed'
          : (runtimeRelease?.status ?? 'clean'),
      residualCanaryIds: Object.freeze(runtimeRelease?.residualCanaryIds ?? []),
      diagnosticCodes: Object.freeze(
        [
          ...(runtimeRelease?.diagnosticCodes ?? []),
          ...(sessionFailed ? ['VER-BROWSER-CONTEXT-CLEANUP'] : []),
        ].sort(compareVerificationText)
      ),
    });
  }
  let released: Awaited<ReturnType<typeof targetLease.release>>;
  try {
    released = await targetLease.release(state.lease, signal);
  } catch {
    return Object.freeze({
      status: 'failed',
      residualCanaryIds: Object.freeze([]),
      diagnosticCodes: Object.freeze(['VER-BROWSER-LEASE-RELEASE']),
    });
  }
  if (
    sessionFailed ||
    released.status === 'failed' ||
    runtimeRelease?.status === 'failed'
  ) {
    return Object.freeze({
      status: 'failed',
      residualCanaryIds: Object.freeze(
        [
          ...released.residualCanaryIds,
          ...(runtimeRelease?.residualCanaryIds ?? []),
        ].sort(compareVerificationText)
      ),
      diagnosticCodes: Object.freeze(
        [
          ...released.diagnosticCodes,
          ...(runtimeRelease?.diagnosticCodes ?? []),
          ...(sessionFailed ? ['VER-BROWSER-CONTEXT-CLEANUP'] : []),
        ].sort(compareVerificationText)
      ),
    });
  }
  return Object.freeze({
    status:
      released.status === 'residual' || runtimeRelease?.status === 'residual'
        ? 'residual'
        : 'clean',
    residualCanaryIds: Object.freeze(
      [
        ...released.residualCanaryIds,
        ...(runtimeRelease?.residualCanaryIds ?? []),
      ].sort(compareVerificationText)
    ),
    diagnosticCodes: Object.freeze(
      [
        ...released.diagnosticCodes,
        ...(runtimeRelease?.diagnosticCodes ?? []),
      ].sort(compareVerificationText)
    ),
  });
};
