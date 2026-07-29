import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  BrowserPrivatePayloadError,
} from './privateBoundary';

const fail = (path: string, message: string): never => {
  throw new BrowserPrivatePayloadError('invalid-field', path, message);
};

/**
 * Rejects accessors, symbols, exotic prototypes, non-enumerable data, cycles,
 * and unsafe names before canonical serialization can invoke user code.
 */
export const assertBrowserVerificationPlainData = (
  value: unknown,
  path: string,
  depth = 0,
  seen = new Set<object>(),
  budget = { nodes: 0 }
): void => {
  budget.nodes += 1;
  if (
    budget.nodes > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumNodes ||
    depth > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumDepth
  ) {
    fail(path, 'Browser verification profile exceeds its structural budget.');
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail(path, 'Browser verification profile contains an unsafe number.');
    }
    return;
  }
  if (value === null || typeof value !== 'object') {
    return fail(
      path,
      'Browser verification profile must contain JSON data only.'
    );
  }
  if (seen.has(value)) {
    fail(path, 'Browser verification profile cannot contain cycles.');
  }
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.length > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumArrayEntries) {
      fail(path, 'Browser verification profile array is not canonical.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(value)) {
      const stringKey =
        typeof key === 'string'
          ? key
          : fail(
              path,
              'Browser verification profile array cannot have symbols.'
            );
      if (stringKey === 'length') continue;
      if (
        !/^(?:0|[1-9][0-9]*)$/u.test(stringKey) ||
        Number(stringKey) >= value.length
      ) {
        fail(path, 'Browser verification profile array is not canonical.');
      }
      const descriptor = descriptors[stringKey];
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        fail(
          `${path}[${stringKey}]`,
          'Browser verification profile arrays require data properties.'
        );
      }
      assertBrowserVerificationPlainData(
        descriptor.value,
        `${path}[${stringKey}]`,
        depth + 1,
        seen,
        budget
      );
    }
    seen.delete(value);
    return;
  }
  if (!isPlainObject(value)) {
    fail(path, 'Browser verification profile objects must be plain.');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(value)) {
    const stringKey =
      typeof key === 'string'
        ? key
        : fail(path, 'Browser verification profile cannot have symbols.');
    if (isUnsafeObjectKey(stringKey)) {
      fail(path, 'Browser verification profile contains an unsafe key.');
    }
    const descriptor = descriptors[stringKey];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !('value' in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      fail(
        `${path}.${stringKey}`,
        'Browser verification profile requires data properties.'
      );
    }
    assertBrowserVerificationPlainData(
      descriptor.value,
      `${path}.${stringKey}`,
      depth + 1,
      seen,
      budget
    );
  }
  seen.delete(value);
};
