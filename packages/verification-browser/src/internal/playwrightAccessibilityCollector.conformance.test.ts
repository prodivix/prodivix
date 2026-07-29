import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import {
  createAccessibilityAnnouncementTextDigest,
  decodeKeyboardFocusPayload,
  evaluateKeyboardFocusJourney,
  type KeyboardFocusJourneySpec,
} from '../accessibility';
import { executePlaywrightKeyboardFocusJourney } from './playwrightAccessibilityCollector';

class TargetResolutionPage {
  readonly status: 'single' | 'multiple';

  constructor(status: 'single' | 'multiple') {
    this.status = status;
  }

  async evaluate(
    _operation: unknown,
    input: Readonly<{ value?: Readonly<{ action?: string }> }>
  ): Promise<unknown> {
    if (input.value?.action === 'reset-keyboard-focus') {
      return { status: 'clean' };
    }
    return {
      status: this.status,
      index: this.status === 'single' ? 0 : -1,
    };
  }

  locator() {
    return {
      nth: () => ({}),
    };
  }
}

const manifest = Object.freeze([
  Object.freeze({
    targetId: 'target.trigger',
    semanticSymbolId: 'symbol.trigger',
    capability: 'interaction',
    source: Object.freeze({
      workspaceDocumentId: 'page-catalog',
      path: '/nodesById/trigger',
    }),
  }),
  Object.freeze({
    targetId: 'target.status',
    semanticSymbolId: 'symbol.status',
    capability: 'announcement',
    source: Object.freeze({
      workspaceDocumentId: 'page-catalog',
      path: '/nodesById/status',
    }),
  }),
]) satisfies BehaviorScenarioProgram['targetManifest'];

const spec = Object.freeze({
  journeyId: 'journey.announcement-targets',
  steps: Object.freeze([
    Object.freeze({
      stepId: 'step.announce',
      key: 'Enter',
      assertionCode: 'dynamic-announcement',
      triggerTargetId: 'target.trigger',
      announcementTargetId: 'target.status',
      expectedRole: 'status',
      expectedLive: 'polite',
      expectedTextDigest:
        createAccessibilityAnnouncementTextDigest('Product created'),
    }),
  ]),
}) satisfies KeyboardFocusJourneySpec;

const execute = async (
  page: TargetResolutionPage,
  targetManifest: BehaviorScenarioProgram['targetManifest']
) =>
  evaluateKeyboardFocusJourney(
    spec,
    decodeKeyboardFocusPayload(
      await executePlaywrightKeyboardFocusJourney(
        page as unknown as Page,
        spec,
        targetManifest,
        {
          propertyKey: 'trusted',
          capability: 'opaque',
        },
        100
      )
    )
  );

describe('Playwright accessibility semantic target closure', () => {
  it('blocks a missing authored announcement target', async () => {
    const result = await execute(
      new TargetResolutionPage('single'),
      manifest.slice(0, 1)
    );
    expect(result).toMatchObject({
      status: 'blocked',
      steps: [
        {
          status: 'blocked',
          diagnosticCodes: [
            'VER-A11Y-DYNAMIC-ANNOUNCEMENT-TARGET-UNRESOLVED',
            'VER-A11Y-KEYBOARD-JOURNEY',
          ],
        },
      ],
    });
  });

  it('blocks an ambiguous runtime semantic target', async () => {
    const result = await execute(
      new TargetResolutionPage('multiple'),
      manifest
    );
    expect(result.steps[0]).toMatchObject({
      status: 'blocked',
      diagnosticCodes: [
        'VER-A11Y-DYNAMIC-ANNOUNCEMENT-TARGET-UNRESOLVED',
        'VER-A11Y-KEYBOARD-JOURNEY',
      ],
    });
  });
});
