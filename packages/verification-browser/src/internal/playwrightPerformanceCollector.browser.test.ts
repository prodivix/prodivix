import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type { VerificationPlanCell } from '@prodivix/verification';
import { setTimeout as waitForTimer } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import type { BrowserVerificationRuntimeIdentity } from '../browserAdapter.types';
import {
  createPerformancePolicyDigest,
  decodePerformancePayload,
  type PerformancePolicyProfile,
} from '../performance';
import {
  decodePlaywrightBehaviorPayload,
  evaluatePlaywrightBehavior,
} from '../playwrightPrivatePayload';
import { executePlaywrightBehavior } from './playwrightBehaviorCollector';
import { collectPlaywrightPerformance } from './playwrightPerformanceCollector';
import { installPlaywrightPerformanceProbe } from './playwrightPerformanceProbe';
import { installPlaywrightTrustedPageProbe } from './playwrightTrustedPageProbe';

const enabled =
  process.env.PRODIVIX_VERIFY_G3_V6_BROWSER_MATRIX?.trim() === '1';
const sha = (character: string): string => `sha256-${character.repeat(64)}`;

const runtimeIdentity = Object.freeze({
  machineClass: 'controlled-ci',
  operatingSystemImageDigest: sha('1'),
  browserImageDigest: sha('2'),
  browserEngine: 'chromium',
  browserVersion: 'controlled',
  fontSetDigest: sha('3'),
  viewport: Object.freeze({
    widthCssPixels: 800,
    heightCssPixels: 600,
    devicePixelRatio: 1,
  }),
  colorScheme: 'light',
  motionPreference: 'full',
  locale: 'en-US',
  cacheClass: 'warm',
  rendererGeneration: 'renderer:controlled',
  normalizer: Object.freeze({ id: 'rgba', version: '1' }),
}) satisfies BrowserVerificationRuntimeIdentity;

const policy = Object.freeze({
  expectedEnvironment: Object.freeze({
    machineClass: runtimeIdentity.machineClass,
    operatingSystemImageDigest: runtimeIdentity.operatingSystemImageDigest,
    browserImageDigest: runtimeIdentity.browserImageDigest,
    browserEngine: runtimeIdentity.browserEngine,
    browserVersion: runtimeIdentity.browserVersion,
    fontSetDigest: runtimeIdentity.fontSetDigest,
    viewport: runtimeIdentity.viewport,
    colorScheme: runtimeIdentity.colorScheme,
    motionPreference: runtimeIdentity.motionPreference,
    locale: runtimeIdentity.locale,
    cacheClass: runtimeIdentity.cacheClass,
  }),
  sampling: Object.freeze({
    warmupRuns: 0,
    sampleCount: 1,
    statistic: 'median',
  }),
  thresholds: Object.freeze([
    Object.freeze({
      metricId: 'navigation-lcp',
      unit: 'ms',
      operator: 'less-than-or-equal',
      threshold: 2_500,
    }),
    Object.freeze({
      metricId: 'animation-missed-frame-count',
      unit: 'count',
      operator: 'less-than-or-equal',
      threshold: 100,
    }),
    Object.freeze({
      metricId: 'interaction-inp',
      unit: 'ms',
      operator: 'less-than-or-equal',
      threshold: 5_000,
    }),
    Object.freeze({
      metricId: 'scenario-duration',
      unit: 'ms',
      operator: 'less-than-or-equal',
      threshold: 5_000,
    }),
  ]),
}) satisfies PerformancePolicyProfile;

const program = {
  scenarioId: 'scenario.leading-navigation-performance',
  targetManifest: [
    {
      targetId: 'target.interaction',
      semanticSymbolId: 'symbol.interaction',
      capability: 'interaction',
      source: {
        workspaceDocumentId: 'page-catalog',
        path: '/nodesById/interaction',
      },
    },
    {
      targetId: 'target.status',
      semanticSymbolId: 'symbol.status',
      capability: 'visibility',
      source: {
        workspaceDocumentId: 'page-catalog',
        path: '/nodesById/status',
      },
    },
  ],
  instructions: [
    {
      id: 'instruction.navigate',
      stepId: 'step.navigate',
      dependencyInstructionIds: [],
      operation: 'navigate',
      input: '/catalog',
    },
    {
      id: 'instruction.click',
      stepId: 'step.click',
      dependencyInstructionIds: ['instruction.navigate'],
      operation: 'semantic-click',
      targetId: 'target.interaction',
    },
    {
      id: 'instruction.observe-status',
      stepId: 'step.observe-status',
      dependencyInstructionIds: ['instruction.click'],
      operation: 'observe:pir.visible',
      targetId: 'target.status',
    },
  ],
  observations: [
    {
      stepId: 'step.observe-status',
      kind: 'visible',
      targetId: 'target.status',
      expected: true,
      assertionIds: ['assert.status-visible'],
      assertions: [
        {
          id: 'assert.status-visible',
          operator: 'equals',
          expected: true,
        },
      ],
      automatonDigest:
        'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  ],
  sourceTrace: [],
  budgets: {
    totalMs: 10_000,
    stepMs: 5_000,
    settleMs: 1_000,
  },
} as unknown as BehaviorScenarioProgram;

const html = `<!doctype html>
<html lang="en">
  <body>
    <button
      type="button"
      data-pir-document-id="page-catalog"
      data-pir-node-id="interaction"
      id="interaction"
    >Run interaction</button>
    <p
      data-pir-document-id="page-catalog"
      data-pir-node-id="status"
      id="status"
      hidden
    >Complete</p>
    <script>
      document.getElementById('interaction').addEventListener('click', () => {
        const deadline = Date.now() + 160;
        while (Date.now() < deadline) {}
        document.getElementById('status').hidden = false;
      });
    </script>
  </body>
</html>`;

describe.skipIf(!enabled)(
  'Playwright performance collector leading navigation',
  () => {
    it('re-arms on the canonical navigation document before Scenario interaction', async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        const performanceProbe = await installPlaywrightPerformanceProbe(page);
        const trustedPageProbe = await installPlaywrightTrustedPageProbe(page);
        await page.route('http://localhost/**', async (route) => {
          if (new URL(route.request().url()).pathname === '/catalog') {
            await waitForTimer(120);
          }
          await route.fulfill({
            body: html,
            contentType: 'text/html; charset=utf-8',
            status: 200,
          });
        });
        await page.goto('http://localhost/', { waitUntil: 'load' });
        const behaviorPayloads: unknown[] = [];
        const report = decodePerformancePayload(
          await collectPlaywrightPerformance({
            page,
            runtimeIdentity,
            policy,
            profileDigest: createPerformancePolicyDigest(policy),
            program,
            executeBehavior: async (scenarioProgram, hooks) => {
              const payload = await executePlaywrightBehavior({
                page,
                origin: 'http://localhost',
                cell: {
                  targetId: 'target.interaction',
                } as VerificationPlanCell,
                program: scenarioProgram,
                trustedPageProbe,
                hooks,
              });
              behaviorPayloads.push(payload);
              return payload;
            },
            probeBinding: performanceProbe,
          })
        );

        expect(new URL(page.url()).pathname).toBe('/catalog');
        expect(behaviorPayloads).toHaveLength(1);
        const decodedBehavior = decodePlaywrightBehaviorPayload(
          behaviorPayloads[0]
        );
        expect(decodedBehavior).toMatchObject({
          scenarioId: program.scenarioId,
          checks: [
            {
              stepId: 'step.observe-status',
              assertionCode: 'assert.status-visible',
              status: 'passed',
              blackBox: true,
            },
          ],
        });
        expect(evaluatePlaywrightBehavior(decodedBehavior)).toMatchObject({
          scenarioId: program.scenarioId,
          verdict: 'passed',
          exitCode: 0,
        });
        const metrics = report.samples[0]!.metrics;
        expect(
          metrics.find(
            ({ metricId }) => metricId === 'animation-missed-frame-count'
          )?.value
        ).toBeGreaterThanOrEqual(1);
        expect(
          metrics.find(({ metricId }) => metricId === 'scenario-duration')
            ?.value
        ).toBeGreaterThanOrEqual(260);
        expect(
          metrics.find(({ metricId }) => metricId === 'interaction-inp')?.value
        ).toBeGreaterThan(0);
        expect(
          metrics.find(({ metricId }) => metricId === 'navigation-lcp')?.value
        ).toBeGreaterThan(0);
      } finally {
        await browser.close();
      }
    }, 30_000);
  }
);
