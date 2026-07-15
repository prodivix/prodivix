import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DESIGN_TOKEN_DECODE_ISSUE_CODES } from './designToken.types';
import { decodeDtcgDesignTokenDocument } from './dtcgDesignTokenCodec';

const propertyParameters = Object.freeze({
  numRuns: 40,
  seed: 0x15_07_2026,
});

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/);

describe('DTCG design token codec properties', () => {
  it('is insertion-order independent and preserves extension data', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(identifier, { minLength: 2, maxLength: 8 }),
        fc.jsonValue({ maxDepth: 3 }),
        (tokenNames, extensionValue) => {
          const tokenEntries = tokenNames.map(
            (name, index) => [name, { $value: index }] as const
          );
          const createInput = (reverse: boolean) => ({
            $extensions: {
              'dev.prodivix.property-test': extensionValue,
            },
            scale: {
              $type: 'number',
              ...Object.fromEntries(
                reverse ? [...tokenEntries].reverse() : tokenEntries
              ),
            },
            alias: {
              $type: 'number',
              selected: { $value: `{scale.${tokenNames[0]}}` },
            },
          });

          const forward = decodeDtcgDesignTokenDocument(createInput(false));
          const reversed = decodeDtcgDesignTokenDocument(createInput(true));
          expect(forward).toEqual(reversed);
          expect(forward.ok).toBe(true);
          if (!forward.ok) return;
          expect(forward.value.tokens).toHaveLength(tokenNames.length + 1);
          expect(
            forward.value.tokens.find((token) => token.name === 'selected')
              ?.directReference
          ).toMatchObject({
            syntax: 'curly',
            target: { kind: 'token' },
          });
          expect(forward.value.groups[0]?.extensions).toEqual({
            'dev.prodivix.property-test': extensionValue,
          });
          expect(Object.isFrozen(forward.value)).toBe(true);
        }
      ),
      propertyParameters
    );
  });

  it('resolves group extension and JSON Pointer types without guessing values', () => {
    fc.assert(
      fc.property(identifier, identifier, (baseName, derivedName) => {
        fc.pre(baseName !== derivedName);
        const decoded = decodeDtcgDesignTokenDocument({
          [baseName]: {
            $type: 'dimension',
            spacing: { $value: { value: 1, unit: 'px' } },
          },
          [derivedName]: {
            $extends: `{${baseName}}`,
            local: { $value: { value: 2, unit: 'px' } },
          },
          alias: {
            $ref: `#/${baseName}/spacing/$value`,
          },
        });
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) return;
        expect(
          decoded.value.tokens.find((token) => token.name === 'local')?.typeRef
        ).toBe('dimension');
        expect(
          decoded.value.tokens.find((token) => token.name === 'alias')?.typeRef
        ).toBe('dimension');
      }),
      propertyParameters
    );
  });

  it('rejects missing types and reference cycles deterministically', () => {
    fc.assert(
      fc.property(identifier, identifier, (leftName, rightName) => {
        fc.pre(leftName !== rightName);
        const cycle = decodeDtcgDesignTokenDocument({
          [leftName]: { $value: `{${rightName}}` },
          [rightName]: { $value: `{${leftName}}` },
        });
        expect(cycle.ok).toBe(false);
        if (cycle.ok) return;
        expect(cycle.issues.map(({ code }) => code)).toEqual([
          DESIGN_TOKEN_DECODE_ISSUE_CODES.referenceCycle,
          DESIGN_TOKEN_DECODE_ISSUE_CODES.referenceCycle,
        ]);

        const missingType = decodeDtcgDesignTokenDocument({
          [leftName]: { $value: 1 },
        });
        expect(missingType).toMatchObject({
          ok: false,
          issues: [{ code: DESIGN_TOKEN_DECODE_ISSUE_CODES.typeMissing }],
        });
      }),
      propertyParameters
    );
  });
});
