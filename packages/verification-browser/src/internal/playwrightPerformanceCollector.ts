import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import { compareVerificationText } from '@prodivix/verification';
import type { Page } from 'playwright-core';
import type { BrowserVerificationRuntimeIdentity } from '../browserAdapter.types';
import {
  PERFORMANCE_METRIC_UNITS,
  type PerformanceEnvironmentProfile,
  type PerformanceMetricId,
  type PerformancePolicyProfile,
} from '../performance';
import {
  decodePlaywrightBehaviorPayload,
  evaluatePlaywrightBehavior,
} from '../playwrightPrivatePayload';
import {
  PERFORMANCE_SCHEMA_DIGEST,
  toolIdentity,
} from './playwrightBrowserShared';
import type { PlaywrightBehaviorExecutionHooks } from './playwrightBehaviorCollector';
import {
  armPlaywrightTrustedPerformanceObservation,
  finishPlaywrightTrustedPerformanceObservation,
  PLAYWRIGHT_EVENT_DURATION_THRESHOLD_MS,
  readPlaywrightTrustedMonotonicTimestamp,
  resetPlaywrightTrustedPerformanceObservation,
  type PlaywrightPerformanceProbeBinding,
} from './playwrightPerformanceProbe';

const REQUIRED_ENTRY_TYPE: Readonly<
  Partial<Record<PerformanceMetricId, string>>
> = Object.freeze({
  'navigation-lcp': 'largest-contentful-paint',
  'layout-shift': 'layout-shift',
  'interaction-inp': 'event',
  'total-blocking-time': 'longtask',
  'long-task-count': 'longtask',
  'resource-count': 'resource',
  'resource-bytes': 'resource',
});

const performanceEnvironment = (
  identity: BrowserVerificationRuntimeIdentity
): PerformanceEnvironmentProfile =>
  Object.freeze({
    machineClass: identity.machineClass,
    operatingSystemImageDigest: identity.operatingSystemImageDigest,
    browserImageDigest: identity.browserImageDigest,
    browserEngine: identity.browserEngine,
    browserVersion: identity.browserVersion,
    fontSetDigest: identity.fontSetDigest,
    viewport: Object.freeze({ ...identity.viewport }),
    colorScheme: identity.colorScheme,
    motionPreference: identity.motionPreference,
    locale: identity.locale,
    cacheClass: identity.cacheClass,
  });

export const collectPlaywrightPerformance = async (
  input: Readonly<{
    page: Page;
    runtimeIdentity: BrowserVerificationRuntimeIdentity;
    policy: PerformancePolicyProfile;
    profileDigest: string;
    program: BehaviorScenarioProgram;
    executeBehavior(
      program: BehaviorScenarioProgram,
      hooks?: PlaywrightBehaviorExecutionHooks
    ): Promise<unknown>;
    probeBinding: PlaywrightPerformanceProbeBinding;
  }>
): Promise<unknown> => {
  const {
    page,
    runtimeIdentity,
    policy,
    profileDigest,
    program,
    executeBehavior,
    probeBinding,
  } = input;
  const cold = runtimeIdentity.cacheClass === 'cold';
  if (cold) {
    await page.setExtraHTTPHeaders({
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    });
  }
  try {
    const executableInstructions = program.instructions.filter(
      ({ operation }) =>
        !operation.startsWith('trigger:') && operation !== 'barrier'
    );
    const navigationInstructions = executableInstructions.filter(
      ({ operation }) => operation === 'navigate'
    );
    const hasLeadingNavigation =
      navigationInstructions.length === 1 &&
      executableInstructions[0]?.operation === 'navigate';
    if (navigationInstructions.length > 0 && !hasLeadingNavigation) {
      throw new Error(
        'Controlled performance sampling supports at most one leading canonical navigation.'
      );
    }
    const executeMeasuredScenario = async (
      hooks?: PlaywrightBehaviorExecutionHooks
    ): Promise<number> => {
      const startedAt = await readPlaywrightTrustedMonotonicTimestamp(
        page,
        probeBinding
      );
      const behavior = evaluatePlaywrightBehavior(
        decodePlaywrightBehaviorPayload(await executeBehavior(program, hooks))
      );
      const finishedAt = await readPlaywrightTrustedMonotonicTimestamp(
        page,
        probeBinding
      );
      if (
        behavior.scenarioId !== program.scenarioId ||
        behavior.verdict !== 'passed' ||
        behavior.checks.length === 0 ||
        !behavior.checks.every(
          ({ status, blackBox }) => status === 'passed' && blackBox
        )
      ) {
        throw new Error(
          'Performance sampling requires a complete passing black-box Behavior Program.'
        );
      }
      if (finishedAt < startedAt) {
        throw new Error(
          'Trusted browser monotonic scenario clock moved backwards.'
        );
      }
      return finishedAt - startedAt;
    };
    for (let index = 0; index < policy.sampling.warmupRuns; index += 1) {
      await executeMeasuredScenario();
    }
    const metricIds = policy.thresholds
      .map(({ metricId }) => metricId)
      .sort(compareVerificationText);
    const samples: Array<Record<string, unknown>> = [];
    for (let index = 0; index < policy.sampling.sampleCount; index += 1) {
      await resetPlaywrightTrustedPerformanceObservation(page, probeBinding);
      let armed = false;
      if (!hasLeadingNavigation) {
        await armPlaywrightTrustedPerformanceObservation(page, probeBinding);
        armed = true;
      }
      const scenarioDuration = await executeMeasuredScenario(
        hasLeadingNavigation
          ? {
              afterNavigation: async () => {
                if (armed) {
                  throw new Error(
                    'Performance frame sampling was armed more than once.'
                  );
                }
                await armPlaywrightTrustedPerformanceObservation(
                  page,
                  probeBinding
                );
                armed = true;
              },
            }
          : undefined
      );
      if (!armed) {
        throw new Error(
          'Performance frame sampling did not bind to the Scenario document.'
        );
      }
      const raw = await finishPlaywrightTrustedPerformanceObservation(
        page,
        probeBinding
      );
      for (const metricId of metricIds) {
        const requiredEntryType = REQUIRED_ENTRY_TYPE[metricId];
        if (
          requiredEntryType !== undefined &&
          !raw.supportedEntryTypes.includes(requiredEntryType)
        ) {
          throw new Error(
            `Trusted browser performance entry type "${requiredEntryType}" is unavailable for "${metricId}".`
          );
        }
      }
      if (
        metricIds.includes('interaction-inp') &&
        raw.trustedInteractionCount < 1
      ) {
        throw new Error(
          'INP sampling requires at least one trusted browser interaction.'
        );
      }
      // Event Timing omits interactions faster than its 16 ms minimum
      // durationThreshold. A trusted interaction with no entry is therefore
      // conservatively represented by that upper bound, not as missing data.
      const interactionInp =
        raw.inp > 0 ? raw.inp : PLAYWRIGHT_EVENT_DURATION_THRESHOLD_MS;
      if (
        metricIds.includes('navigation-lcp') &&
        (!raw.supportedEntryTypes.includes('navigation') ||
          raw.navigationEntryCount !== 1)
      ) {
        throw new Error(
          `LCP sampling requires exactly one real navigation entry; observed ${String(raw.navigationEntryCount)}.`
        );
      }
      if (
        metricIds.includes('navigation-lcp') &&
        (raw.lcpEntryCount < 1 || raw.lcp <= 0)
      ) {
        throw new Error(
          'LCP sampling requires real largest-contentful-paint entries with a positive value.'
        );
      }
      const values: Readonly<Record<PerformanceMetricId, number>> = {
        'navigation-lcp': raw.lcp,
        'layout-shift': raw.cls,
        'interaction-inp': interactionInp,
        'total-blocking-time': raw.totalBlockingTime,
        'long-task-count': raw.longTaskCount,
        'resource-count': raw.resourceCount,
        'resource-bytes': raw.resourceBytes,
        'scenario-duration': scenarioDuration,
        'animation-missed-frame-count': raw.missedFrames,
        'animation-frame-rate': raw.frameRate,
      };
      samples.push({
        sampleId: `sample-${index + 1}`,
        metrics: metricIds.map((metricId) => ({
          metricId,
          unit: PERFORMANCE_METRIC_UNITS[metricId],
          value: values[metricId],
        })),
      });
    }
    return {
      format: 'prodivix.browser-performance-report',
      version: 1,
      tool: toolIdentity(PERFORMANCE_SCHEMA_DIGEST),
      complete: true,
      profileDigest,
      environment: performanceEnvironment(runtimeIdentity),
      warmupRuns: policy.sampling.warmupRuns,
      samples,
    };
  } finally {
    if (cold) await page.setExtraHTTPHeaders({});
  }
};
