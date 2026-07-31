import type { AiDraftDiagnostic, AiDraftPlan } from './draft.types';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  isPlainObject(value) && !Object.keys(value).some(isUnsafeObjectKey);

const MAXIMUM_DRAFT_BYTES = 262_144;
const MAXIMUM_ASSUMPTIONS = 64;
const MAXIMUM_MILESTONES = 64;
const MAXIMUM_DRAFT_DEPTH = 8;
const MAXIMUM_DRAFT_NODES = 512;
const isBoundedText = (value: unknown, maximum = 16_384): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= maximum &&
  value.trim() === value;

const invalid = (message: string, path?: string) => ({
  diagnostics: [
    {
      code: 'AI-4002',
      message,
      severity: 'error',
      ...(path ? { path } : {}),
    } satisfies AiDraftDiagnostic,
  ],
});

const isStringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const cloneDraftJsonData = (output: unknown): unknown => {
  let nodes = 0;
  const clone = (value: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > MAXIMUM_DRAFT_NODES || depth > MAXIMUM_DRAFT_DEPTH) {
      throw new TypeError('AI draft output exceeds its structural budget.');
    }
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new TypeError('AI draft output contains a non-JSON number.');
      }
      return value;
    }
    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Object.getOwnPropertyNames(value).filter(
        (key) => key !== 'length'
      );
      if (
        Object.getOwnPropertySymbols(value).length !== 0 ||
        keys.length !== value.length ||
        keys.some((key, index) => key !== String(index))
      ) {
        throw new TypeError(
          'AI draft arrays must contain indexed values only.'
        );
      }
      return keys.map((key) => {
        const descriptor = descriptors[key];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          throw new TypeError(
            'AI draft output accessors and hidden properties are forbidden.'
          );
        }
        return clone(descriptor.value, depth + 1);
      });
    }
    if (!isPlainObject(value)) {
      throw new TypeError('AI draft output must contain plain JSON values.');
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      throw new TypeError('AI draft objects must contain string keys only.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(value)) {
      if (isUnsafeObjectKey(key)) {
        throw new TypeError('AI draft output contains an unsafe object key.');
      }
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError(
          'AI draft output accessors and hidden properties are forbidden.'
        );
      }
      result[key] = clone(descriptor.value, depth + 1);
    }
    return result;
  };
  return clone(output, 0);
};

export const validateAiDraftPlan = (
  output: unknown
): { output?: AiDraftPlan; diagnostics: readonly AiDraftDiagnostic[] } => {
  let inspected: unknown;
  try {
    inspected = cloneDraftJsonData(output);
    if (
      new TextEncoder().encode(JSON.stringify(inspected)).byteLength >
      MAXIMUM_DRAFT_BYTES
    ) {
      return invalid('AI draft output exceeds its byte budget.');
    }
  } catch {
    return invalid('AI draft output cannot be safely inspected.');
  }
  if (!isRecord(inspected)) {
    return invalid('AI draft output must be an object.');
  }
  const safeOutput = inspected;
  const allowedKeys = new Set(['goal', 'assumptions', 'milestones']);
  const unknownKey = Object.keys(safeOutput).find(
    (key) => !allowedKeys.has(key)
  );
  if (unknownKey) {
    return invalid(
      'AI draft output cannot contain action or mutation fields.',
      unknownKey
    );
  }
  if (!isBoundedText(safeOutput.goal)) {
    return invalid('AI draft goal is required.', 'goal');
  }
  if (
    !isStringArray(safeOutput.assumptions) ||
    safeOutput.assumptions.length > MAXIMUM_ASSUMPTIONS ||
    !safeOutput.assumptions.every((value) => isBoundedText(value, 4_096))
  ) {
    return invalid('AI draft assumptions must be strings.', 'assumptions');
  }
  if (
    !Array.isArray(safeOutput.milestones) ||
    safeOutput.milestones.length > MAXIMUM_MILESTONES
  ) {
    return invalid('AI draft milestones must be an array.', 'milestones');
  }
  const milestoneIds = new Set<string>();
  for (let index = 0; index < safeOutput.milestones.length; index += 1) {
    const milestone = safeOutput.milestones[index];
    if (!isRecord(milestone)) {
      return invalid(
        'AI draft milestone must be an object.',
        `milestones.${index}`
      );
    }
    const milestoneKeys = new Set(['id', 'title', 'description']);
    const unknownMilestoneKey = Object.keys(milestone).find(
      (key) => !milestoneKeys.has(key)
    );
    if (unknownMilestoneKey) {
      return invalid(
        'AI draft milestone contains an unsupported field.',
        `milestones.${index}.${unknownMilestoneKey}`
      );
    }
    if (!isBoundedText(milestone.id, 256)) {
      return invalid(
        'AI draft milestone id is required.',
        `milestones.${index}.id`
      );
    }
    if (milestoneIds.has(milestone.id)) {
      return invalid(
        'AI draft milestone ids must be unique.',
        `milestones.${index}.id`
      );
    }
    milestoneIds.add(milestone.id);
    if (!isBoundedText(milestone.title, 4_096)) {
      return invalid(
        'AI draft milestone title is required.',
        `milestones.${index}.title`
      );
    }
    if (
      milestone.description !== undefined &&
      !isBoundedText(milestone.description, 16_384)
    ) {
      return invalid(
        'AI draft milestone description must be a string.',
        `milestones.${index}.description`
      );
    }
  }
  return { output: safeOutput as unknown as AiDraftPlan, diagnostics: [] };
};
