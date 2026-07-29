import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import {
  createVerificationBehaviorAssertionReceipt,
  type VerificationPlanCell,
} from '@prodivix/verification';
import { chromium } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import type {
  BrowserVerificationCellInput,
  BrowserVerificationCellPolicy,
  BrowserVerificationRuntimeIdentity,
  BrowserVisualCellProfile,
} from './browserAdapter.types';
import type { BrowserBehaviorAssertionObservation } from './browserBehaviorAssertionReceipt';
import { projectBrowserVisual } from './browserVerificationFunctionalProjection';
import type { BrowserToolSession } from './browserVerificationPort';
import { executePlaywrightBehavior } from './internal/playwrightBehaviorCollector';
import { installPlaywrightTrustedPageProbe } from './internal/playwrightTrustedPageProbe';
import { capturePlaywrightVisual } from './internal/playwrightVisualCollector';
import {
  decodePlaywrightBehaviorPayload,
  evaluatePlaywrightBehavior,
} from './playwrightPrivatePayload';

const enabled =
  process.env.PRODIVIX_VERIFY_G3_V6_BROWSER_MATRIX?.trim() === '1';
const sha = (character: string): string => `sha256-${character.repeat(64)}`;

const program = {
  scenarioId: 'scenario.visual-mutation',
  targetManifest: [
    {
      targetId: 'target.trigger',
      semanticSymbolId: 'symbol.trigger',
      capability: 'interaction',
      source: {
        workspaceDocumentId: 'page-catalog',
        path: '/nodesById/trigger',
      },
    },
    {
      targetId: 'target.capture',
      semanticSymbolId: 'symbol.capture',
      capability: 'visibility',
      source: {
        workspaceDocumentId: 'page-catalog',
        path: '/nodesById/capture',
      },
    },
  ],
  instructions: [
    {
      id: 'instruction.click',
      stepId: 'step.click',
      dependencyInstructionIds: [],
      operation: 'semantic-click',
      targetId: 'target.trigger',
    },
    {
      id: 'instruction.observe',
      stepId: 'step.visual-checkpoint',
      dependencyInstructionIds: ['instruction.click'],
      operation: 'observe:pir.visible',
      targetId: 'target.capture',
    },
  ],
  observations: [
    {
      stepId: 'step.visual-checkpoint',
      kind: 'visible',
      targetId: 'target.capture',
      assertionIds: ['assert.visible'],
      assertions: [
        { id: 'assert.visible', operator: 'equals', expected: true },
      ],
      automatonDigest: sha('a'),
    },
  ],
  sourceTrace: [],
  budgets: { totalMs: 5_000, stepMs: 2_000, settleMs: 500 },
} as unknown as BehaviorScenarioProgram;

const cell = {
  id: 'cell.visual-mutation',
  checkKind: 'visual',
  scenarioId: program.scenarioId,
  targetId: 'target.visual',
  frameworkTarget: 'react-vite',
  surface: 'ci',
  browserEngine: 'chromium',
} as VerificationPlanCell;
const runtimeIdentity = {
  machineClass: 'controlled-ci',
  operatingSystemImageDigest: sha('1'),
  browserImageDigest: sha('2'),
  browserEngine: 'chromium',
  browserVersion: 'controlled',
  fontSetDigest: sha('3'),
  viewport: {
    widthCssPixels: 800,
    heightCssPixels: 600,
    devicePixelRatio: 1,
  },
  colorScheme: 'light',
  motionPreference: 'reduced',
  locale: 'en-US',
  cacheClass: 'warm',
  rendererGeneration: 'renderer:1',
  normalizer: { id: 'rgba', version: '1' },
} satisfies BrowserVerificationRuntimeIdentity;
const html = `<!doctype html>
<html lang="en">
  <body>
    <button
      type="button"
      data-pir-document-id="page-catalog"
      data-pir-node-id="trigger"
      id="trigger"
    >Apply visual state</button>
    <div
      data-pir-document-id="page-catalog"
      data-pir-node-id="capture"
      id="capture"
      style="width:16px;height:16px;background:#000;transform:translateY(0.5px)"
    ></div>
    <script>
      document.getElementById('trigger').addEventListener('click', () => {
        document.getElementById('capture').style.background = '#f00';
      });
    </script>
  </body>
</html>`;

describe.skipIf(!enabled)('visual projection real Scenario state', () => {
  it('compares the post-checkpoint raster rather than the initial target', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const trustedPageProbe = await installPlaywrightTrustedPageProbe(page);
      await page.route('http://localhost/**', (route) =>
        route.fulfill({
          body: html,
          contentType: 'text/html; charset=utf-8',
          status: 200,
        })
      );
      await page.goto('http://localhost/', { waitUntil: 'load' });
      const provisionalProfile = {
        kind: 'visual',
        observationId: 'observation.visual',
        stepId: 'step.visual-checkpoint',
        targetId: 'target.visual',
        captureTargetId: 'target.capture',
        baseline: {
          rasterDigest: sha('4'),
          profile: {},
        },
        threshold: {
          maximumChannelDelta: 0,
          maximumChangedPixels: 0,
          maximumChangedRatio: 0,
        },
        masks: [],
      } as unknown as BrowserVisualCellProfile;
      await executePlaywrightBehavior({
        page,
        origin: 'http://localhost',
        cell,
        program,
        trustedPageProbe,
      });
      const baseline = await capturePlaywrightVisual({
        page,
        cell,
        profile: provisionalProfile,
        targetManifest: program.targetManifest,
        runtimeIdentity,
        trustedPageProbe,
      });
      expect(context.pages()).toEqual([page]);
      await page.reload({ waitUntil: 'load' });
      expect(
        await page
          .locator('#capture')
          .evaluate((element) => getComputedStyle(element).backgroundColor)
      ).toBe('rgb(0, 0, 0)');

      const visualProfile: BrowserVisualCellProfile = {
        ...provisionalProfile,
        baseline: {
          rasterDigest: baseline.digest,
          profile: baseline.profile,
        },
      };
      const input = {
        format: 'prodivix.browser-verification-cell-input',
        version: 1,
        cellId: cell.id,
        checkKind: 'visual',
        scenarioId: program.scenarioId,
        targetId: cell.targetId,
        frameworkTarget: cell.frameworkTarget,
        surface: cell.surface,
        browserEngine: cell.browserEngine,
        viewport: { width: 800, height: 600 },
        colorScheme: 'light',
        motion: 'reduced',
        locale: 'en-US',
        executableSnapshotDigest: sha('5'),
        scenarioProgramDigest: sha('6'),
        controlProfileDigest: sha('7'),
        fixtureSetDigests: [],
        baselineSetDigest: sha('8'),
        targetLeaseBindingDigest: sha('9'),
        profile: visualProfile,
      } as BrowserVerificationCellInput;
      const session = {
        executeBehavior: () =>
          executePlaywrightBehavior({
            page,
            origin: 'http://localhost',
            cell,
            program,
            trustedPageProbe,
          }),
        captureVisual: () =>
          capturePlaywrightVisual({
            page,
            cell,
            profile: visualProfile,
            targetManifest: program.targetManifest,
            runtimeIdentity,
            trustedPageProbe,
          }),
      } as unknown as BrowserToolSession;
      const policy = {
        kind: 'visual',
        program,
        baselineImage: baseline.image,
      } as BrowserVerificationCellPolicy & Readonly<{ kind: 'visual' }>;
      const behaviorResult = evaluatePlaywrightBehavior(
        decodePlaywrightBehaviorPayload(await session.executeBehavior(program))
      );
      const behavior = Object.freeze({
        result: behaviorResult,
        receipt: createVerificationBehaviorAssertionReceipt({
          attemptId: 'attempt.visual-mutation',
          cellId: input.cellId,
          scenarioId: input.scenarioId,
          executableSnapshotDigest: input.executableSnapshotDigest,
          scenarioProgramDigest: input.scenarioProgramDigest,
          controlProfileDigest: input.controlProfileDigest,
          fixtureSetDigests: input.fixtureSetDigests,
          targetLeaseBindingDigest: input.targetLeaseBindingDigest,
          runtimeFixtureBindingDigest: sha('b'),
          blackBoxAssertionSetDigest: sha('c'),
        }),
      }) satisfies BrowserBehaviorAssertionObservation;

      const projection = await projectBrowserVisual(
        cell,
        input,
        policy,
        session,
        behavior
      );
      expect(projection.payload).toMatchObject({
        kind: 'visual',
        comparisons: [{ status: 'passed', changedPixels: 0 }],
      });
      expect(
        await page
          .locator('#capture')
          .evaluate((element) => getComputedStyle(element).backgroundColor)
      ).toBe('rgb(255, 0, 0)');
      expect(context.pages()).toEqual([page]);
    } finally {
      await browser.close();
    }
  }, 30_000);
});
