import { normalizeAnimationDefinition } from './animationCodec';
import type { AnimationDefinition } from './animation.types';

export const ANIMATION_VALIDATION_CODES = Object.freeze({
  documentInvalid: 'ANI_DOCUMENT_INVALID',
  targetInvalid: 'ANI_TARGET_INVALID',
} as const);

export type AnimationValidationCode =
  (typeof ANIMATION_VALIDATION_CODES)[keyof typeof ANIMATION_VALIDATION_CODES];

export type AnimationValidationIssue = Readonly<{
  code: AnimationValidationCode;
  path: string;
  message: string;
}>;

export type AnimationValidationResult =
  | Readonly<{ valid: true; definition: AnimationDefinition; issues: [] }>
  | Readonly<{
      valid: false;
      issues: readonly AnimationValidationIssue[];
    }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const canonicalValuesEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => canonicalValuesEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && canonicalValuesEqual(left[key], right[key])
    )
  );
};

/** Validates and decodes the canonical standalone Animation document. */
export const validateAnimationDefinition = (
  source: unknown
): AnimationValidationResult => {
  if (!isRecord(source)) {
    return {
      valid: false,
      issues: [
        {
          code: ANIMATION_VALIDATION_CODES.documentInvalid,
          path: '/',
          message: 'Animation document content must be an object.',
        },
      ],
    };
  }
  const target = source.target;
  if (
    !isRecord(target) ||
    target.kind !== 'pir-document' ||
    typeof target.documentId !== 'string' ||
    !target.documentId.trim()
  ) {
    return {
      valid: false,
      issues: [
        {
          code: ANIMATION_VALIDATION_CODES.targetInvalid,
          path: '/target',
          message:
            'Animation documents require one explicit PIR document target.',
        },
      ],
    };
  }
  const definition = normalizeAnimationDefinition(source);
  if (!definition) {
    return {
      valid: false,
      issues: [
        {
          code: ANIMATION_VALIDATION_CODES.documentInvalid,
          path: '/',
          message: 'Animation document content could not be decoded.',
        },
      ],
    };
  }
  if (!canonicalValuesEqual(source, definition)) {
    return {
      valid: false,
      issues: [
        {
          code: ANIMATION_VALIDATION_CODES.documentInvalid,
          path: '/',
          message: 'Animation document content must already be canonical.',
        },
      ],
    };
  }
  return { valid: true, definition, issues: [] };
};
