import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type { BehaviorJsonValue } from './behavior.types';

/** Returns the cross-runtime digest of a canonical JSON value. */
export const digestBehaviorValue = (value: unknown): string =>
  `sha256-${bytesToHex(sha256(utf8ToBytes(canonicalJsonText(value))))}`;

const INVALID_BEHAVIOR_JSON = Symbol('invalid-behavior-json');

type BehaviorJsonClone = BehaviorJsonValue | typeof INVALID_BEHAVIOR_JSON;

/**
 * Clones an untrusted runtime value into the bounded, prototype-safe JSON
 * shape accepted by Behavior ports. Invalid or oversized values fail closed.
 */
export const readBehaviorJsonValue = (
  value: unknown,
  options: Readonly<{
    maximumDepth?: number;
    maximumNodes?: number;
    maximumStringLength?: number;
    maximumUtf8Bytes?: number;
  }> = {}
): BehaviorJsonValue | undefined => {
  const maximumDepth = Math.max(1, Math.trunc(options.maximumDepth ?? 24));
  const maximumNodes = Math.max(1, Math.trunc(options.maximumNodes ?? 10_000));
  const maximumStringLength = Math.max(
    1,
    Math.trunc(options.maximumStringLength ?? 1_000_000)
  );
  const maximumUtf8Bytes = Math.max(
    1,
    Math.trunc(options.maximumUtf8Bytes ?? 1_048_576)
  );
  let nodes = 0;
  let utf8Bytes = 0;
  const ancestors = new Set<object>();

  const consumeText = (text: string): boolean => {
    utf8Bytes += utf8ToBytes(text).byteLength;
    return utf8Bytes <= maximumUtf8Bytes;
  };

  const clone = (candidate: unknown, depth: number): BehaviorJsonClone => {
    nodes += 1;
    if (nodes > maximumNodes || depth > maximumDepth) {
      return INVALID_BEHAVIOR_JSON;
    }
    if (candidate === null) {
      return consumeText('null') ? candidate : INVALID_BEHAVIOR_JSON;
    }
    if (typeof candidate === 'boolean') {
      return consumeText(String(candidate)) ? candidate : INVALID_BEHAVIOR_JSON;
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return consumeText(JSON.stringify(candidate))
        ? candidate
        : INVALID_BEHAVIOR_JSON;
    }
    if (typeof candidate === 'string') {
      return candidate.length <= maximumStringLength &&
        consumeText(JSON.stringify(candidate))
        ? candidate
        : INVALID_BEHAVIOR_JSON;
    }
    if (candidate === null || typeof candidate !== 'object') {
      return INVALID_BEHAVIOR_JSON;
    }
    if (ancestors.has(candidate)) return INVALID_BEHAVIOR_JSON;
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        if (candidate.length > maximumNodes - nodes || !consumeText('[')) {
          return INVALID_BEHAVIOR_JSON;
        }
        const descriptors = Object.getOwnPropertyDescriptors(candidate);
        const enumerableKeys = Object.keys(candidate);
        if (
          enumerableKeys.length !== candidate.length ||
          enumerableKeys.some((key, index) => key !== String(index))
        ) {
          return INVALID_BEHAVIOR_JSON;
        }
        const values: BehaviorJsonValue[] = [];
        for (let index = 0; index < candidate.length; index += 1) {
          if (index > 0 && !consumeText(',')) return INVALID_BEHAVIOR_JSON;
          const descriptor = descriptors[String(index)];
          if (!descriptor || !('value' in descriptor)) {
            return INVALID_BEHAVIOR_JSON;
          }
          const cloned = clone(descriptor.value, depth + 1);
          if (cloned === INVALID_BEHAVIOR_JSON) return INVALID_BEHAVIOR_JSON;
          values.push(cloned);
        }
        return consumeText(']') ? Object.freeze(values) : INVALID_BEHAVIOR_JSON;
      }
      if (!isPlainObject(candidate) || !consumeText('{')) {
        return INVALID_BEHAVIOR_JSON;
      }

      const output: Record<string, BehaviorJsonValue> = Object.create(null);
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      const keys = Object.keys(candidate).sort(compareUnicodeCodePoints);
      for (const [index, key] of keys.entries()) {
        if (
          isUnsafeObjectKey(key) ||
          key.length > maximumStringLength ||
          (index > 0 && !consumeText(',')) ||
          !consumeText(JSON.stringify(key)) ||
          !consumeText(':')
        ) {
          return INVALID_BEHAVIOR_JSON;
        }
        const descriptor = descriptors[key];
        if (!descriptor || !('value' in descriptor)) {
          return INVALID_BEHAVIOR_JSON;
        }
        const cloned = clone(descriptor.value, depth + 1);
        if (cloned === INVALID_BEHAVIOR_JSON) return INVALID_BEHAVIOR_JSON;
        output[key] = cloned;
      }
      return consumeText('}') ? Object.freeze(output) : INVALID_BEHAVIOR_JSON;
    } finally {
      ancestors.delete(candidate);
    }
  };

  let cloned: BehaviorJsonClone;
  try {
    cloned = clone(value, 0);
  } catch {
    return undefined;
  }
  return cloned === INVALID_BEHAVIOR_JSON ? undefined : cloned;
};
