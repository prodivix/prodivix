import { describe, expect, it } from 'vitest';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '../index';

const sorted = (values: readonly string[]) =>
  [...values].sort(compareUnicodeCodePoints);

describe('compareUnicodeCodePoints', () => {
  it('orders by code point, which is where locale collation diverges', () => {
    // The reason this comparator exists: every one of these pairs orders the
    // other way — or equal — under a locale collator, so a digest computed with
    // localeCompare depends on the host ICU data.
    expect(sorted(['a', 'B'])).toEqual(['B', 'a']);
    expect(sorted(['_x', 'ax'])).toEqual(['_x', 'ax']);
    expect(sorted(['é', 'z'])).toEqual(['z', 'é']);
    expect(sorted(['10', '9'])).toEqual(['10', '9']);
  });

  it('compares astral characters by code point rather than surrogate half', () => {
    // '\u{1D400}' is a surrogate pair whose lead unit (0xD835) sorts below
    // '�' by UTF-16 unit but above it by code point.
    expect(compareUnicodeCodePoints('\u{1D400}', '�')).toBeGreaterThan(0);
  });

  it('orders a prefix before the string that extends it', () => {
    expect(sorted(['abc', 'ab', 'abcd'])).toEqual(['ab', 'abc', 'abcd']);
  });

  it('is a total order: antisymmetric and transitive over a sample', () => {
    // Written out rather than using Math.sign so that the equal case compares
    // 0 with 0 instead of 0 with -0, which toBe distinguishes.
    const sign = (value: number) => (value > 0 ? 1 : value < 0 ? -1 : 0);
    const values = ['', 'a', 'A', '_', 'z', 'é', '\u{1D400}', 'ab', 'aB'];
    values.forEach((left) =>
      values.forEach((right) => {
        expect(
          sign(compareUnicodeCodePoints(left, right)),
          `${left} vs ${right}`
        ).toBe(sign(-compareUnicodeCodePoints(right, left)));
      })
    );
    const order = sorted(values);
    order.forEach((value, index) => {
      if (index === 0) return;
      expect(
        compareUnicodeCodePoints(order[index - 1]!, value)
      ).toBeLessThanOrEqual(0);
    });
  });
});

describe('canonicalJsonText', () => {
  it('is insensitive to property insertion order at every depth', () => {
    const left = { b: 1, a: { d: 2, c: [{ f: 3, e: 4 }] } };
    const right = { a: { c: [{ e: 4, f: 3 }], d: 2 }, b: 1 };
    expect(canonicalJsonText(left)).toBe(canonicalJsonText(right));
  });

  it('preserves array order, which is data rather than layout', () => {
    expect(canonicalJsonText([3, 1, 2])).toBe('[3,1,2]');
    expect(sameCanonicalJson([1, 2], [2, 1])).toBe(false);
  });

  it('treats an explicit undefined the same as an absent key', () => {
    expect(sameCanonicalJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
  });

  it('sorts keys by code point rather than by locale', () => {
    expect(canonicalJsonText({ a: 1, B: 2 })).toBe('{"B":2,"a":1}');
  });

  it('distinguishes values that differ, not merely their spelling', () => {
    expect(sameCanonicalJson({ a: 1 }, { a: '1' })).toBe(false);
    expect(sameCanonicalJson(null, undefined)).toBe(false);
    expect(sameCanonicalJson({ a: null }, {})).toBe(false);
  });

  it('honours the space argument for human-readable output', () => {
    expect(canonicalJsonText({ b: 1, a: 2 }, 2)).toBe(
      '{\n  "a": 2,\n  "b": 1\n}'
    );
  });
});
