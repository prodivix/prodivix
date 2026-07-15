import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateDesignTokenResourceSource } from './designTokenResourceModel';

describe('Design Token resource model properties', () => {
  it('projects resolver context permutations independent of JSON formatting', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.integer({ min: 2, max: 5 }),
        (themeCount, densityCount) => {
          const content = {
            version: '2025.10',
            modifiers: {
              theme: {
                contexts: Object.fromEntries(
                  Array.from({ length: themeCount }, (_, index) => [
                    `theme-${index}`,
                    [],
                  ])
                ),
              },
              density: {
                contexts: Object.fromEntries(
                  Array.from({ length: densityCount }, (_, index) => [
                    `density-${index}`,
                    [],
                  ])
                ),
              },
            },
            resolutionOrder: [
              { $ref: '#/modifiers/theme' },
              { $ref: '#/modifiers/density' },
            ],
          };
          const compact = validateDesignTokenResourceSource(
            'design-token-resolver',
            JSON.stringify(content)
          );
          const formatted = validateDesignTokenResourceSource(
            'design-token-resolver',
            JSON.stringify(content, null, 4)
          );
          expect(formatted).toEqual(compact);
          expect(compact).toMatchObject({
            status: 'valid',
            summary: {
              kind: 'resolver',
              permutations: themeCount * densityCount,
            },
          });
        }
      ),
      { numRuns: 24, seed: 0xd7c6_1513 }
    );
  });
});
