import { describe, expect, it } from 'vitest';
import {
  decodeCanonicalBase64,
  isCanonicalBase64Text,
} from '../canonicalBase64';

describe('canonical base64', () => {
  it('round-trips canonical padding across complete and partial quanta', () => {
    for (let length = 0; length <= 257; length += 1) {
      const bytes = Uint8Array.from(
        { length },
        (_, index) => (index * 37 + length) & 0xff
      );
      const source = Buffer.from(bytes).toString('base64');

      expect(
        decodeCanonicalBase64(source, {
          label: `Payload ${length}`,
          maximumBytes: length,
        })
      ).toEqual(bytes);
    }
  });

  it('decodes payloads above the V8 quantified-regexp stack threshold', () => {
    const source = 'A'.repeat(8 * 1024 * 1024);
    const decoded = decodeCanonicalBase64(source, {
      label: 'Large payload',
      maximumBytes: 8 * 1024 * 1024,
    });

    expect(decoded.byteLength).toBe(6 * 1024 * 1024);
    expect(decoded[0]).toBe(0);
    expect(decoded.at(-1)).toBe(0);
  });

  it('rejects over-budget, malformed, and non-canonical padding', () => {
    expect(isCanonicalBase64Text('YWJj', 3)).toBe(true);
    expect(isCanonicalBase64Text('YWJj', 2)).toBe(false);
    expect(isCanonicalBase64Text('YW=J', 3)).toBe(false);
    expect(isCanonicalBase64Text('AB==', 1)).toBe(false);
    expect(isCanonicalBase64Text('AAB=', 2)).toBe(false);
    expect(() =>
      decodeCanonicalBase64('YWJj', {
        label: 'Fixture',
        maximumBytes: 2,
      })
    ).toThrow('Fixture must be bounded canonical base64.');
  });
});
