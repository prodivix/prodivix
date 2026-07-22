import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createDesignTokenResolutionPlan,
  decodeDtcgDesignTokenResolverDocument,
} from './index';

const referencePathArbitrary = fc
  .array(fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/), {
    minLength: 1,
    maxLength: 4,
  })
  .map((segments) => `${segments.join('/')}.tokens.json`);

describe('DTCG Design Token Resolver codec properties', () => {
  it('preserves ordered design-system sources and resolves case-insensitive variant inputs', () => {
    fc.assert(
      fc.property(
        referencePathArbitrary,
        referencePathArbitrary,
        referencePathArbitrary,
        (foundationPath, lightPath, darkPath) => {
          const decoded = decodeDtcgDesignTokenResolverDocument({
            name: 'Product design system',
            version: '2025.10',
            sets: {
              foundation: {
                sources: [{ $ref: foundationPath }],
              },
            },
            modifiers: {
              theme: {
                contexts: {
                  light: [{ $ref: lightPath }],
                  dark: [{ $ref: darkPath }],
                },
                default: 'light',
              },
            },
            resolutionOrder: [
              { $ref: '#/sets/foundation' },
              { $ref: '#/modifiers/theme' },
            ],
          });
          expect(decoded.ok).toBe(true);
          if (!decoded.ok) return;
          expect(decoded.value.permutationCount).toBe(2);

          const plan = createDesignTokenResolutionPlan(decoded.value, {
            THEME: 'DARK',
          });
          expect(plan).toMatchObject({
            ok: true,
            plan: {
              selection: { theme: 'dark' },
              orderedSources: [
                {
                  precedence: 0,
                  orderEntryName: 'foundation',
                  orderEntryKind: 'set',
                  source: {
                    kind: 'reference',
                    reference: {
                      target: {
                        kind: 'document',
                        documentPath: foundationPath,
                      },
                    },
                  },
                },
                {
                  precedence: 1,
                  orderEntryName: 'theme',
                  orderEntryKind: 'modifier',
                  contextName: 'dark',
                  source: {
                    kind: 'reference',
                    reference: {
                      target: {
                        kind: 'document',
                        documentPath: darkPath,
                      },
                    },
                  },
                },
              ],
            },
          });
        }
      ),
      { numRuns: 32, seed: 0xd7c6_2025 }
    );
  });

  it('rejects cyclic set composition before authoring', () => {
    const decoded = decodeDtcgDesignTokenResolverDocument({
      version: '2025.10',
      sets: {
        first: { sources: [{ $ref: '#/sets/second' }] },
        second: { sources: [{ $ref: '#/sets/first' }] },
      },
      resolutionOrder: [{ $ref: '#/sets/first' }],
    });
    expect(decoded).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'DTR_REFERENCE_CYCLE' }),
      ]),
    });
  });

  it('validates missing, unknown, and invalid modifier selections together', () => {
    const decoded = decodeDtcgDesignTokenResolverDocument({
      version: '2025.10',
      modifiers: {
        theme: {
          contexts: { light: [], dark: [] },
        },
        density: {
          contexts: { compact: [], comfortable: [] },
        },
      },
      resolutionOrder: [
        { $ref: '#/modifiers/theme' },
        { $ref: '#/modifiers/density' },
      ],
    });
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(
      createDesignTokenResolutionPlan(decoded.value, {
        theme: 'sepia',
        experimental: 'true',
      })
    ).toMatchObject({
      ok: false,
      issues: [
        { code: 'DTR_INPUT_MODIFIER_MISSING', path: '/input/density' },
        { code: 'DTR_INPUT_MODIFIER_UNKNOWN', path: '/input/experimental' },
        { code: 'DTR_INPUT_CONTEXT_INVALID', path: '/input/theme' },
      ],
    });
  });

  it('validates references declared by inline resolution-order definitions', () => {
    const decoded = decodeDtcgDesignTokenResolverDocument({
      version: '2025.10',
      modifiers: {
        theme: {
          contexts: { light: [], dark: [] },
          default: 'light',
        },
      },
      resolutionOrder: [
        {
          type: 'set',
          name: 'inline-invalid',
          sources: [{ $ref: '#/modifiers/theme' }],
        },
      ],
    });

    expect(decoded).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          code: 'DTR_REFERENCE_TARGET_INVALID',
          path: '/sets/inline-invalid/sources/0/$ref',
        }),
      ]),
    });
  });
});
