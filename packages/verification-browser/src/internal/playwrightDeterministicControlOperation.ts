import type { DeterministicRuntimeSession } from '@prodivix/runtime-core';
import type { Page } from 'playwright-core';
import type {
  BrowserRuntimeControlLease,
  BrowserRuntimeControlSettleObservation,
} from '../browserRuntimeControlPort';
import type {
  PlaywrightRuntimeProbeResponse,
  PlaywrightRuntimeSnapshot,
} from './playwrightDeterministicControlInit';

export type PlaywrightDeterministicSettleResult = Readonly<{
  snapshot: PlaywrightRuntimeSnapshot;
  observation: BrowserRuntimeControlSettleObservation;
  timeOrigin: number;
  performanceNowDelta: number;
  animationFrameTimestamp: number;
}>;

export const invokePlaywrightRuntimeProbe = async (input: {
  page: Page;
  probeKey: string | undefined;
  probeCapability: string | undefined;
  pageErrorMessages: readonly string[];
  action: 'snapshot' | 'settle' | 'sync-clock';
  argument?: unknown;
}): Promise<PlaywrightRuntimeProbeResponse> => {
  if (!input.probeKey || !input.probeCapability) {
    throw new Error('Deterministic browser control probe is unavailable.');
  }
  try {
    return await input.page.evaluate(
      ({ probeKey, probeCapability, requestedAction, requestedArgument }) => {
        const probe = (
          globalThis as typeof globalThis &
            Record<
              string,
              | undefined
              | ((
                  capability: string,
                  action: 'snapshot' | 'settle' | 'sync-clock',
                  argument?: unknown
                ) => Promise<PlaywrightRuntimeProbeResponse>)
            >
        )[probeKey];
        if (typeof probe !== 'function') {
          throw new Error(
            'Deterministic browser control probe was removed or replaced.'
          );
        }
        return probe(probeCapability, requestedAction, requestedArgument);
      },
      {
        probeKey: input.probeKey,
        probeCapability: input.probeCapability,
        requestedAction: input.action,
        requestedArgument: input.argument,
      }
    );
  } catch (error) {
    if (input.pageErrorMessages.length > 0) {
      throw new AggregateError(
        [error],
        `Deterministic browser initialization failed: ${input.pageErrorMessages.join(' | ')}`
      );
    }
    throw error;
  }
};

export const synchronizePlaywrightVirtualClock = async (input: {
  page: Page;
  session: DeterministicRuntimeSession;
  currentVirtualAnimationTimeMs: number;
  probeKey: string | undefined;
  probeCapability: string | undefined;
  pageErrorMessages: readonly string[];
}): Promise<number> => {
  const target = input.session.clock.now();
  if (
    !Number.isSafeInteger(target) ||
    target < input.currentVirtualAnimationTimeMs
  ) {
    throw new Error(
      'Core logical time cannot move behind the browser animation Clock.'
    );
  }
  const delta = target - input.currentVirtualAnimationTimeMs;
  if (delta > 0) {
    await input.page.clock.fastForward(delta);
  }
  const response = await invokePlaywrightRuntimeProbe({
    page: input.page,
    probeKey: input.probeKey,
    probeCapability: input.probeCapability,
    pageErrorMessages: input.pageErrorMessages,
    action: 'sync-clock',
    argument: target,
  });
  if (
    !('status' in response) ||
    response.status !== 'synced' ||
    response.virtualAnimationTimeMs !== target
  ) {
    throw new Error(
      'Browser animation Clock did not acknowledge Core logical time.'
    );
  }
  return target;
};

export const settlePlaywrightDeterministicRuntime = async (input: {
  page: Page;
  lease: BrowserRuntimeControlLease;
  probeKey: string | undefined;
  probeCapability: string | undefined;
  pageErrorMessages: readonly string[];
}): Promise<PlaywrightDeterministicSettleResult> => {
  const response = await invokePlaywrightRuntimeProbe({
    page: input.page,
    probeKey: input.probeKey,
    probeCapability: input.probeCapability,
    pageErrorMessages: input.pageErrorMessages,
    action: 'settle',
    argument: {
      maximumFrames: input.lease.plan.settle.maximumFrames,
      needsStableFrames:
        input.lease.plan.settle.conditions.includes('render-stable'),
    },
  });
  if (!('snapshot' in response)) {
    throw new Error(
      'Deterministic browser settle returned an unexpected response.'
    );
  }
  const state = response.snapshot;
  return Object.freeze({
    snapshot: state,
    observation: Object.freeze({
      conditions: input.lease.plan.settle.conditions,
      maximumFrames: input.lease.plan.settle.maximumFrames,
      observedFrames: response.observedFrames,
      fontReady: state.rendering.fontReady,
      activeAnimations: state.rendering.activeAnimations,
      pendingTimers: state.pendingTimers,
      pendingStreams: state.pendingStreams,
      activeWorkers: state.activeWorkers,
      authoredAnimationCreationCount: state.authoredAnimationCreationCount,
      authorAnimationFrameCreationCount:
        state.authorAnimationFrameCreationCount,
      cryptoRandomCreationCount: state.cryptoRandomCreationCount,
      animationClockSyncCount: state.animationClockSyncCount,
      nativeTimerCreationCount: state.nativeTimerCreationCount,
      streamCreationCount: state.streamCreationCount,
      workerCreationCount: state.workerCreationCount,
      deniedWorkerCreations: state.deniedWorkerCreations,
    }),
    timeOrigin: response.timeOrigin,
    performanceNowDelta: response.performanceNowDelta,
    animationFrameTimestamp: response.animationFrameTimestamp,
  });
};
