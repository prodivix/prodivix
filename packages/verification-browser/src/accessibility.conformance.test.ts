import { describe, expect, it } from 'vitest';
import {
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  BrowserPrivatePayloadError,
} from './privateBoundary';
import {
  decodeAxeAccessibilityPayload,
  decodeKeyboardFocusPayload,
  createAccessibilityAnnouncementTextDigest,
  evaluateAccessibility,
  evaluateKeyboardFocusJourney,
  normalizeAutomatedAccessibility,
  type KeyboardFocusJourneySpec,
} from './accessibility';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;

const axeReport = (overrides: Record<string, unknown> = {}) => ({
  format: 'prodivix.axe-accessibility-report',
  version: 1,
  tool: {
    name: 'axe-core',
    version: '4.12.1',
    schemaDigest: sha('a'),
  },
  scanId: 'scan.catalog',
  targetId: 'target.catalog',
  complete: true,
  violations: [],
  incomplete: [],
  ...overrides,
});

const rule = (overrides: Record<string, unknown> = {}) => ({
  ruleId: 'button-name',
  impact: 'critical',
  messageKey: 'verification.a11y.buttonName',
  diagnosticCodes: ['VER-A11Y-AUTOMATED'],
  relatedNodeCount: 2,
  nodes: [
    {
      targetId: 'target.save',
      sourceTraceDigest: sha('b'),
    },
  ],
  ...overrides,
});

const journeySpec = (): KeyboardFocusJourneySpec => ({
  journeyId: 'journey.catalog-keyboard',
  steps: [
    {
      stepId: 'step.tab-save',
      key: 'Tab',
      expectedTargetId: 'target.save',
      assertionCode: 'focus-visible',
      sourceTraceDigest: sha('c'),
    },
    {
      stepId: 'step.activate-save',
      key: 'Enter',
      expectedTargetId: 'target.save',
      assertionCode: 'keyboard-activation',
    },
  ],
});

const keyboardReport = (overrides: Record<string, unknown> = {}) => ({
  format: 'prodivix.keyboard-focus-report',
  version: 1,
  tool: {
    name: 'playwright',
    version: '1.61.1',
    schemaDigest: sha('d'),
  },
  journeyId: 'journey.catalog-keyboard',
  complete: true,
  inputMethod: 'keyboard',
  observations: [
    {
      state: 'observed',
      stepId: 'step.tab-save',
      key: 'Tab',
      observedTargetId: 'target.save',
      focusVisible: true,
      focusContained: true,
      activated: false,
      diagnosticCodes: [],
    },
    {
      state: 'observed',
      stepId: 'step.activate-save',
      key: 'Enter',
      observedTargetId: 'target.save',
      focusVisible: true,
      focusContained: true,
      activated: true,
      diagnosticCodes: [],
    },
  ],
  ...overrides,
});

describe('accessibility private payload and normalized findings', () => {
  it('normalizes axe findings without raw DOM or selector payloads', () => {
    const result = normalizeAutomatedAccessibility(
      decodeAxeAccessibilityPayload(
        axeReport({
          violations: [rule()],
        })
      )
    );

    expect(result).toMatchObject({
      status: 'failed',
      findings: [
        {
          ruleId: 'button-name',
          impact: 'critical',
          targetId: 'target.save',
          messageKey: 'verification.a11y.buttonName',
          relatedNodeCount: 2,
          disposition: 'violation',
          sourceTraceDigest: sha('b'),
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('<button');
    expect(JSON.stringify(result)).not.toContain('selector');
  });

  it('treats incomplete automated rules as blocked, never passed', () => {
    const result = normalizeAutomatedAccessibility(
      decodeAxeAccessibilityPayload(
        axeReport({
          incomplete: [rule({ ruleId: 'color-contrast' })],
        })
      )
    );
    expect(result.status).toBe('blocked');
    expect(result.findings[0]?.disposition).toBe('incomplete');
  });

  it('executes a typed keyboard journey result independently of axe', () => {
    const result = evaluateKeyboardFocusJourney(
      journeySpec(),
      decodeKeyboardFocusPayload(keyboardReport())
    );
    expect(result.status).toBe('passed');
    expect(result.steps.map(({ status }) => status)).toEqual([
      'passed',
      'passed',
    ]);

    const combined = evaluateAccessibility(
      normalizeAutomatedAccessibility(
        decodeAxeAccessibilityPayload(axeReport())
      ),
      result
    );
    expect(combined.verdict).toBe('passed');
  });

  it('requires a trusted dynamic live-region mutation with exact semantic targets and digests', () => {
    const expectedTextDigest =
      createAccessibilityAnnouncementTextDigest('Product created');
    const spec = {
      journeyId: 'journey.catalog-announcement',
      steps: [
        {
          stepId: 'step.announce-create',
          key: 'Enter',
          assertionCode: 'dynamic-announcement',
          triggerTargetId: 'target.create-product',
          announcementTargetId: 'target.catalog-status',
          expectedRole: 'status',
          expectedLive: 'polite',
          expectedTextDigest,
          sourceTraceDigest: sha('e'),
        },
      ],
    } satisfies KeyboardFocusJourneySpec;
    const report = decodeKeyboardFocusPayload({
      ...keyboardReport(),
      journeyId: spec.journeyId,
      observations: [
        {
          state: 'announcement-observed',
          stepId: 'step.announce-create',
          key: 'Enter',
          triggerTargetId: 'target.create-product',
          announcementTargetId: 'target.catalog-status',
          role: 'status',
          live: 'polite',
          beforeTextDigest: createAccessibilityAnnouncementTextDigest(''),
          afterTextDigest: expectedTextDigest,
          outcome: 'matched',
          diagnosticCodes: [],
        },
      ],
    });

    expect(evaluateKeyboardFocusJourney(spec, report)).toMatchObject({
      status: 'passed',
      steps: [
        {
          targetId: 'target.catalog-status',
          assertionCode: 'dynamic-announcement',
          status: 'passed',
          sourceTraceDigest: sha('e'),
          announcement: {
            triggerTargetId: 'target.create-product',
            role: 'status',
            live: 'polite',
            beforeTextDigest: createAccessibilityAnnouncementTextDigest(''),
            afterTextDigest: expectedTextDigest,
          },
        },
      ],
    });
    expect(JSON.stringify(report)).not.toContain('Product created');
  });

  it('fails a dynamic announcement that never settles instead of accepting static ARIA', () => {
    const unchanged = createAccessibilityAnnouncementTextDigest('');
    const spec = {
      journeyId: 'journey.catalog-announcement',
      steps: [
        {
          stepId: 'step.announce-create',
          key: 'Enter',
          assertionCode: 'dynamic-announcement',
          triggerTargetId: 'target.create-product',
          announcementTargetId: 'target.catalog-status',
          expectedRole: 'status',
          expectedLive: 'polite',
          expectedTextDigest:
            createAccessibilityAnnouncementTextDigest('Product created'),
        },
      ],
    } satisfies KeyboardFocusJourneySpec;
    const result = evaluateKeyboardFocusJourney(
      spec,
      decodeKeyboardFocusPayload({
        ...keyboardReport(),
        journeyId: spec.journeyId,
        observations: [
          {
            state: 'announcement-observed',
            stepId: 'step.announce-create',
            key: 'Enter',
            triggerTargetId: 'target.create-product',
            announcementTargetId: 'target.catalog-status',
            role: 'status',
            live: 'polite',
            beforeTextDigest: unchanged,
            afterTextDigest: unchanged,
            outcome: 'timed-out',
            diagnosticCodes: [],
          },
        ],
      })
    );

    expect(result).toMatchObject({
      status: 'failed',
      steps: [
        {
          status: 'failed',
          diagnosticCodes: ['VER-A11Y-DYNAMIC-ANNOUNCEMENT-TIMEOUT'],
        },
      ],
    });
  });

  it.each([
    ['role', { role: 'alert' }],
    ['live mode', { live: 'assertive' }],
    [
      'text digest',
      {
        afterTextDigest:
          createAccessibilityAnnouncementTextDigest('Wrong announcement'),
      },
    ],
  ])('fails dynamic announcement %s drift', (_label, observationOverride) => {
    const expectedTextDigest =
      createAccessibilityAnnouncementTextDigest('Product created');
    const spec = {
      journeyId: 'journey.catalog-announcement',
      steps: [
        {
          stepId: 'step.announce-create',
          key: 'Enter',
          assertionCode: 'dynamic-announcement',
          triggerTargetId: 'target.create-product',
          announcementTargetId: 'target.catalog-status',
          expectedRole: 'status',
          expectedLive: 'polite',
          expectedTextDigest,
        },
      ],
    } satisfies KeyboardFocusJourneySpec;
    const result = evaluateKeyboardFocusJourney(
      spec,
      decodeKeyboardFocusPayload({
        ...keyboardReport(),
        journeyId: spec.journeyId,
        observations: [
          {
            state: 'announcement-observed',
            stepId: 'step.announce-create',
            key: 'Enter',
            triggerTargetId: 'target.create-product',
            announcementTargetId: 'target.catalog-status',
            role: 'status',
            live: 'polite',
            beforeTextDigest: createAccessibilityAnnouncementTextDigest(''),
            afterTextDigest: expectedTextDigest,
            outcome: 'matched',
            diagnosticCodes: [],
            ...observationOverride,
          },
        ],
      })
    );
    expect(result.steps[0]).toMatchObject({
      status: 'failed',
      diagnosticCodes: ['VER-A11Y-DYNAMIC-ANNOUNCEMENT'],
    });
  });

  it('rejects raw announcement text from the private reporter boundary', () => {
    const observation = {
      state: 'announcement-observed',
      stepId: 'step.announce-create',
      key: 'Enter',
      triggerTargetId: 'target.create-product',
      announcementTargetId: 'target.catalog-status',
      role: 'status',
      live: 'polite',
      beforeTextDigest: createAccessibilityAnnouncementTextDigest(''),
      afterTextDigest:
        createAccessibilityAnnouncementTextDigest('Product created'),
      outcome: 'matched',
      diagnosticCodes: [],
      rawText: 'Product created',
    };
    expect(() =>
      decodeKeyboardFocusPayload({
        ...keyboardReport(),
        journeyId: 'journey.catalog-announcement',
        observations: [observation],
      })
    ).toThrowError(expect.objectContaining({ code: 'unknown-field' }));
  });

  it('fails a real keyboard-focus mismatch and preserves stable diagnostics', () => {
    const payload = keyboardReport();
    const observations = payload.observations.map((observation, index) =>
      index === 0
        ? { ...observation, observedTargetId: 'target.cancel' }
        : observation
    );
    const result = evaluateKeyboardFocusJourney(
      journeySpec(),
      decodeKeyboardFocusPayload(keyboardReport({ observations }))
    );
    expect(result).toMatchObject({
      status: 'failed',
      steps: [
        {
          status: 'failed',
          diagnosticCodes: ['VER-A11Y-FOCUS-VISIBLE'],
        },
        { status: 'passed' },
      ],
    });
  });

  it('keeps blocked keyboard observations blocked', () => {
    const observations = [
      {
        state: 'blocked',
        stepId: 'step.tab-save',
        key: 'Tab',
        reasonCode: 'VER-A11Y-TARGET-UNRESOLVED',
        diagnosticCodes: [],
      },
      keyboardReport().observations[1],
    ];
    const result = evaluateKeyboardFocusJourney(
      journeySpec(),
      decodeKeyboardFocusPayload(keyboardReport({ observations }))
    );
    expect(result.status).toBe('blocked');
    expect(result.steps[0]).toMatchObject({
      status: 'blocked',
      diagnosticCodes: ['VER-A11Y-TARGET-UNRESOLVED'],
    });
  });

  it.each([
    [
      'raw axe HTML',
      axeReport({
        violations: [rule({ html: '<button>Save</button>' })],
      }),
      'unknown-field',
    ],
    ['partial axe result', axeReport({ complete: false }), 'partial-result'],
    [
      'programmatic focus result',
      keyboardReport({ inputMethod: 'programmatic' }),
      'invalid-field',
    ],
  ])('rejects %s', (_label, value, code) => {
    const decode = String(_label).includes('focus')
      ? decodeKeyboardFocusPayload
      : decodeAxeAccessibilityPayload;
    expect(() => decode(value)).toThrowError(expect.objectContaining({ code }));
  });

  it('rejects duplicate rule, semantic-node, and journey-step identities', () => {
    expect(() =>
      decodeAxeAccessibilityPayload(axeReport({ violations: [rule(), rule()] }))
    ).toThrowError(expect.objectContaining({ code: 'duplicate-identity' }));
    expect(() =>
      decodeAxeAccessibilityPayload(
        axeReport({
          violations: [
            rule({
              nodes: [rule().nodes[0], rule().nodes[0]],
            }),
          ],
        })
      )
    ).toThrowError(expect.objectContaining({ code: 'duplicate-identity' }));
    expect(() =>
      decodeKeyboardFocusPayload(
        keyboardReport({
          observations: [
            keyboardReport().observations[0],
            keyboardReport().observations[0],
          ],
        })
      )
    ).toThrowError(expect.objectContaining({ code: 'duplicate-identity' }));
  });

  it('rejects result drift and partial keyboard journeys', () => {
    expect(() =>
      evaluateKeyboardFocusJourney(
        journeySpec(),
        decodeKeyboardFocusPayload(
          keyboardReport({
            observations: [keyboardReport().observations[0]],
          })
        )
      )
    ).toThrowError(expect.objectContaining({ code: 'partial-result' }));

    expect(() =>
      evaluateKeyboardFocusJourney(
        journeySpec(),
        decodeKeyboardFocusPayload(
          keyboardReport({
            observations: [
              {
                ...keyboardReport().observations[0],
                key: 'Enter',
              },
              keyboardReport().observations[1],
            ],
          })
        )
      )
    ).toThrowError(expect.objectContaining({ code: 'result-drift' }));
  });

  it('enforces accessibility finding budgets', () => {
    const violations = Array.from(
      {
        length: BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumAccessibilityRules + 1,
      },
      (_, index) => rule({ ruleId: `rule-${index}` })
    );
    expect(() =>
      decodeAxeAccessibilityPayload(axeReport({ violations }))
    ).toThrowError(expect.objectContaining({ code: 'budget-exceeded' }));
  });

  it('rejects unsafe and non-finite direct payload data', () => {
    expect(() =>
      decodeAxeAccessibilityPayload(
        JSON.parse(
          JSON.stringify(axeReport()).replace(
            /}$/,
            ',"__proto__":{"polluted":true}}'
          )
        )
      )
    ).toThrow(BrowserPrivatePayloadError);
    expect(() =>
      decodeAxeAccessibilityPayload(
        axeReport({
          violations: [rule({ relatedNodeCount: Number.NaN })],
        })
      )
    ).toThrow(BrowserPrivatePayloadError);
  });
});
