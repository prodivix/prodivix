import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  assertUniqueIdentities,
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  BrowserPrivatePayloadError,
  decodePrivateJson,
  strictArray,
  strictBoolean,
  strictDiagnosticCodes,
  strictEnum,
  strictIdentifier,
  strictObject,
  strictSha256Digest,
  strictString,
  throwDrift,
  throwPartial,
  uniqueSorted,
} from './privateBoundary';

export const KEYBOARD_KEYS = Object.freeze([
  'Tab',
  'Shift+Tab',
  'Enter',
  'Space',
  'Escape',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
] as const);

export type KeyboardKey = (typeof KEYBOARD_KEYS)[number];
export type KeyboardFocusAssertion =
  'focus-target' | 'focus-visible' | 'focus-contained' | 'keyboard-activation';

export type AccessibilityAnnouncementRole = 'status' | 'alert' | 'log';
export type AccessibilityAnnouncementLive = 'polite' | 'assertive';

export const createAccessibilityAnnouncementTextDigest = (
  value: string
): string => {
  if (
    typeof value !== 'string' ||
    value.length > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumStringCharacters
  ) {
    throw new BrowserPrivatePayloadError(
      'invalid-field',
      '$.announcementText',
      `Announcement text must be at most ${BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumStringCharacters} characters.`
    );
  }
  const normalized = value.normalize('NFC').trim();
  return `sha256-${bytesToHex(sha256(new TextEncoder().encode(normalized)))}`;
};

export type KeyboardFocusJourneyStepSpec =
  | Readonly<{
      stepId: string;
      key: KeyboardKey;
      expectedTargetId: string;
      assertionCode: KeyboardFocusAssertion;
      sourceTraceDigest?: string;
    }>
  | Readonly<{
      stepId: string;
      key: 'Enter' | 'Space';
      assertionCode: 'dynamic-announcement';
      triggerTargetId: string;
      announcementTargetId: string;
      expectedRole: AccessibilityAnnouncementRole;
      expectedLive: AccessibilityAnnouncementLive;
      expectedTextDigest: string;
      sourceTraceDigest?: string;
    }>;

type KeyboardDynamicAnnouncementStepSpec = Extract<
  KeyboardFocusJourneyStepSpec,
  Readonly<{ assertionCode: 'dynamic-announcement' }>
>;
type KeyboardStaticFocusStepSpec = Exclude<
  KeyboardFocusJourneyStepSpec,
  KeyboardDynamicAnnouncementStepSpec
>;

const isDynamicAnnouncementStep = (
  step: KeyboardFocusJourneyStepSpec
): step is KeyboardDynamicAnnouncementStepSpec =>
  step.assertionCode === 'dynamic-announcement';

export type KeyboardFocusJourneySpec = Readonly<{
  journeyId: string;
  steps: readonly KeyboardFocusJourneyStepSpec[];
}>;

export type KeyboardFocusObservation =
  | Readonly<{
      state: 'observed';
      stepId: string;
      key: KeyboardKey;
      observedTargetId: string;
      focusVisible: boolean;
      focusContained: boolean;
      activated: boolean;
      diagnosticCodes: readonly string[];
    }>
  | Readonly<{
      state: 'announcement-observed';
      stepId: string;
      key: KeyboardKey;
      triggerTargetId: string;
      announcementTargetId: string;
      role: AccessibilityAnnouncementRole;
      live: AccessibilityAnnouncementLive;
      beforeTextDigest: string;
      afterTextDigest: string;
      outcome: 'matched' | 'timed-out' | 'untrusted-key';
      diagnosticCodes: readonly string[];
    }>
  | Readonly<{
      state: 'blocked';
      stepId: string;
      key: KeyboardKey;
      reasonCode: string;
      diagnosticCodes: readonly string[];
    }>;

export type DecodedKeyboardFocusPayload = Readonly<{
  format: 'prodivix.keyboard-focus-report';
  version: 1;
  tool: Readonly<{
    name: 'playwright';
    version: string;
    schemaDigest: string;
  }>;
  journeyId: string;
  observations: readonly KeyboardFocusObservation[];
}>;

export type KeyboardFocusStepResult = Readonly<{
  journeyId: string;
  stepId: string;
  targetId: string;
  assertionCode: KeyboardFocusAssertion | 'dynamic-announcement';
  status: 'passed' | 'failed' | 'blocked';
  diagnosticCodes: readonly string[];
  sourceTraceDigest?: string;
  announcement?: Readonly<{
    triggerTargetId: string;
    role: AccessibilityAnnouncementRole;
    live: AccessibilityAnnouncementLive;
    beforeTextDigest: string;
    afterTextDigest: string;
  }>;
}>;

export type KeyboardFocusJourneyResult = Readonly<{
  journeyId: string;
  status: 'passed' | 'failed' | 'blocked';
  steps: readonly KeyboardFocusStepResult[];
  tool: DecodedKeyboardFocusPayload['tool'];
}>;

const decodeKeyboardObservation = (
  value: unknown,
  index: number
): KeyboardFocusObservation => {
  const path = `$.observations[${index}]`;
  const discriminant = strictObject(
    value,
    path,
    ['state'],
    [
      'stepId',
      'key',
      'observedTargetId',
      'focusVisible',
      'focusContained',
      'activated',
      'triggerTargetId',
      'announcementTargetId',
      'role',
      'live',
      'beforeTextDigest',
      'afterTextDigest',
      'outcome',
      'reasonCode',
      'diagnosticCodes',
    ]
  );
  const state = strictEnum(discriminant.state, `${path}.state`, [
    'observed',
    'announcement-observed',
    'blocked',
  ] as const);
  if (state === 'observed') {
    const observation = strictObject(value, path, [
      'state',
      'stepId',
      'key',
      'observedTargetId',
      'focusVisible',
      'focusContained',
      'activated',
      'diagnosticCodes',
    ]);
    return Object.freeze({
      state,
      stepId: strictIdentifier(observation.stepId, `${path}.stepId`),
      key: strictEnum(observation.key, `${path}.key`, KEYBOARD_KEYS),
      observedTargetId: strictIdentifier(
        observation.observedTargetId,
        `${path}.observedTargetId`
      ),
      focusVisible: strictBoolean(
        observation.focusVisible,
        `${path}.focusVisible`
      ),
      focusContained: strictBoolean(
        observation.focusContained,
        `${path}.focusContained`
      ),
      activated: strictBoolean(observation.activated, `${path}.activated`),
      diagnosticCodes: strictDiagnosticCodes(
        observation.diagnosticCodes,
        `${path}.diagnosticCodes`
      ),
    });
  }
  if (state === 'announcement-observed') {
    const observation = strictObject(value, path, [
      'state',
      'stepId',
      'key',
      'triggerTargetId',
      'announcementTargetId',
      'role',
      'live',
      'beforeTextDigest',
      'afterTextDigest',
      'outcome',
      'diagnosticCodes',
    ]);
    return Object.freeze({
      state,
      stepId: strictIdentifier(observation.stepId, `${path}.stepId`),
      key: strictEnum(observation.key, `${path}.key`, KEYBOARD_KEYS),
      triggerTargetId: strictIdentifier(
        observation.triggerTargetId,
        `${path}.triggerTargetId`
      ),
      announcementTargetId: strictIdentifier(
        observation.announcementTargetId,
        `${path}.announcementTargetId`
      ),
      role: strictEnum(observation.role, `${path}.role`, [
        'status',
        'alert',
        'log',
      ] as const),
      live: strictEnum(observation.live, `${path}.live`, [
        'polite',
        'assertive',
      ] as const),
      beforeTextDigest: strictSha256Digest(
        observation.beforeTextDigest,
        `${path}.beforeTextDigest`
      ),
      afterTextDigest: strictSha256Digest(
        observation.afterTextDigest,
        `${path}.afterTextDigest`
      ),
      outcome: strictEnum(observation.outcome, `${path}.outcome`, [
        'matched',
        'timed-out',
        'untrusted-key',
      ] as const),
      diagnosticCodes: strictDiagnosticCodes(
        observation.diagnosticCodes,
        `${path}.diagnosticCodes`
      ),
    });
  }
  const observation = strictObject(value, path, [
    'state',
    'stepId',
    'key',
    'reasonCode',
    'diagnosticCodes',
  ]);
  return Object.freeze({
    state,
    stepId: strictIdentifier(observation.stepId, `${path}.stepId`),
    key: strictEnum(observation.key, `${path}.key`, KEYBOARD_KEYS),
    reasonCode: strictIdentifier(observation.reasonCode, `${path}.reasonCode`),
    diagnosticCodes: strictDiagnosticCodes(
      observation.diagnosticCodes,
      `${path}.diagnosticCodes`
    ),
  });
};

export const decodeKeyboardFocusPayload = (
  source: string | Uint8Array | unknown
): DecodedKeyboardFocusPayload => {
  const decoded = decodePrivateJson(source, 'keyboard focus report');
  const root = strictObject(decoded, '$', [
    'format',
    'version',
    'tool',
    'journeyId',
    'complete',
    'inputMethod',
    'observations',
  ]);
  strictEnum(root.format, '$.format', [
    'prodivix.keyboard-focus-report',
  ] as const);
  if (root.version !== 1) {
    throwPartial(
      '$.version',
      'Keyboard focus report uses an unsupported schema version.'
    );
  }
  if (!strictBoolean(root.complete, '$.complete')) {
    throwPartial(
      '$.complete',
      'Keyboard focus report is partial and cannot be normalized.'
    );
  }
  strictEnum(root.inputMethod, '$.inputMethod', ['keyboard'] as const);
  const tool = strictObject(root.tool, '$.tool', [
    'name',
    'version',
    'schemaDigest',
  ]);
  const observations = strictArray(
    root.observations,
    '$.observations',
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumJourneySteps
  ).map(decodeKeyboardObservation);
  if (observations.length === 0) {
    throwPartial(
      '$.observations',
      'Keyboard focus report did not contain any observations.'
    );
  }
  assertUniqueIdentities(
    observations,
    ({ stepId }) => stepId,
    '$.observations'
  );
  return Object.freeze({
    format: 'prodivix.keyboard-focus-report',
    version: 1,
    tool: Object.freeze({
      name: strictEnum(tool.name, '$.tool.name', ['playwright'] as const),
      version: strictString(tool.version, '$.tool.version', 64),
      schemaDigest: strictSha256Digest(
        tool.schemaDigest,
        '$.tool.schemaDigest'
      ),
    }),
    journeyId: strictIdentifier(root.journeyId, '$.journeyId'),
    observations: Object.freeze(observations),
  });
};

export const decodeKeyboardFocusJourneySpec = (
  input: unknown,
  path = '$.spec'
): KeyboardFocusJourneySpec => {
  const spec = strictObject(input, path, ['journeyId', 'steps']);
  const stepsPath = `${path}.steps`;
  const steps = strictArray(
    spec.steps,
    stepsPath,
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumJourneySteps
  ).map((value, index) => {
    const stepPath = `${stepsPath}[${index}]`;
    const discriminant = strictObject(
      value,
      stepPath,
      ['assertionCode'],
      [
        'stepId',
        'key',
        'expectedTargetId',
        'triggerTargetId',
        'announcementTargetId',
        'expectedRole',
        'expectedLive',
        'expectedTextDigest',
        'sourceTraceDigest',
      ]
    );
    const assertionCode = strictEnum(
      discriminant.assertionCode,
      `${stepPath}.assertionCode`,
      [
        'focus-target',
        'focus-visible',
        'focus-contained',
        'keyboard-activation',
        'dynamic-announcement',
      ] as const
    );
    const step =
      assertionCode === 'dynamic-announcement'
        ? strictObject(
            value,
            stepPath,
            [
              'stepId',
              'key',
              'assertionCode',
              'triggerTargetId',
              'announcementTargetId',
              'expectedRole',
              'expectedLive',
              'expectedTextDigest',
            ],
            ['sourceTraceDigest']
          )
        : strictObject(
            value,
            stepPath,
            ['stepId', 'key', 'expectedTargetId', 'assertionCode'],
            ['sourceTraceDigest']
          );
    const sourceTraceDigest =
      step.sourceTraceDigest === undefined
        ? undefined
        : strictSha256Digest(
            step.sourceTraceDigest,
            `${stepPath}.sourceTraceDigest`
          );
    if (assertionCode === 'dynamic-announcement') {
      return Object.freeze({
        stepId: strictIdentifier(step.stepId, `${stepPath}.stepId`),
        key: strictEnum(step.key, `${stepPath}.key`, [
          'Enter',
          'Space',
        ] as const),
        assertionCode,
        triggerTargetId: strictIdentifier(
          step.triggerTargetId,
          `${stepPath}.triggerTargetId`
        ),
        announcementTargetId: strictIdentifier(
          step.announcementTargetId,
          `${stepPath}.announcementTargetId`
        ),
        expectedRole: strictEnum(
          step.expectedRole,
          `${stepPath}.expectedRole`,
          ['status', 'alert', 'log'] as const
        ),
        expectedLive: strictEnum(
          step.expectedLive,
          `${stepPath}.expectedLive`,
          ['polite', 'assertive'] as const
        ),
        expectedTextDigest: strictSha256Digest(
          step.expectedTextDigest,
          `${stepPath}.expectedTextDigest`
        ),
        ...(sourceTraceDigest === undefined ? {} : { sourceTraceDigest }),
      });
    }
    return Object.freeze({
      stepId: strictIdentifier(step.stepId, `${stepPath}.stepId`),
      key: strictEnum(step.key, `${stepPath}.key`, KEYBOARD_KEYS),
      expectedTargetId: strictIdentifier(
        step.expectedTargetId,
        `${stepPath}.expectedTargetId`
      ),
      assertionCode,
      ...(sourceTraceDigest === undefined ? {} : { sourceTraceDigest }),
    });
  });
  if (steps.length === 0) {
    throwPartial(
      stepsPath,
      'Keyboard focus journey must contain at least one authored step.'
    );
  }
  assertUniqueIdentities(steps, ({ stepId }) => stepId, stepsPath);
  return Object.freeze({
    journeyId: strictIdentifier(spec.journeyId, `${path}.journeyId`),
    steps: Object.freeze(steps),
  });
};

const failureCode = (assertionCode: KeyboardFocusAssertion): string =>
  ({
    'focus-target': 'VER-A11Y-FOCUS-TARGET',
    'focus-visible': 'VER-A11Y-FOCUS-VISIBLE',
    'focus-contained': 'VER-A11Y-FOCUS-CONTAINED',
    'keyboard-activation': 'VER-A11Y-KEYBOARD-ACTIVATION',
  })[assertionCode];

export const evaluateKeyboardFocusJourney = (
  specInput: KeyboardFocusJourneySpec,
  report: DecodedKeyboardFocusPayload
): KeyboardFocusJourneyResult => {
  const spec = decodeKeyboardFocusJourneySpec(specInput);
  if (spec.journeyId !== report.journeyId) {
    throwDrift(
      '$.journeyId',
      'Keyboard focus report does not match the authored journey identity.'
    );
  }
  if (spec.steps.length !== report.observations.length) {
    throwPartial(
      '$.observations',
      'Keyboard focus report does not contain every authored journey step.'
    );
  }
  const steps = spec.steps.map((expected, index) => {
    const observation = report.observations[index]!;
    if (
      observation.stepId !== expected.stepId ||
      observation.key !== expected.key
    ) {
      throwDrift(
        `$.observations[${index}]`,
        'Keyboard focus observation order or key differs from the authored journey.'
      );
    }
    if (observation.state === 'blocked') {
      const targetId = isDynamicAnnouncementStep(expected)
        ? expected.announcementTargetId
        : expected.expectedTargetId;
      return Object.freeze({
        journeyId: spec.journeyId,
        stepId: expected.stepId,
        targetId,
        assertionCode: expected.assertionCode,
        status: 'blocked' as const,
        diagnosticCodes: uniqueSorted(
          [...observation.diagnosticCodes, observation.reasonCode],
          `$.observations[${index}].diagnosticCodes`
        ),
        ...(expected.sourceTraceDigest === undefined
          ? {}
          : { sourceTraceDigest: expected.sourceTraceDigest }),
      });
    }
    if (observation.state === 'announcement-observed') {
      const announcementStep: KeyboardDynamicAnnouncementStepSpec =
        isDynamicAnnouncementStep(expected)
          ? expected
          : throwDrift(
              `$.observations[${index}]`,
              'Focus step received a dynamic announcement observation.'
            );
      const passed =
        observation.triggerTargetId === announcementStep.triggerTargetId &&
        observation.announcementTargetId ===
          announcementStep.announcementTargetId &&
        observation.role === announcementStep.expectedRole &&
        observation.live === announcementStep.expectedLive &&
        observation.beforeTextDigest !== observation.afterTextDigest &&
        observation.afterTextDigest === announcementStep.expectedTextDigest &&
        observation.outcome === 'matched';
      return Object.freeze({
        journeyId: spec.journeyId,
        stepId: announcementStep.stepId,
        targetId: announcementStep.announcementTargetId,
        assertionCode: announcementStep.assertionCode,
        status: passed ? ('passed' as const) : ('failed' as const),
        diagnosticCodes: passed
          ? observation.diagnosticCodes
          : uniqueSorted(
              [
                ...observation.diagnosticCodes,
                observation.outcome === 'timed-out'
                  ? 'VER-A11Y-DYNAMIC-ANNOUNCEMENT-TIMEOUT'
                  : observation.outcome === 'untrusted-key'
                    ? 'VER-A11Y-DYNAMIC-ANNOUNCEMENT-UNTRUSTED-KEY'
                    : 'VER-A11Y-DYNAMIC-ANNOUNCEMENT',
              ],
              `$.observations[${index}].diagnosticCodes`
            ),
        ...(announcementStep.sourceTraceDigest === undefined
          ? {}
          : { sourceTraceDigest: announcementStep.sourceTraceDigest }),
        announcement: Object.freeze({
          triggerTargetId: announcementStep.triggerTargetId,
          role: observation.role,
          live: observation.live,
          beforeTextDigest: observation.beforeTextDigest,
          afterTextDigest: observation.afterTextDigest,
        }),
      });
    }
    const focusStep: KeyboardStaticFocusStepSpec = isDynamicAnnouncementStep(
      expected
    )
      ? throwDrift(
          `$.observations[${index}]`,
          'Dynamic announcement step received a focus observation.'
        )
      : expected;
    const targetMatched =
      observation.observedTargetId === focusStep.expectedTargetId;
    const passed =
      targetMatched &&
      (focusStep.assertionCode === 'focus-target' ||
        (focusStep.assertionCode === 'focus-visible' &&
          observation.focusVisible) ||
        (focusStep.assertionCode === 'focus-contained' &&
          observation.focusContained) ||
        (focusStep.assertionCode === 'keyboard-activation' &&
          observation.activated));
    return Object.freeze({
      journeyId: spec.journeyId,
      stepId: focusStep.stepId,
      targetId: focusStep.expectedTargetId,
      assertionCode: focusStep.assertionCode,
      status: passed ? ('passed' as const) : ('failed' as const),
      diagnosticCodes: passed
        ? observation.diagnosticCodes
        : uniqueSorted(
            [
              ...observation.diagnosticCodes,
              failureCode(focusStep.assertionCode),
            ],
            `$.observations[${index}].diagnosticCodes`
          ),
      ...(focusStep.sourceTraceDigest === undefined
        ? {}
        : { sourceTraceDigest: focusStep.sourceTraceDigest }),
    });
  });
  return Object.freeze({
    journeyId: spec.journeyId,
    status: steps.some(({ status }) => status === 'failed')
      ? 'failed'
      : steps.some(({ status }) => status === 'blocked')
        ? 'blocked'
        : 'passed',
    steps: Object.freeze(steps),
    tool: report.tool,
  });
};
