import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type { VerificationPlanCell } from '@prodivix/verification';
import type { Page } from 'playwright-core';
import { KEYBOARD_KEYS, type KeyboardFocusJourneySpec } from '../accessibility';
import {
  semanticLocator,
  semanticTargetIdentity,
} from './playwrightBehaviorProbe';
import {
  AXE_SCHEMA_DIGEST,
  AXE_VERSION,
  KEYBOARD_SCHEMA_DIGEST,
  toolIdentity,
} from './playwrightBrowserShared';
import {
  armTrustedDynamicAnnouncement,
  armTrustedKeyboardActivation,
  cleanupTrustedDynamicAnnouncement,
  cleanupTrustedKeyboardActivation,
  observeTrustedDynamicAnnouncement,
  observeTrustedKeyboard,
  resetTrustedKeyboardFocus,
  scanTrustedAxe,
  type TrustedPageProbeBinding,
} from './playwrightTrustedPageProbe';

type AxeSerializableResult = Readonly<{
  violations: readonly Readonly<{
    id: string;
    impact: string | null;
    nodeCount: number;
  }>[];
  incomplete: readonly Readonly<{
    id: string;
    impact: string | null;
    nodeCount: number;
  }>[];
}>;

export const scanPlaywrightAccessibility = async (
  input: Readonly<{
    page: Page;
    cell: VerificationPlanCell;
    scanTargetId: string;
    targetManifest: BehaviorScenarioProgram['targetManifest'];
    trustedPageProbe: TrustedPageProbeBinding;
  }>
): Promise<unknown> => {
  const { page, cell, scanTargetId, targetManifest, trustedPageProbe } = input;
  const target = await semanticLocator(
    page,
    scanTargetId,
    targetManifest,
    trustedPageProbe
  );
  const identity = semanticTargetIdentity(targetManifest, scanTargetId);
  const project = (
    entries: AxeSerializableResult['violations'],
    sourceTraceDigest: string
  ): readonly Record<string, unknown>[] =>
    entries.map((entry) => ({
      ruleId: entry.id,
      impact: ['minor', 'moderate', 'serious', 'critical'].includes(
        entry.impact ?? ''
      )
        ? entry.impact
        : 'moderate',
      messageKey: `verification.a11y.${entry.id}`,
      diagnosticCodes: ['VER-A11Y-AUTOMATED'],
      relatedNodeCount: Math.max(1, entry.nodeCount),
      nodes: [{ targetId: scanTargetId, sourceTraceDigest }],
    }));

  if (target === undefined || identity === undefined) {
    return {
      format: 'prodivix.axe-accessibility-report',
      version: 1,
      tool: {
        name: 'axe-core',
        version: AXE_VERSION,
        schemaDigest: AXE_SCHEMA_DIGEST,
      },
      scanId: `${cell.id}:axe`,
      targetId: scanTargetId,
      complete: true,
      violations: [],
      incomplete: [
        {
          ruleId: 'prodivix-scan-target-unresolved',
          impact: 'serious',
          messageKey: 'verification.a11y.scanTargetUnresolved',
          diagnosticCodes: ['VER-A11Y-SCAN-TARGET-UNRESOLVED'],
          relatedNodeCount: 1,
          nodes: [{ targetId: scanTargetId }],
        },
      ],
    };
  }
  const result = (await scanTrustedAxe(
    page,
    trustedPageProbe,
    identity.identity
  )) as AxeSerializableResult;
  return {
    format: 'prodivix.axe-accessibility-report',
    version: 1,
    tool: {
      name: 'axe-core',
      version: AXE_VERSION,
      schemaDigest: AXE_SCHEMA_DIGEST,
    },
    scanId: `${cell.id}:axe`,
    targetId: scanTargetId,
    complete: true,
    violations: project(result.violations, target.sourceTraceDigest),
    incomplete: project(result.incomplete, target.sourceTraceDigest),
  };
};

export const executePlaywrightKeyboardFocusJourney = async (
  page: Page,
  spec: KeyboardFocusJourneySpec,
  targetManifest: BehaviorScenarioProgram['targetManifest'],
  trustedPageProbe: TrustedPageProbeBinding,
  settleMs: number
): Promise<unknown> => {
  const observations: Array<Record<string, unknown>> = [];
  const report = (): unknown => ({
    format: 'prodivix.keyboard-focus-report',
    version: 1,
    tool: toolIdentity(KEYBOARD_SCHEMA_DIGEST),
    journeyId: spec.journeyId,
    complete: true,
    inputMethod: 'keyboard',
    observations,
  });
  try {
    await resetTrustedKeyboardFocus(page, trustedPageProbe);
  } catch {
    for (const step of spec.steps) {
      observations.push({
        state: 'blocked',
        stepId: step.stepId,
        key: step.key,
        reasonCode: 'VER-A11Y-KEYBOARD-RESET',
        diagnosticCodes: ['VER-A11Y-KEYBOARD-JOURNEY'],
      });
    }
    return report();
  }
  const probeTargets = targetManifest.flatMap(({ targetId }) => {
    const resolved = semanticTargetIdentity(targetManifest, targetId);
    return resolved === undefined ? [] : [resolved.identity];
  });
  for (const step of spec.steps) {
    if (!KEYBOARD_KEYS.includes(step.key)) {
      observations.push({
        state: 'blocked',
        stepId: step.stepId,
        key: step.key,
        reasonCode: 'VER-A11Y-KEY-UNSUPPORTED',
        diagnosticCodes: ['VER-A11Y-KEYBOARD-JOURNEY'],
      });
      continue;
    }
    if (step.assertionCode === 'dynamic-announcement') {
      const triggerIdentity = semanticTargetIdentity(
        targetManifest,
        step.triggerTargetId
      );
      const announcementIdentity = semanticTargetIdentity(
        targetManifest,
        step.announcementTargetId
      );
      const triggerTarget =
        triggerIdentity === undefined
          ? undefined
          : await semanticLocator(
              page,
              step.triggerTargetId,
              targetManifest,
              trustedPageProbe
            );
      const announcementTarget =
        announcementIdentity === undefined
          ? undefined
          : await semanticLocator(
              page,
              step.announcementTargetId,
              targetManifest,
              trustedPageProbe
            );
      if (
        triggerIdentity === undefined ||
        announcementIdentity === undefined ||
        triggerTarget === undefined ||
        announcementTarget === undefined
      ) {
        observations.push({
          state: 'blocked',
          stepId: step.stepId,
          key: step.key,
          reasonCode: 'VER-A11Y-DYNAMIC-ANNOUNCEMENT-TARGET-UNRESOLVED',
          diagnosticCodes: ['VER-A11Y-KEYBOARD-JOURNEY'],
        });
        continue;
      }
      try {
        await armTrustedDynamicAnnouncement(page, trustedPageProbe, {
          trigger: triggerIdentity.identity,
          announcement: announcementIdentity.identity,
          key: step.key,
          expectedTextDigest: step.expectedTextDigest,
          settleMs,
        });
        await page.keyboard.press(step.key);
        observations.push({
          state: 'announcement-observed',
          stepId: step.stepId,
          key: step.key,
          ...(await observeTrustedDynamicAnnouncement(page, trustedPageProbe)),
          diagnosticCodes: [],
        });
      } catch {
        await cleanupTrustedDynamicAnnouncement(page, trustedPageProbe).catch(
          () => undefined
        );
        observations.push({
          state: 'blocked',
          stepId: step.stepId,
          key: step.key,
          reasonCode: 'VER-A11Y-DYNAMIC-ANNOUNCEMENT-EXECUTION',
          diagnosticCodes: ['VER-A11Y-KEYBOARD-JOURNEY'],
        });
      }
      continue;
    }
    const expectedIdentity = semanticTargetIdentity(
      targetManifest,
      step.expectedTargetId
    );
    const expectedTarget =
      expectedIdentity === undefined
        ? undefined
        : await semanticLocator(
            page,
            step.expectedTargetId,
            targetManifest,
            trustedPageProbe
          );
    if (expectedTarget === undefined || expectedIdentity === undefined) {
      observations.push({
        state: 'blocked',
        stepId: step.stepId,
        key: step.key,
        reasonCode: 'VER-A11Y-FOCUS-TARGET-UNRESOLVED',
        diagnosticCodes: ['VER-A11Y-KEYBOARD-JOURNEY'],
      });
      continue;
    }
    try {
      if (step.assertionCode === 'keyboard-activation') {
        await armTrustedKeyboardActivation(
          page,
          trustedPageProbe,
          expectedIdentity.identity
        );
      }
      await page.keyboard.press(step.key);
      const result = await observeTrustedKeyboard(
        page,
        trustedPageProbe,
        expectedIdentity.identity,
        probeTargets
      );
      observations.push(
        result
          ? {
              state: 'observed',
              stepId: step.stepId,
              key: step.key,
              ...result,
              diagnosticCodes: [],
            }
          : {
              state: 'blocked',
              stepId: step.stepId,
              key: step.key,
              reasonCode: 'VER-A11Y-FOCUS-TARGET-UNRESOLVED',
              diagnosticCodes: ['VER-A11Y-KEYBOARD-JOURNEY'],
            }
      );
    } catch {
      await cleanupTrustedKeyboardActivation(page, trustedPageProbe).catch(
        () => undefined
      );
      observations.push({
        state: 'blocked',
        stepId: step.stepId,
        key: step.key,
        reasonCode: 'VER-A11Y-KEYBOARD-EXECUTION',
        diagnosticCodes: ['VER-A11Y-KEYBOARD-JOURNEY'],
      });
    }
  }
  return report();
};
