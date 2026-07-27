import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type { AnimationDecodeIssue } from './animation.types';
import { ANIMATION_CURRENT_WIRE_VERSION } from './wire';

type WireRecord = Record<string, unknown>;

export type AnimationWireUpgradeResult =
  | Readonly<{
      ok: true;
      value: unknown;
      sourceWireVersion: number;
      appliedMigrations: readonly Readonly<{
        fromVersion: number;
        toVersion: number;
      }>[];
    }>
  | Readonly<{ ok: false; issues: readonly AnimationDecodeIssue[] }>;

const V1_DOCUMENT_FIELDS = new Set([
  'version',
  'target',
  'timelines',
  'svgFilters',
  'x-animationEditor',
]);

const V1_TIMELINE_FIELDS = new Set([
  'id',
  'name',
  'durationMs',
  'delayMs',
  'iterations',
  'direction',
  'fillMode',
  'easing',
  'codeSlots',
  'bindings',
]);

const readOwn = (
  value: WireRecord,
  key: string,
  path: string,
  issues: AnimationDecodeIssue[]
): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) {
    issues.push({
      path: `${path}/${key}`,
      message: 'Accessor-backed Animation wire fields are not supported.',
    });
    return undefined;
  }
  return descriptor.value;
};

const rejectUnknownFields = (
  value: WireRecord,
  allowed: ReadonlySet<string>,
  path: string,
  issues: AnimationDecodeIssue[]
): void => {
  for (const key of Object.keys(value)) {
    if (isUnsafeObjectKey(key) || !allowed.has(key)) {
      issues.push({
        path: `${path}/${key}`,
        message: `Unknown persisted Animation v1 field "${key}".`,
      });
    }
  }
};

const migrateAnimationWireV1ToV2 = (
  source: WireRecord
): AnimationWireUpgradeResult => {
  const issues: AnimationDecodeIssue[] = [];
  rejectUnknownFields(source, V1_DOCUMENT_FIELDS, '', issues);
  const timelines = readOwn(source, 'timelines', '', issues);
  if (!Array.isArray(timelines)) {
    issues.push({
      path: '/timelines',
      message: 'Animation v1 timelines must be an array.',
    });
  }
  const migratedTimelines = Array.isArray(timelines)
    ? timelines.map((candidate, index) => {
        const path = `/timelines/${index}`;
        if (!isPlainObject(candidate)) {
          issues.push({
            path,
            message: 'Animation v1 timeline must be an object.',
          });
          return candidate;
        }
        rejectUnknownFields(candidate, V1_TIMELINE_FIELDS, path, issues);
        return {
          ...candidate,
          motionIntent: 'decorative',
          reducedMotion: { kind: 'final-state' },
          markers: [],
        };
      })
    : [];
  if (issues.length) return { ok: false, issues };

  const migrated: WireRecord = {
    version: ANIMATION_CURRENT_WIRE_VERSION,
    target: readOwn(source, 'target', '', issues),
    timelines: migratedTimelines,
    compositions: [],
  };
  const svgFilters = readOwn(source, 'svgFilters', '', issues);
  const editor = readOwn(source, 'x-animationEditor', '', issues);
  if (svgFilters !== undefined) migrated.svgFilters = svgFilters;
  if (editor !== undefined) migrated['x-animationEditor'] = editor;
  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: migrated,
    sourceWireVersion: 1,
    appliedMigrations: Object.freeze([
      Object.freeze({ fromVersion: 1, toVersion: 2 }),
    ]),
  };
};

/** Upgrades a persisted Animation wire document to the activated snapshot. */
export const upgradeAnimationWireDocument = (
  value: unknown
): AnimationWireUpgradeResult => {
  try {
    if (!isPlainObject(value)) {
      return {
        ok: false,
        issues: [{ path: '/', message: 'Expected an Animation wire object.' }],
      };
    }
    const issues: AnimationDecodeIssue[] = [];
    const version = readOwn(value, 'version', '', issues);
    if (issues.length) return { ok: false, issues };
    if (version === ANIMATION_CURRENT_WIRE_VERSION) {
      return {
        ok: true,
        value,
        sourceWireVersion: ANIMATION_CURRENT_WIRE_VERSION,
        appliedMigrations: Object.freeze([]),
      };
    }
    if (version === 1) return migrateAnimationWireV1ToV2(value);
    return {
      ok: false,
      issues: [
        {
          path: '/version',
          message: `Unsupported Animation wire version: ${String(version)}.`,
        },
      ],
    };
  } catch {
    return {
      ok: false,
      issues: [
        {
          path: '/',
          message: 'Animation wire migration rejected an unsafe value.',
        },
      ],
    };
  }
};

export const animationWireMigrationIsDeterministic = (
  value: unknown
): boolean => {
  const first = upgradeAnimationWireDocument(value);
  const second = upgradeAnimationWireDocument(value);
  return first.ok && second.ok && sameCanonicalJson(first, second);
};
