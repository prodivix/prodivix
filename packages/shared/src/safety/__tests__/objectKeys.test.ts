import { describe, expect, it } from 'vitest';
import { isPlainObject, isUnsafeObjectKey, unsafeObjectKeys } from '../index';

describe('isUnsafeObjectKey', () => {
  it('rejects every name that resolves through the prototype chain', () => {
    expect(unsafeObjectKeys().every(isUnsafeObjectKey)).toBe(true);
    expect(isUnsafeObjectKey('__proto__')).toBe(true);
  });

  it('accepts ordinary property names', () => {
    ['title', 'proto', '_proto_', '__proto', 'constructorName'].forEach((name) =>
      expect(isUnsafeObjectKey(name)).toBe(false)
    );
  });

  it('names the key that assignment would route to the prototype', () => {
    // The reason the predicate exists: this assignment creates no own property.
    const target: Record<string, unknown> = {};
    const hostile = JSON.parse('{"__proto__":{"polluted":true}}') as Record<
      string,
      unknown
    >;
    Object.keys(hostile)
      .filter((key) => !isUnsafeObjectKey(key))
      .forEach((key) => {
        target[key] = hostile[key];
      });

    expect(Object.keys(target)).toEqual([]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('isPlainObject', () => {
  it('accepts own-property bags a JSON decoder produces', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(Object.create(null) as object)).toBe(true);
    expect(isPlainObject(JSON.parse('{"a":1}'))).toBe(true);
  });

  it('rejects values a JSON decoder never produces', () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject('text')).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(Object.create({ inherited: true }) as object)).toBe(
      false
    );
  });
});
