import type { AutomatedAccessibilityResult } from './accessibilityAutomated';
import type { KeyboardFocusJourneyResult } from './accessibilityKeyboard';

export * from './accessibilityAutomated';
export * from './accessibilityKeyboard';

export type AccessibilityEvaluation = Readonly<{
  verdict: 'passed' | 'failed' | 'blocked';
  automated: AutomatedAccessibilityResult;
  keyboardFocus: KeyboardFocusJourneyResult;
}>;

export const evaluateAccessibility = (
  automated: AutomatedAccessibilityResult,
  keyboardFocus: KeyboardFocusJourneyResult
): AccessibilityEvaluation => {
  const statuses = [automated.status, keyboardFocus.status] as const;
  return Object.freeze({
    verdict: statuses.includes('failed')
      ? 'failed'
      : statuses.includes('blocked')
        ? 'blocked'
        : 'passed',
    automated,
    keyboardFocus,
  });
};
