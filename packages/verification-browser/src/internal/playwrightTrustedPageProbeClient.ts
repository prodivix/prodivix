import type { Page } from 'playwright-core';
import {
  strictArray,
  strictBoolean,
  strictEnum,
  strictIdentifier,
  strictObject,
  strictSafeInteger,
  strictSha256Digest,
  strictString,
} from '../privateBoundary';
import type {
  TrustedAxeResult,
  TrustedDynamicAnnouncementObservation,
  TrustedKeyboardObservation,
  TrustedPageProbeBinding,
  TrustedSemanticTargetIdentity,
} from './playwrightTrustedPageProbeRuntime';

const invoke = (
  page: Page,
  binding: TrustedPageProbeBinding,
  request: Readonly<Record<string, unknown>>
): Promise<unknown> =>
  page.evaluate(
    ({ capability, propertyKey, value }) => {
      const probe = (globalThis as unknown as Record<string, unknown>)[
        propertyKey
      ];
      return typeof probe === 'function' ? probe(capability, value) : undefined;
    },
    {
      capability: binding.capability,
      propertyKey: binding.propertyKey,
      value: request,
    }
  );

const decodeTarget = (
  target: TrustedSemanticTargetIdentity
): TrustedSemanticTargetIdentity => {
  const record = strictObject(
    target,
    '$.target',
    ['targetId', 'documentId', 'nodeId'],
    ['instancePathSuffix']
  );
  return Object.freeze({
    targetId: strictIdentifier(record.targetId, '$.target.targetId'),
    documentId: strictIdentifier(record.documentId, '$.target.documentId'),
    nodeId: strictIdentifier(record.nodeId, '$.target.nodeId'),
    ...(record.instancePathSuffix === undefined
      ? {}
      : {
          instancePathSuffix: strictString(
            record.instancePathSuffix,
            '$.target.instancePathSuffix',
            1_024
          ),
        }),
  });
};

export const resolveTrustedSemanticTargetIndex = async (
  page: Page,
  binding: TrustedPageProbeBinding,
  target: TrustedSemanticTargetIdentity
): Promise<number | undefined> => {
  const result = strictObject(
    await invoke(page, binding, {
      action: 'resolve-target',
      target: decodeTarget(target),
    }),
    '$',
    ['status', 'index']
  );
  const status = strictEnum(result.status, '$.status', [
    'none',
    'single',
    'multiple',
  ] as const);
  const index = strictSafeInteger(result.index, '$.index', {
    minimum: -1,
    maximum: 1_000_000,
  });
  return status === 'single' && index >= 0 ? index : undefined;
};

const decodeAxeEntries = (
  value: unknown,
  path: string
): TrustedAxeResult['violations'] =>
  Object.freeze(
    strictArray(value, path, 512).map((entry, index) => {
      const item = strictObject(entry, `${path}[${index}]`, [
        'id',
        'impact',
        'nodeCount',
      ]);
      return Object.freeze({
        id: strictIdentifier(item.id, `${path}[${index}].id`),
        impact:
          item.impact === null
            ? null
            : strictString(item.impact, `${path}[${index}].impact`, 64),
        nodeCount: strictSafeInteger(
          item.nodeCount,
          `${path}[${index}].nodeCount`,
          { minimum: 0, maximum: 10_000 }
        ),
      });
    })
  );

export const scanTrustedAxe = async (
  page: Page,
  binding: TrustedPageProbeBinding,
  target: TrustedSemanticTargetIdentity
): Promise<TrustedAxeResult> => {
  const result = strictObject(
    await invoke(page, binding, {
      action: 'axe-scan',
      target: decodeTarget(target),
    }),
    '$',
    ['status', 'violations', 'incomplete']
  );
  strictEnum(result.status, '$.status', ['complete'] as const);
  return Object.freeze({
    violations: decodeAxeEntries(result.violations, '$.violations'),
    incomplete: decodeAxeEntries(result.incomplete, '$.incomplete'),
  });
};

export const resetTrustedKeyboardFocus = async (
  page: Page,
  binding: TrustedPageProbeBinding
): Promise<void> => {
  const result = strictObject(
    await invoke(page, binding, {
      action: 'reset-keyboard-focus',
    }),
    '$',
    ['status']
  );
  strictEnum(result.status, '$.status', ['clean'] as const);
};

export const armTrustedKeyboardActivation = async (
  page: Page,
  binding: TrustedPageProbeBinding,
  target: TrustedSemanticTargetIdentity
): Promise<void> => {
  const result = strictObject(
    await invoke(page, binding, {
      action: 'arm-activation',
      target: decodeTarget(target),
    }),
    '$',
    ['status']
  );
  strictEnum(result.status, '$.status', ['armed'] as const);
};

export const observeTrustedKeyboard = async (
  page: Page,
  binding: TrustedPageProbeBinding,
  target: TrustedSemanticTargetIdentity,
  targets: readonly TrustedSemanticTargetIdentity[]
): Promise<TrustedKeyboardObservation> => {
  const result = strictObject(
    await invoke(page, binding, {
      action: 'observe-keyboard',
      target: decodeTarget(target),
      targets: targets.map(decodeTarget),
    }),
    '$',
    [
      'status',
      'observedTargetId',
      'focusVisible',
      'focusContained',
      'activated',
    ]
  );
  strictEnum(result.status, '$.status', ['complete'] as const);
  return Object.freeze({
    observedTargetId: strictIdentifier(
      result.observedTargetId,
      '$.observedTargetId'
    ),
    focusVisible: strictBoolean(result.focusVisible, '$.focusVisible'),
    focusContained: strictBoolean(result.focusContained, '$.focusContained'),
    activated: strictBoolean(result.activated, '$.activated'),
  });
};

export const armTrustedDynamicAnnouncement = async (
  page: Page,
  binding: TrustedPageProbeBinding,
  input: Readonly<{
    trigger: TrustedSemanticTargetIdentity;
    announcement: TrustedSemanticTargetIdentity;
    key: 'Enter' | 'Space';
    expectedTextDigest: string;
    settleMs: number;
  }>
): Promise<void> => {
  const result = strictObject(
    await invoke(page, binding, {
      action: 'arm-announcement',
      trigger: decodeTarget(input.trigger),
      announcement: decodeTarget(input.announcement),
      expectedKey: strictEnum(input.key, '$.key', ['Enter', 'Space'] as const),
      expectedTextDigest: strictSha256Digest(
        input.expectedTextDigest,
        '$.expectedTextDigest'
      ),
      settleMs: strictSafeInteger(input.settleMs, '$.settleMs', {
        minimum: 1,
        maximum: 60_000,
      }),
    }),
    '$',
    ['status']
  );
  strictEnum(result.status, '$.status', ['armed'] as const);
};

export const observeTrustedDynamicAnnouncement = async (
  page: Page,
  binding: TrustedPageProbeBinding
): Promise<TrustedDynamicAnnouncementObservation> => {
  const result = strictObject(
    await invoke(page, binding, { action: 'observe-announcement' }),
    '$',
    [
      'status',
      'triggerTargetId',
      'announcementTargetId',
      'role',
      'live',
      'beforeTextDigest',
      'afterTextDigest',
      'outcome',
    ]
  );
  strictEnum(result.status, '$.status', ['complete'] as const);
  return Object.freeze({
    triggerTargetId: strictIdentifier(
      result.triggerTargetId,
      '$.triggerTargetId'
    ),
    announcementTargetId: strictIdentifier(
      result.announcementTargetId,
      '$.announcementTargetId'
    ),
    role: strictEnum(result.role, '$.role', [
      'status',
      'alert',
      'log',
    ] as const),
    live: strictEnum(result.live, '$.live', ['polite', 'assertive'] as const),
    beforeTextDigest: strictSha256Digest(
      result.beforeTextDigest,
      '$.beforeTextDigest'
    ),
    afterTextDigest: strictSha256Digest(
      result.afterTextDigest,
      '$.afterTextDigest'
    ),
    outcome: strictEnum(result.outcome, '$.outcome', [
      'matched',
      'timed-out',
      'untrusted-key',
    ] as const),
  });
};

const cleanup = async (
  page: Page,
  binding: TrustedPageProbeBinding,
  action: 'cleanup-activation' | 'cleanup-announcement'
): Promise<void> => {
  const result = strictObject(await invoke(page, binding, { action }), '$', [
    'status',
  ]);
  strictEnum(result.status, '$.status', ['clean'] as const);
};

export const cleanupTrustedKeyboardActivation = (
  page: Page,
  binding: TrustedPageProbeBinding
): Promise<void> => cleanup(page, binding, 'cleanup-activation');

export const cleanupTrustedDynamicAnnouncement = (
  page: Page,
  binding: TrustedPageProbeBinding
): Promise<void> => cleanup(page, binding, 'cleanup-announcement');
