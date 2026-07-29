import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type { VerificationPlanCell } from '@prodivix/verification';
import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { decodePlaywrightBehaviorPayload } from '../playwrightPrivatePayload';
import { executePlaywrightBehavior } from './playwrightBehaviorCollector';

class SettlingPage {
  readonly visibleAfterReads: number;
  reads = 0;

  constructor(visibleAfterReads: number) {
    this.visibleAfterReads = visibleAfterReads;
  }

  url(): string {
    return 'http://localhost/';
  }

  async evaluate(): Promise<unknown> {
    return { status: 'single', index: 0 };
  }

  locator() {
    return {
      nth: () => ({
        click: async (): Promise<void> => undefined,
        fill: async (): Promise<void> => undefined,
        isVisible: async () => {
          this.reads += 1;
          return this.reads >= this.visibleAfterReads;
        },
        isEnabled: async () => true,
        inputValue: async () => '',
      }),
    };
  }
}

class HangingActionPage extends SettlingPage {
  override locator() {
    return {
      nth: () => ({
        click: async () => new Promise<void>(() => undefined),
        fill: async (): Promise<void> => undefined,
        isVisible: async () => true,
        isEnabled: async () => true,
        inputValue: async () => '',
      }),
    };
  }
}

class MissingTargetPage extends SettlingPage {
  override async evaluate(): Promise<unknown> {
    return { status: 'none', index: -1 };
  }
}

class RedirectingPage extends SettlingPage {
  currentUrl = 'http://localhost/';

  override url(): string {
    return this.currentUrl;
  }

  async goto(): Promise<null> {
    this.currentUrl = 'https://unexpected.invalid/catalog';
    return null;
  }
}

class RouteLoaderPage {
  readonly loaderText: string;

  constructor(loaderValue: unknown) {
    this.loaderText = JSON.stringify(loaderValue);
  }

  url(): string {
    return 'http://localhost/catalog';
  }

  locator(selector: string) {
    const matched = selector === '[data-prodivix-route-loader="ready"]';
    return {
      count: async () => (matched ? 1 : 0),
      first: () => ({
        waitFor: async (): Promise<void> => undefined,
        textContent: async () => (matched ? this.loaderText : null),
      }),
    };
  }
}

class RouteRuntimeStatusPage {
  readonly status: string;

  constructor(status: string) {
    this.status = status;
  }

  url(): string {
    return 'http://localhost/catalog';
  }

  locator(selector: string) {
    const matched =
      selector === `[data-prodivix-route-runtime="${this.status}"]`;
    return {
      count: async () => (matched ? 1 : 0),
      first: () => ({
        waitFor: async (): Promise<void> => undefined,
      }),
    };
  }
}

const program = (settleMs: number): BehaviorScenarioProgram =>
  ({
    scenarioId: 'scenario.delayed-visibility',
    targetManifest: [
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
        id: 'instruction.wait',
        stepId: 'step.wait',
        dependencyInstructionIds: [],
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
        expected: true,
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

const routeLoaderProgram = (
  expected:
    | Readonly<{ providerId: string; principalId: string }>
    | Readonly<{ status: string }>
): BehaviorScenarioProgram =>
  ({
    scenarioId: 'scenario.authenticated-route-loader',
    targetManifest: [
      {
        targetId: 'target.catalog-route',
        semanticSymbolId: 'symbol.catalog-route',
        capability: 'behavior:route:location',
        source: {
          workspaceDocumentId: 'routes',
          path: '/catalog',
        },
      },
    ],
    instructions: [
      {
        id: 'instruction.observe-auth-principal',
        stepId: 'step.observe-auth-principal',
        dependencyInstructionIds: [],
        operation: 'observe:route.location',
        targetId: 'target.catalog-route',
      },
    ],
    observations: [
      {
        stepId: 'step.observe-auth-principal',
        kind: 'route',
        targetId: 'target.catalog-route',
        expected,
        assertionIds: ['catalog-auth-principal-equals'],
        assertions: [
          {
            id: 'catalog-auth-principal-equals',
            operator: 'equals',
            expected,
          },
        ],
        automatonDigest:
          'sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      },
    ],
    sourceTrace: [],
    budgets: {
      totalMs: 1_000,
      stepMs: 500,
      settleMs: 64,
    },
  }) as unknown as BehaviorScenarioProgram;

describe('Playwright Behavior observation settle', () => {
  it('reads the exact generated route-loader principal as a black-box route lifecycle value', async () => {
    const expected = Object.freeze({
      providerId: 'prodivix-product-session',
      principalId: 'golden-catalog-owner',
    });
    const report = decodePlaywrightBehaviorPayload(
      await executePlaywrightBehavior({
        page: new RouteLoaderPage(expected) as unknown as Page,
        origin: 'http://localhost',
        cell,
        program: routeLoaderProgram(expected),
        trustedPageProbe: {
          propertyKey: 'trusted',
          capability: 'opaque',
        },
      })
    );

    expect(report.exitCode).toBe(0);
    expect(report.checks).toEqual([
      expect.objectContaining({
        assertionCode: 'catalog-auth-principal-equals',
        status: 'passed',
        blackBox: true,
      }),
    ]);
  });

  it('fails the route lifecycle assertion when the consumed principal is wrong', async () => {
    const expected = Object.freeze({
      providerId: 'prodivix-product-session',
      principalId: 'golden-catalog-owner',
    });
    const report = decodePlaywrightBehaviorPayload(
      await executePlaywrightBehavior({
        page: new RouteLoaderPage({
          ...expected,
          principalId: 'wrong-principal',
        }) as unknown as Page,
        origin: 'http://localhost',
        cell,
        program: routeLoaderProgram(expected),
        trustedPageProbe: {
          propertyKey: 'trusted',
          capability: 'opaque',
        },
      })
    );

    expect(report.exitCode).toBe(1);
    expect(report.checks).toEqual([
      expect.objectContaining({
        assertionCode: 'catalog-auth-principal-equals',
        status: 'failed',
      }),
    ]);
  });

  it('observes the generated route-runtime denied product state', async () => {
    const expected = Object.freeze({ status: 'denied' });
    const report = decodePlaywrightBehaviorPayload(
      await executePlaywrightBehavior({
        page: new RouteRuntimeStatusPage('denied') as unknown as Page,
        origin: 'http://localhost',
        cell,
        program: routeLoaderProgram(expected),
        trustedPageProbe: {
          propertyKey: 'trusted',
          capability: 'opaque',
        },
      })
    );

    expect(report.exitCode).toBe(0);
    expect(report.checks).toEqual([
      expect.objectContaining({
        assertionCode: 'catalog-auth-principal-equals',
        status: 'passed',
        blackBox: true,
      }),
    ]);
  });

  it('polls a delayed semantic mutation until the authored observation passes', async () => {
    const page = new SettlingPage(2);
    const report = decodePlaywrightBehaviorPayload(
      await executePlaywrightBehavior({
        page: page as unknown as Page,
        origin: 'http://localhost',
        cell,
        program: program(64),
        trustedPageProbe: {
          propertyKey: 'trusted',
          capability: 'opaque',
        },
      })
    );

    expect(page.reads).toBeGreaterThanOrEqual(2);
    expect(report.exitCode).toBe(0);
    expect(report.checks).toEqual([
      expect.objectContaining({
        assertionCode: 'assert.visible',
        status: 'passed',
      }),
    ]);
  });

  it('fails closed with an explicit settle timeout when the mutation never arrives', async () => {
    const page = new SettlingPage(Number.MAX_SAFE_INTEGER);
    const report = decodePlaywrightBehaviorPayload(
      await executePlaywrightBehavior({
        page: page as unknown as Page,
        origin: 'http://localhost',
        cell,
        program: program(64),
        trustedPageProbe: {
          propertyKey: 'trusted',
          capability: 'opaque',
        },
      })
    );

    expect(page.reads).toBeGreaterThan(1);
    expect(report.exitCode).toBe(1);
    expect(report.checks).toEqual([
      expect.objectContaining({
        assertionCode: 'assert.visible',
        status: 'failed',
        diagnosticCodes: ['VER-BROWSER-ASSERTION-SETTLE-TIMEOUT'],
      }),
    ]);
  });

  it('keeps an absent semantic target blocked with an explicit settle timeout', async () => {
    const report = decodePlaywrightBehaviorPayload(
      await executePlaywrightBehavior({
        page: new MissingTargetPage(1) as unknown as Page,
        origin: 'http://localhost',
        cell,
        program: program(20),
        trustedPageProbe: {
          propertyKey: 'trusted',
          capability: 'opaque',
        },
      })
    );

    expect(report.checks).toEqual([
      expect.objectContaining({
        assertionCode: 'assert.visible',
        status: 'blocked',
        diagnosticCodes: ['VER-BROWSER-ASSERTION-SETTLE-TIMEOUT'],
      }),
    ]);
  });

  it('bounds a hanging semantic action by the canonical step budget', async () => {
    const base = program(10);
    const actionProgram = {
      ...base,
      instructions: [
        {
          id: 'instruction.click',
          stepId: 'step.click',
          dependencyInstructionIds: [],
          operation: 'semantic-click',
          targetId: 'target.status',
        },
      ],
      observations: [],
      budgets: {
        totalMs: 100,
        stepMs: 10,
        settleMs: 10,
      },
    } as unknown as BehaviorScenarioProgram;
    const report = decodePlaywrightBehaviorPayload(
      await executePlaywrightBehavior({
        page: new HangingActionPage(1) as unknown as Page,
        origin: 'http://localhost',
        cell,
        program: actionProgram,
        trustedPageProbe: {
          propertyKey: 'trusted',
          capability: 'opaque',
        },
      })
    );

    expect(report.exitCode).toBe(1);
    expect(report.checks).toEqual([
      expect.objectContaining({
        assertionCode: 'behavior.semantic-click',
        status: 'failed',
        diagnosticCodes: ['VER-BROWSER-ACTION-STEP-TIMEOUT'],
      }),
    ]);
  });

  it('rejects a cross-origin redirect before running navigation hooks', async () => {
    const base = program(10);
    const navigationProgram = {
      ...base,
      instructions: [
        {
          id: 'instruction.navigate',
          stepId: 'step.navigate',
          dependencyInstructionIds: [],
          operation: 'navigate',
          input: '/catalog',
        },
      ],
      observations: [],
    } as unknown as BehaviorScenarioProgram;
    let hookRuns = 0;
    const report = decodePlaywrightBehaviorPayload(
      await executePlaywrightBehavior({
        page: new RedirectingPage(1) as unknown as Page,
        origin: 'http://localhost',
        cell,
        program: navigationProgram,
        trustedPageProbe: {
          propertyKey: 'trusted',
          capability: 'opaque',
        },
        hooks: {
          afterNavigation: async () => {
            hookRuns += 1;
          },
        },
      })
    );

    expect(hookRuns).toBe(0);
    expect(report.checks).toEqual([
      expect.objectContaining({
        assertionCode: 'behavior.navigate',
        status: 'failed',
        diagnosticCodes: ['VER-BROWSER-ACTION-FAILED'],
      }),
    ]);
  });

  it('shares one absolute total budget across multiple observations', async () => {
    const base = program(45);
    const first = base.observations[0]!;
    const second = {
      ...first,
      stepId: 'step.observe-second',
      assertionIds: ['assert.visible-second'],
      assertions: [
        {
          id: 'assert.visible-second',
          operator: 'equals' as const,
          expected: true,
        },
      ],
    };
    const multiProgram = {
      ...base,
      instructions: [
        {
          id: 'instruction.observe-first',
          stepId: first.stepId,
          dependencyInstructionIds: [],
          operation: 'observe:pir.visible',
          targetId: first.targetId,
        },
        {
          id: 'instruction.observe-second',
          stepId: second.stepId,
          dependencyInstructionIds: ['instruction.observe-first'],
          operation: 'observe:pir.visible',
          targetId: second.targetId,
        },
      ],
      observations: [first, second],
      budgets: {
        totalMs: 50,
        stepMs: 48,
        settleMs: 45,
      },
    } as unknown as BehaviorScenarioProgram;
    const startedAt = performance.now();
    const report = decodePlaywrightBehaviorPayload(
      await executePlaywrightBehavior({
        page: new SettlingPage(Number.MAX_SAFE_INTEGER) as unknown as Page,
        origin: 'http://localhost',
        cell,
        program: multiProgram,
        trustedPageProbe: {
          propertyKey: 'trusted',
          capability: 'opaque',
        },
      })
    );
    const elapsed = performance.now() - startedAt;

    expect(elapsed).toBeLessThan(150);
    expect(report.exitCode).toBe(1);
    expect(report.checks).toHaveLength(2);
    expect(
      report.checks.find(
        ({ assertionCode }) => assertionCode === 'assert.visible-second'
      )
    ).toMatchObject({
      status: 'blocked',
      diagnosticCodes: ['VER-BROWSER-SCENARIO-TIMEOUT'],
    });
  });
});
