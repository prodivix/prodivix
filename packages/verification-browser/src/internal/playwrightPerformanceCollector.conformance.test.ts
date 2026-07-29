import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import {
  digestBehaviorValue,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import type { BrowserVerificationRuntimeIdentity } from '../browserAdapter.types';
import {
  decodePerformancePayload,
  type PerformancePolicyProfile,
} from '../performance';
import { collectPlaywrightPerformance } from './playwrightPerformanceCollector';
import { PLAYWRIGHT_EVENT_DURATION_THRESHOLD_MS } from './playwrightPerformanceProbe';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;

const runtimeIdentity: BrowserVerificationRuntimeIdentity = Object.freeze({
  machineClass: 'provider.actual',
  operatingSystemImageDigest: sha('1'),
  browserImageDigest: sha('2'),
  browserEngine: 'chromium',
  browserVersion: 'actual-browser',
  fontSetDigest: sha('3'),
  viewport: Object.freeze({
    widthCssPixels: 800,
    heightCssPixels: 600,
    devicePixelRatio: 2,
  }),
  colorScheme: 'dark',
  motionPreference: 'reduced',
  locale: 'en-US',
  cacheClass: 'cold',
  rendererGeneration: 'renderer.actual',
  normalizer: Object.freeze({ id: 'normalizer', version: '1' }),
});

const policy: PerformancePolicyProfile = Object.freeze({
  expectedEnvironment: Object.freeze({
    machineClass: 'policy.expected',
    operatingSystemImageDigest: sha('4'),
    browserImageDigest: sha('5'),
    browserEngine: 'firefox',
    browserVersion: 'expected-browser',
    fontSetDigest: sha('6'),
    viewport: Object.freeze({
      widthCssPixels: 1_024,
      heightCssPixels: 768,
      devicePixelRatio: 1,
    }),
    colorScheme: 'light',
    motionPreference: 'full',
    locale: 'fr-FR',
    cacheClass: 'warm',
  }),
  sampling: Object.freeze({
    warmupRuns: 1,
    sampleCount: 2,
    statistic: 'median',
  }),
  thresholds: Object.freeze([
    Object.freeze({
      metricId: 'resource-count',
      unit: 'count',
      operator: 'less-than-or-equal',
      threshold: 10,
    }),
    Object.freeze({
      metricId: 'scenario-duration',
      unit: 'ms',
      operator: 'less-than-or-equal',
      threshold: 100,
    }),
  ]),
});
const programWithoutDigest = Object.freeze({
  scenarioId: 'scenario.performance',
  scenarioDigest: sha('8'),
  workspaceRevision: 1,
  semanticSnapshotDigest: sha('9'),
  executableSnapshotDigest: sha('a'),
  compilerDigest: sha('b'),
  registryDigest: sha('c'),
  controlProfileDigest: sha('d'),
  fixtureSetDigests: Object.freeze([]),
  baselineSetDigests: Object.freeze([]),
  requiredCapabilities: Object.freeze([]),
  capabilityManifest: Object.freeze([]),
  targetManifest: Object.freeze([]),
  instructions: Object.freeze([]),
  observations: Object.freeze([]),
  sourceTrace: Object.freeze([]),
  budgets: Object.freeze({
    totalMs: 1_000,
    stepMs: 500,
    settleMs: 100,
  }),
});
const program = Object.freeze({
  ...programWithoutDigest,
  programDigest: digestBehaviorValue(programWithoutDigest),
}) satisfies BehaviorScenarioProgram;

const passingBehaviorReport = () => ({
  format: 'prodivix.playwright-browser-report',
  version: 1,
  tool: {
    name: 'playwright',
    version: '1.61.1',
    schemaDigest: sha('7'),
  },
  scenarioId: program.scenarioId,
  complete: true,
  exitCode: 0,
  checks: [
    {
      checkId: 'check.scenario',
      stepId: 'step.scenario',
      targetId: 'target.scenario',
      assertionCode: 'behavior.black-box-completed',
      status: 'passed',
      blackBox: true,
      durationMs: 0,
      diagnosticCodes: [],
    },
  ],
});

const inpPolicy = Object.freeze({
  ...policy,
  sampling: Object.freeze({
    warmupRuns: 0,
    sampleCount: 1,
    statistic: 'median' as const,
  }),
  thresholds: Object.freeze([
    Object.freeze({
      metricId: 'interaction-inp' as const,
      unit: 'ms' as const,
      operator: 'less-than-or-equal' as const,
      threshold: 200,
    }),
  ]),
});

const createInpObservationPage = (
  trustedInteractionCount: number,
  inp: number
): Page => {
  let timestamp = 100;
  return {
    setExtraHTTPHeaders: async () => undefined,
    evaluate: async (
      _pageFunction: (...values: never[]) => unknown,
      input: Readonly<{ requestedAction: string }>
    ) => {
      if (input.requestedAction === 'monotonic-now') {
        timestamp += 10;
        return { status: 'complete', timestampMs: timestamp };
      }
      if (input.requestedAction === 'reset-observation') {
        return { status: 'reset' };
      }
      if (input.requestedAction === 'start-frame-sample') {
        return { status: 'started' };
      }
      if (input.requestedAction === 'stop-frame-sample') {
        return { status: 'stopped' };
      }
      return {
        status: 'complete',
        format: 'prodivix.trusted-browser-performance-observation',
        version: 1,
        integrity: 'pre-author-native-capture-v1',
        navigationDuration: 12,
        navigationEntryCount: 1,
        resourceCount: 0,
        resourceBytes: 0,
        longTaskCount: 0,
        totalBlockingTime: 0,
        lcp: 0,
        lcpEntryCount: 0,
        cls: 0,
        inp,
        missedFrames: 0,
        frameRate: 60,
        frameCount: 16,
        trustedInteractionCount,
        supportedEntryTypes: ['event'],
      };
    },
  } as unknown as Page;
};

describe('Playwright performance collector', () => {
  it('binds the requested profile digest but reports provider-observed runtime axes', async () => {
    const headers: Readonly<Record<string, string>>[] = [];
    let reloads = 0;
    let behaviorRuns = 0;
    let timestamp = 100;
    const page = {
      setExtraHTTPHeaders: async (value: Readonly<Record<string, string>>) => {
        headers.push(value);
      },
      reload: async () => {
        reloads += 1;
      },
      evaluate: async (
        pageFunction: (...values: never[]) => unknown,
        input: Readonly<{ requestedAction: string }>
      ) => {
        expect(String(pageFunction)).not.toMatch(
          /getEntriesByType|requestAnimationFrame/u
        );
        if (input.requestedAction === 'monotonic-now') {
          const current = timestamp;
          timestamp += 10;
          return { status: 'complete', timestampMs: current };
        }
        if (input.requestedAction === 'stop-frame-sample') {
          return { status: 'stopped' };
        }
        if (input.requestedAction === 'reset-observation') {
          return { status: 'reset' };
        }
        return input.requestedAction === 'start-frame-sample'
          ? { status: 'started' }
          : {
              status: 'complete',
              format: 'prodivix.trusted-browser-performance-observation',
              version: 1,
              integrity: 'pre-author-native-capture-v1',
              navigationDuration: 12,
              navigationEntryCount: 1,
              resourceCount: 3,
              resourceBytes: 128,
              longTaskCount: 0,
              totalBlockingTime: 0,
              lcp: 8,
              lcpEntryCount: 1,
              cls: 0,
              inp: 0,
              missedFrames: 0,
              frameRate: 60,
              frameCount: 16,
              trustedInteractionCount: 0,
              supportedEntryTypes: ['resource'],
            };
      },
      waitForTimeout: async () => undefined,
    } as unknown as Page;

    const decoded = decodePerformancePayload(
      await collectPlaywrightPerformance({
        page,
        runtimeIdentity,
        policy,
        profileDigest: sha('a'),
        program,
        executeBehavior: async () => {
          behaviorRuns += 1;
          return passingBehaviorReport();
        },
        probeBinding: {
          propertyKey: 'trusted-probe',
          capability: 'opaque-capability',
        },
      })
    );

    expect(decoded.profileDigest).toBe(sha('a'));
    expect(decoded.environment).toMatchObject({
      machineClass: 'provider.actual',
      browserEngine: 'chromium',
      browserVersion: 'actual-browser',
      cacheClass: 'cold',
    });
    expect(decoded.environment).not.toEqual(policy.expectedEnvironment);
    expect(decoded.samples).toHaveLength(2);
    expect(
      decoded.samples.map(
        ({ metrics }) =>
          metrics.find(({ metricId }) => metricId === 'scenario-duration')
            ?.value
      )
    ).toEqual([10, 10]);
    expect(reloads).toBe(0);
    expect(behaviorRuns).toBe(3);
    expect(headers).toEqual([
      { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      {},
    ]);
  });

  it('rejects INP when an authored scenario returns no trusted browser interaction', async () => {
    await expect(
      collectPlaywrightPerformance({
        page: createInpObservationPage(0, 0),
        runtimeIdentity,
        policy: inpPolicy,
        profileDigest: sha('a'),
        program,
        executeBehavior: async () => passingBehaviorReport(),
        probeBinding: {
          propertyKey: 'trusted-probe',
          capability: 'opaque-capability',
        },
      })
    ).rejects.toThrow(/trusted browser interaction/u);
  });

  it('uses the Event Timing threshold as a conservative INP upper bound for a faster trusted interaction', async () => {
    const report = decodePerformancePayload(
      await collectPlaywrightPerformance({
        page: createInpObservationPage(1, 0),
        runtimeIdentity,
        policy: inpPolicy,
        profileDigest: sha('a'),
        program,
        executeBehavior: async () => passingBehaviorReport(),
        probeBinding: {
          propertyKey: 'trusted-probe',
          capability: 'opaque-capability',
        },
      })
    );

    expect(report.samples[0]?.metrics).toContainEqual({
      metricId: 'interaction-inp',
      unit: 'ms',
      value: PLAYWRIGHT_EVENT_DURATION_THRESHOLD_MS,
    });
  });

  it.each([
    [
      'largest-contentful-paint',
      { navigationEntryCount: 1, lcpEntryCount: 0, lcp: 0 },
    ],
    ['navigation', { navigationEntryCount: 0, lcpEntryCount: 1, lcp: 8 }],
    [
      'duplicate navigation',
      { navigationEntryCount: 2, lcpEntryCount: 1, lcp: 8 },
    ],
  ])(
    'rejects supported %s timing with invalid real entry cardinality',
    async (_missingEntry, observation) => {
      let timestamp = 100;
      const page = {
        setExtraHTTPHeaders: async () => undefined,
        reload: async () => undefined,
        evaluate: async (
          _pageFunction: (...values: never[]) => unknown,
          input: Readonly<{ requestedAction: string }>
        ) => {
          if (input.requestedAction === 'monotonic-now') {
            timestamp += 10;
            return { status: 'complete', timestampMs: timestamp };
          }
          if (input.requestedAction === 'reset-observation') {
            return { status: 'reset' };
          }
          if (input.requestedAction === 'start-frame-sample') {
            return { status: 'started' };
          }
          if (input.requestedAction === 'stop-frame-sample') {
            return { status: 'stopped' };
          }
          return {
            status: 'complete',
            format: 'prodivix.trusted-browser-performance-observation',
            version: 1,
            integrity: 'pre-author-native-capture-v1',
            navigationDuration: 12,
            navigationEntryCount: observation.navigationEntryCount,
            resourceCount: 0,
            resourceBytes: 0,
            longTaskCount: 0,
            totalBlockingTime: 0,
            lcp: observation.lcp,
            lcpEntryCount: observation.lcpEntryCount,
            cls: 0,
            inp: 0,
            missedFrames: 0,
            frameRate: 60,
            frameCount: 16,
            trustedInteractionCount: 0,
            supportedEntryTypes: ['largest-contentful-paint', 'navigation'],
          };
        },
      } as unknown as Page;
      const lcpPolicy = Object.freeze({
        ...policy,
        sampling: Object.freeze({
          warmupRuns: 0,
          sampleCount: 1,
          statistic: 'median' as const,
        }),
        thresholds: Object.freeze([
          Object.freeze({
            metricId: 'navigation-lcp' as const,
            unit: 'ms' as const,
            operator: 'less-than-or-equal' as const,
            threshold: 2_500,
          }),
        ]),
      });

      await expect(
        collectPlaywrightPerformance({
          page,
          runtimeIdentity,
          policy: lcpPolicy,
          profileDigest: sha('a'),
          program,
          executeBehavior: async () => passingBehaviorReport(),
          probeBinding: {
            propertyKey: 'trusted-probe',
            capability: 'opaque-capability',
          },
        })
      ).rejects.toThrow(/real (?:navigation|largest-contentful-paint) entr/u);
    }
  );

  it('rejects a non-passing Behavior Program before producing performance evidence', async () => {
    let timestamp = 100;
    const page = {
      setExtraHTTPHeaders: async () => undefined,
      reload: async () => undefined,
      evaluate: async (
        _pageFunction: (...values: never[]) => unknown,
        input: Readonly<{ requestedAction: string }>
      ) => {
        if (input.requestedAction === 'monotonic-now') {
          timestamp += 10;
          return { status: 'complete', timestampMs: timestamp };
        }
        if (input.requestedAction === 'reset-observation') {
          return { status: 'reset' };
        }
        if (input.requestedAction === 'start-frame-sample') {
          return { status: 'started' };
        }
        throw new Error('performance observation must not be collected');
      },
    } as unknown as Page;
    const base = passingBehaviorReport();
    const failed = {
      ...base,
      exitCode: 1,
      checks: [
        {
          ...base.checks[0]!,
          status: 'failed',
          diagnosticCodes: ['VER-BROWSER-ASSERTION-FAILED'],
        },
      ],
    };

    await expect(
      collectPlaywrightPerformance({
        page,
        runtimeIdentity,
        policy: {
          ...policy,
          sampling: {
            warmupRuns: 0,
            sampleCount: 1,
            statistic: 'median',
          },
        },
        profileDigest: sha('a'),
        program,
        executeBehavior: async () => failed,
        probeBinding: {
          propertyKey: 'trusted-probe',
          capability: 'opaque-capability',
        },
      })
    ).rejects.toThrow(/passing black-box Behavior Program/u);
  });
});
