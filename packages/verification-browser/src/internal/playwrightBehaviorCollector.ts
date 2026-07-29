import type {
  BehaviorJsonValue,
  BehaviorScenarioProgram,
  BehaviorSourceRef,
} from '@prodivix/behavior';
import { readBehaviorJsonValue } from '@prodivix/behavior';
import { performance as hostPerformance } from 'node:perf_hooks';
import { setTimeout as waitForHostTimer } from 'node:timers/promises';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import { digestVerificationValue } from '@prodivix/verification';
import type { VerificationPlanCell } from '@prodivix/verification';
import type { Page } from 'playwright-core';
import { semanticLocator } from './playwrightBehaviorProbe';
import {
  PLAYWRIGHT_SCHEMA_DIGEST,
  toolIdentity,
} from './playwrightBrowserShared';
import type { TrustedPageProbeBinding } from './playwrightTrustedPageProbe';

class BehaviorBudgetTimeoutError extends Error {
  constructor() {
    super('Behavior Program execution exceeded its canonical budget.');
    this.name = 'BehaviorBudgetTimeoutError';
  }
}

const withBehaviorDeadline = async <T>(
  deadline: number,
  operation: (timeoutMs: number) => Promise<T>
): Promise<T> => {
  const remaining = deadline - hostPerformance.now();
  if (remaining <= 0) throw new BehaviorBudgetTimeoutError();
  const timeoutMs = Math.max(1, Math.ceil(remaining));
  const controller = new AbortController();
  try {
    return await Promise.race([
      operation(timeoutMs),
      waitForHostTimer(timeoutMs, undefined, {
        signal: controller.signal,
      }).then(() => {
        throw new BehaviorBudgetTimeoutError();
      }),
    ]);
  } finally {
    controller.abort();
  }
};

const behaviorValueEquals = (
  actual: BehaviorJsonValue | undefined,
  expected: BehaviorJsonValue | undefined
): boolean =>
  actual !== undefined &&
  expected !== undefined &&
  sameCanonicalJson(actual, expected);

const assertionOutcome = (
  operator: string,
  actual: BehaviorJsonValue | undefined,
  expected: BehaviorJsonValue | undefined
): 'passed' | 'failed' | 'blocked' => {
  if (operator === 'equals') {
    return behaviorValueEquals(actual, expected) ? 'passed' : 'failed';
  }
  if (operator === 'not-equals') {
    return actual === undefined ||
      expected === undefined ||
      !sameCanonicalJson(actual, expected)
      ? 'passed'
      : 'failed';
  }
  if (operator === 'absent') {
    return actual === undefined || actual === null ? 'passed' : 'failed';
  }
  if (operator === 'contains') {
    if (typeof actual === 'string' && typeof expected === 'string') {
      return actual.includes(expected) ? 'passed' : 'failed';
    }
    if (Array.isArray(actual) && expected !== undefined) {
      return actual.some((entry) => sameCanonicalJson(entry, expected))
        ? 'passed'
        : 'failed';
    }
    if (
      isPlainObject(actual) &&
      typeof expected === 'string' &&
      Object.hasOwn(actual, expected)
    ) {
      return 'passed';
    }
    return 'failed';
  }
  return 'blocked';
};

const sourceTraceDigest = (
  source: BehaviorSourceRef | undefined
): string | undefined =>
  source === undefined ? undefined : digestVerificationValue(source);

const ROUTE_LOADER_OBSERVATION_SELECTOR =
  '[data-prodivix-route-loader="ready"]';
const ROUTE_RUNTIME_STATUS_ATTRIBUTE = 'data-prodivix-route-runtime';

const routeRuntimeStatusExpectation = (
  expected: BehaviorJsonValue
): string | undefined => {
  if (
    !isPlainObject(expected) ||
    Object.keys(expected).length !== 1 ||
    typeof expected.status !== 'string' ||
    !['denied', 'empty', 'failed', 'pending'].includes(expected.status)
  ) {
    return undefined;
  }
  return expected.status;
};

const readRouteObservation = async (
  page: Page,
  expected: BehaviorJsonValue | undefined,
  timeoutMs: number
): Promise<BehaviorJsonValue | undefined> => {
  if (typeof expected === 'string') {
    return new URL(page.url()).pathname;
  }
  if (expected === undefined) return undefined;
  const runtimeStatus = routeRuntimeStatusExpectation(expected);
  if (runtimeStatus !== undefined) {
    const status = page.locator(
      `[${ROUTE_RUNTIME_STATUS_ATTRIBUTE}="${runtimeStatus}"]`
    );
    await status.first().waitFor({ state: 'attached', timeout: timeoutMs });
    if ((await status.count()) !== 1) return undefined;
    return Object.freeze({ status: runtimeStatus });
  }
  const output = page.locator(ROUTE_LOADER_OBSERVATION_SELECTOR);
  await output.first().waitFor({ state: 'attached', timeout: timeoutMs });
  if ((await output.count()) !== 1) return undefined;
  const text = await output.first().textContent({ timeout: timeoutMs });
  if (text === null || new TextEncoder().encode(text).byteLength > 16_384) {
    return undefined;
  }
  try {
    return readBehaviorJsonValue(JSON.parse(text), {
      maximumDepth: 8,
      maximumNodes: 128,
      maximumStringLength: 4_096,
      maximumUtf8Bytes: 16_384,
    });
  } catch {
    return undefined;
  }
};

export type PlaywrightBehaviorExecutionHooks = Readonly<{
  afterNavigation?(): Promise<void>;
}>;

export const executePlaywrightBehavior = async (
  input: Readonly<{
    page: Page;
    origin: string;
    cell: VerificationPlanCell;
    program: BehaviorScenarioProgram;
    trustedPageProbe: TrustedPageProbeBinding;
    hooks?: PlaywrightBehaviorExecutionHooks;
  }>
): Promise<unknown> => {
  const { page, origin, cell, program, trustedPageProbe, hooks } = input;
  const checks: Array<Record<string, unknown>> = [];
  const targetIds = new Set(
    program.targetManifest.map(({ targetId }) => targetId)
  );
  const sourceByInstruction = new Map(
    program.sourceTrace.map(({ instructionId, source }) => [
      instructionId,
      source,
    ])
  );
  const observationsByStep = new Map(
    program.observations.map((observation) => [observation.stepId, observation])
  );
  const evaluatedObservationSteps = new Set<string>();
  const { settleMs, stepMs, totalMs } = program.budgets;
  if (
    ![settleMs, stepMs, totalMs].every(
      (value) => Number.isSafeInteger(value) && value > 0
    ) ||
    settleMs > totalMs ||
    stepMs > totalMs
  ) {
    throw new TypeError(
      'Behavior Program settle budget must be a positive bounded integer.'
    );
  }
  const scenarioStartedAt = hostPerformance.now();
  const scenarioDeadline = scenarioStartedAt + totalMs;
  let executionHalted = false;

  const evaluateObservation = async (
    observation: BehaviorScenarioProgram['observations'][number]
  ): Promise<void> => {
    const startedAt = hostPerformance.now();
    const settleDeadline = startedAt + settleMs;
    const stepDeadline = startedAt + stepMs;
    const deadline = Math.min(settleDeadline, stepDeadline, scenarioDeadline);
    let actual: BehaviorJsonValue | undefined;
    let observable = false;
    let traceDigest: string | undefined;
    let statuses: readonly ('passed' | 'failed' | 'blocked')[] = [];
    let timedOut = false;
    do {
      let currentObservable = true;
      try {
        await withBehaviorDeadline(deadline, async (timeoutMs) => {
          if (observation.kind === 'route') {
            actual = await readRouteObservation(
              page,
              observation.expected,
              timeoutMs
            );
            currentObservable = actual !== undefined;
            return;
          }
          const target = await semanticLocator(
            page,
            observation.targetId,
            program.targetManifest,
            trustedPageProbe
          );
          traceDigest = target?.sourceTraceDigest;
          if (target === undefined) {
            currentObservable = false;
          } else if (observation.kind === 'visible') {
            actual = await target.locator.isVisible({ timeout: timeoutMs });
          } else if (observation.kind === 'enabled') {
            actual = await target.locator.isEnabled({ timeout: timeoutMs });
          } else if (observation.kind === 'value') {
            actual = await target.locator.inputValue({ timeout: timeoutMs });
          } else {
            currentObservable = false;
          }
        });
      } catch (error) {
        currentObservable = false;
        if (
          error instanceof BehaviorBudgetTimeoutError ||
          (error instanceof Error && error.name === 'TimeoutError')
        ) {
          timedOut = true;
        }
      }
      observable ||= currentObservable;
      statuses = observation.assertions.map((assertion) =>
        !observable
          ? 'blocked'
          : assertionOutcome(assertion.operator, actual, assertion.expected)
      );
      if (statuses.every((status) => status === 'passed')) break;
      if (timedOut) break;
      const remaining = deadline - hostPerformance.now();
      if (remaining <= 0) break;
      const pollInterval = Math.max(
        1,
        Math.min(remaining, Math.ceil(settleMs / 64))
      );
      await waitForHostTimer(pollInterval);
    } while (hostPerformance.now() <= deadline);
    if (
      !statuses.every((status) => status === 'passed') &&
      hostPerformance.now() >= deadline
    ) {
      timedOut = true;
    }
    const durationMs = Math.ceil(hostPerformance.now() - startedAt);
    const timeoutCode =
      scenarioDeadline <= stepDeadline && scenarioDeadline <= settleDeadline
        ? 'VER-BROWSER-SCENARIO-TIMEOUT'
        : stepDeadline <= settleDeadline
          ? 'VER-BROWSER-OBSERVATION-STEP-TIMEOUT'
          : 'VER-BROWSER-ASSERTION-SETTLE-TIMEOUT';
    if (
      timeoutCode !== 'VER-BROWSER-ASSERTION-SETTLE-TIMEOUT' &&
      !statuses.every((status) => status === 'passed')
    ) {
      timedOut = true;
      statuses = observation.assertions.map(() => 'blocked');
    }
    for (let index = 0; index < observation.assertions.length; index += 1) {
      const assertion = observation.assertions[index]!;
      const status = statuses[index] ?? 'blocked';
      checks.push({
        checkId: `${program.scenarioId}:${observation.stepId}:${assertion.id}`,
        stepId: observation.stepId,
        targetId: observation.targetId,
        assertionCode: assertion.id,
        status,
        blackBox: true,
        durationMs,
        diagnosticCodes:
          status === 'passed'
            ? []
            : [
                status === 'blocked'
                  ? timedOut
                    ? timeoutCode
                    : 'VER-BROWSER-OBSERVATION-UNSUPPORTED'
                  : timeoutCode,
              ],
        ...(traceDigest === undefined
          ? {}
          : { sourceTraceDigest: traceDigest }),
      });
    }
    evaluatedObservationSteps.add(observation.stepId);
  };

  for (const instruction of program.instructions) {
    const operation = instruction.operation;
    const targetId = instruction.targetId;
    if (hostPerformance.now() >= scenarioDeadline) {
      const authoredObservation = operation.startsWith('observe:')
        ? observationsByStep.get(instruction.stepId)
        : undefined;
      if (authoredObservation === undefined) {
        checks.push({
          checkId: `${program.scenarioId}:${instruction.id}`,
          stepId: instruction.stepId,
          targetId: targetId ?? cell.targetId,
          assertionCode: `behavior.${operation}`,
          status: 'failed',
          blackBox: true,
          durationMs: 0,
          diagnosticCodes: ['VER-BROWSER-SCENARIO-TIMEOUT'],
        });
      } else {
        await evaluateObservation(authoredObservation);
      }
      executionHalted = true;
      break;
    }
    if (operation.startsWith('trigger:') || operation === 'barrier') {
      continue;
    }
    if (operation.startsWith('observe:')) {
      const observation = observationsByStep.get(instruction.stepId);
      if (observation === undefined) {
        const digest = sourceTraceDigest(
          sourceByInstruction.get(instruction.id)
        );
        checks.push({
          checkId: `${program.scenarioId}:${instruction.id}`,
          stepId: instruction.stepId,
          targetId: targetId ?? cell.targetId,
          assertionCode: operation,
          status: 'blocked',
          blackBox: true,
          durationMs: 0,
          diagnosticCodes: ['VER-BROWSER-OBSERVATION-MISSING'],
          ...(digest === undefined ? {} : { sourceTraceDigest: digest }),
        });
      } else {
        await evaluateObservation(observation);
      }
      continue;
    }

    let status: 'passed' | 'failed' | 'blocked' = 'passed';
    const diagnosticCodes: string[] = [];
    const instructionStartedAt = hostPerformance.now();
    const instructionDeadline = Math.min(
      instructionStartedAt + stepMs,
      scenarioDeadline
    );
    let traceDigest = sourceTraceDigest(
      sourceByInstruction.get(instruction.id)
    );
    try {
      if (operation === 'navigate') {
        const destination =
          typeof instruction.input === 'string'
            ? new URL(instruction.input, origin)
            : new URL(origin);
        if (destination.origin !== origin) {
          throw new Error('cross-origin navigation denied');
        }
        await withBehaviorDeadline(instructionDeadline, async (timeoutMs) => {
          if (new URL(page.url()).href !== destination.href) {
            await page.goto(destination.href, {
              waitUntil: 'networkidle',
              timeout: timeoutMs,
            });
          }
          if (new URL(page.url()).origin !== origin) {
            throw new Error('cross-origin redirect denied');
          }
          await hooks?.afterNavigation?.();
        });
      } else if (
        operation === 'semantic-click' ||
        operation === 'semantic-input'
      ) {
        if (!targetId || !targetIds.has(targetId)) {
          status = 'blocked';
          diagnosticCodes.push('VER-BROWSER-SEMANTIC-TARGET-MISSING');
        } else {
          const target = await withBehaviorDeadline(instructionDeadline, () =>
            semanticLocator(
              page,
              targetId,
              program.targetManifest,
              trustedPageProbe
            )
          );
          traceDigest = target?.sourceTraceDigest ?? traceDigest;
          if (target === undefined) {
            status = 'blocked';
            diagnosticCodes.push('VER-BROWSER-SEMANTIC-TARGET-UNRESOLVED');
          } else if (operation === 'semantic-click') {
            await withBehaviorDeadline(
              instructionDeadline,
              async (timeoutMs) => {
                await target.locator.click({ timeout: timeoutMs });
              }
            );
          } else if (typeof instruction.input === 'string') {
            await withBehaviorDeadline(
              instructionDeadline,
              async (timeoutMs) => {
                await target.locator.fill(instruction.input as string, {
                  timeout: timeoutMs,
                });
              }
            );
          } else {
            status = 'blocked';
            diagnosticCodes.push('VER-BROWSER-SEMANTIC-INPUT-UNSUPPORTED');
          }
        }
      } else if (operation === 'wait-observation') {
        if (!targetId || !targetIds.has(targetId)) {
          status = 'blocked';
          diagnosticCodes.push('VER-BROWSER-SEMANTIC-TARGET-MISSING');
        }
      } else {
        status = 'blocked';
        diagnosticCodes.push('VER-BROWSER-CAPABILITY-UNSUPPORTED');
      }
    } catch (error) {
      status = 'failed';
      diagnosticCodes.push(
        error instanceof BehaviorBudgetTimeoutError ||
          (error instanceof Error && error.name === 'TimeoutError')
          ? instructionDeadline === scenarioDeadline
            ? 'VER-BROWSER-SCENARIO-TIMEOUT'
            : 'VER-BROWSER-ACTION-STEP-TIMEOUT'
          : 'VER-BROWSER-ACTION-FAILED'
      );
    }
    if (status !== 'passed') {
      checks.push({
        checkId: `${program.scenarioId}:${instruction.id}`,
        stepId: instruction.stepId,
        targetId: targetId ?? cell.targetId,
        assertionCode: `behavior.${operation}`,
        status,
        blackBox: true,
        durationMs: Math.ceil(hostPerformance.now() - instructionStartedAt),
        diagnosticCodes,
        ...(traceDigest === undefined
          ? {}
          : { sourceTraceDigest: traceDigest }),
      });
      if (status === 'failed') {
        executionHalted = true;
        break;
      }
    }
  }

  for (const observation of executionHalted ? [] : program.observations) {
    if (!evaluatedObservationSteps.has(observation.stepId)) {
      await evaluateObservation(observation);
    }
  }
  if (checks.length === 0) {
    checks.push({
      checkId: `${program.scenarioId}:black-box-proof`,
      stepId: 'scenario',
      targetId: cell.targetId,
      assertionCode: 'behavior.black-box-completed',
      status: 'passed',
      blackBox: true,
      durationMs: 0,
      diagnosticCodes: [],
    });
  }
  const passed = checks.every(({ status }) => status === 'passed');
  return {
    format: 'prodivix.playwright-browser-report',
    version: 1,
    tool: toolIdentity(PLAYWRIGHT_SCHEMA_DIGEST),
    scenarioId: program.scenarioId,
    complete: true,
    exitCode: passed ? 0 : 1,
    checks,
  };
};
