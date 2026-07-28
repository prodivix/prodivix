import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

export const readExactVerificationArtifactDataValues = (
  value: unknown,
  expectedKeys: ReadonlySet<string>
): Readonly<Record<string, unknown>> | undefined => {
  try {
    if (!isPlainObject(value)) return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== expectedKeys.size) return undefined;
    const data = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (
        typeof key !== 'string' ||
        isUnsafeObjectKey(key) ||
        !expectedKeys.has(key)
      ) {
        return undefined;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return undefined;
      }
      data[key] = descriptor.value;
    }
    return data;
  } catch {
    return undefined;
  }
};
