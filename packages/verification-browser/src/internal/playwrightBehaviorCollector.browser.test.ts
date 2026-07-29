import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type { VerificationPlanCell } from '@prodivix/verification';
import { chromium } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { decodePlaywrightBehaviorPayload } from '../playwrightPrivatePayload';
import { executePlaywrightBehavior } from './playwrightBehaviorCollector';
import { installPlaywrightTrustedPageProbe } from './playwrightTrustedPageProbe';

const enabled =
  process.env.PRODIVIX_VERIFY_G3_V6_BROWSER_MATRIX?.trim() === '1';

const program = (settleMs: number): BehaviorScenarioProgram =>
  ({
    scenarioId: 'scenario.delayed-dom-mutation',
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
        id: 'instruction.click',
        stepId: 'step.click',
        dependencyInstructionIds: [],
        operation: 'semantic-click',
        targetId: 'target.trigger',
      },
      {
        id: 'instruction.wait',
        stepId: 'step.wait',
        dependencyInstructionIds: ['instruction.click'],
        operation: 'wait-observation',
        targetId: 'target.status',
      },
      {
        id: 'instruction.observe',
        stepId: 'step.observe',
        dependencyInstructionIds: ['instruction.wait'],
        operation: 'observe:pir.visible',
        targetId: 'target.status',
      },
    ],
    observations: [
      {
        stepId: 'step.observe',
        kind: 'visible',
        targetId: 'target.status',
        assertionIds: ['assert.visible'],
        assertions: [
          {
            id: 'assert.visible',
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
      totalMs: 1_000,
      stepMs: 500,
      settleMs,
    },
  }) as unknown as BehaviorScenarioProgram;

const cell = {
  targetId: 'target.status',
} as VerificationPlanCell;

const fixture = (delayMs: number): string => `<!doctype html>
<html lang="en">
  <body>
    <button
      type="button"
      data-pir-document-id="page-catalog"
      data-pir-node-id="trigger"
      id="trigger"
    >Reveal status</button>
    <div
      data-pir-document-id="page-catalog"
      data-pir-node-id="status"
      id="status"
      hidden
    >Ready</div>
    <script>
      document.getElementById('trigger').addEventListener('click', () => {
        setTimeout(() => {
          document.getElementById('status').hidden = false;
        }, ${delayMs});
      });
    </script>
  </body>
</html>`;

const executeFixture = async (delayMs: number, settleMs: number) => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const trustedPageProbe = await installPlaywrightTrustedPageProbe(page);
    await page.route('http://localhost/**', (route) =>
      route.fulfill({
        body: fixture(delayMs),
        contentType: 'text/html; charset=utf-8',
        status: 200,
      })
    );
    await page.goto('http://localhost/', { waitUntil: 'load' });
    return decodePlaywrightBehaviorPayload(
      await executePlaywrightBehavior({
        page,
        origin: 'http://localhost',
        cell,
        program: program(settleMs),
        trustedPageProbe,
      })
    );
  } finally {
    await browser.close();
  }
};

describe.skipIf(!enabled)('Playwright Behavior real DOM settle', () => {
  it('passes a delayed mutation inside the authored settle budget', async () => {
    const report = await executeFixture(30, 250);
    expect(report.exitCode).toBe(0);
    expect(report.checks).toEqual([
      expect.objectContaining({
        status: 'passed',
        assertionCode: 'assert.visible',
      }),
    ]);
  }, 30_000);

  it('fails a visible-state mutation after the authored settle budget', async () => {
    const report = await executeFixture(500, 150);
    expect(report.exitCode).toBe(1);
    expect(report.checks).toEqual([
      expect.objectContaining({
        status: 'failed',
        diagnosticCodes: ['VER-BROWSER-ASSERTION-SETTLE-TIMEOUT'],
      }),
    ]);
  }, 30_000);
});
