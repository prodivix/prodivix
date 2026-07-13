import type { JsonValue } from '@prodivix/plugin-contracts';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  decodeProtocolJsonText,
  encodeProtocolJsonText,
} from '#protocol/index';

const propertyParameters = Object.freeze({
  numRuns: 1_000,
  seed: 0x4_09_2026,
});

const jsonValue = fc.jsonValue({
  maxDepth: 6,
  stringUnit: 'grapheme',
});

describe('strict protocol JSON property and fuzz hardening', () => {
  it('round-trips arbitrary JSON values through the bounded codec', () => {
    fc.assert(
      fc.property(jsonValue, (value) => {
        const encoded = encodeProtocolJsonText(value as JsonValue);
        expect(encoded.ok).toBe(true);
        if (!encoded.ok) return;

        const decoded = decodeProtocolJsonText(encoded.value);
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) return;

        expect(decoded.value).toEqual(JSON.parse(encoded.value));
        expect(encodeProtocolJsonText(decoded.value)).toEqual(encoded);
      }),
      propertyParameters
    );
  });

  it('rejects arbitrary duplicate object keys at every generated value shape', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 64, unit: 'grapheme' }),
        jsonValue,
        jsonValue,
        (key, first, second) => {
          const propertyName = JSON.stringify(key);
          const source = `{${propertyName}:${JSON.stringify(first)},${propertyName}:${JSON.stringify(second)}}`;
          const decoded = decodeProtocolJsonText(source);

          expect(decoded.ok).toBe(false);
          expect(decoded.diagnostics).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ code: 'PLG-4020' }),
            ])
          );
        }
      ),
      propertyParameters
    );
  });

  it('never throws for arbitrary UTF-16 transport text', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2_048, unit: 'binary' }), (source) => {
        const decoded = decodeProtocolJsonText(source, {
          maxBytes: 4_096,
          maxDepth: 16,
          maxNodes: 1_024,
        });

        if (!decoded.ok) {
          expect(decoded.diagnostics.length).toBeGreaterThan(0);
          return;
        }

        const canonical = JSON.stringify(decoded.value);
        expect(decodeProtocolJsonText(canonical).ok).toBe(true);
      }),
      propertyParameters
    );
  });

  it('fails closed for arbitrary non-text transport values', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.uint8Array({ maxLength: 2_048 }),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.dictionary(fc.string({ maxLength: 16 }), jsonValue)
        ),
        (source) => {
          const decoded = decodeProtocolJsonText(source);

          expect(decoded.ok).toBe(false);
          expect(decoded.diagnostics[0]?.code).toBe('PLG-4020');
        }
      ),
      propertyParameters
    );
  });
});
