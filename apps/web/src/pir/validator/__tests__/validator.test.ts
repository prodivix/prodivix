import { describe, expect, it } from 'vitest';
import { validatePirDocument } from '@/pir/validator/validator';

describe('validatePirDocument', () => {
  it('reports invalid data/list contracts', () => {
    const result = validatePirDocument({
      version: '1.2',
      ui: {
        root: {
          id: 'root',
          type: 'container',
          data: {
            extend: [],
          },
          children: [
            {
              id: 'list-node',
              type: 'PdxDiv',
              list: {
                source: { invalid: 'x' },
                keyBy: 1,
                emptyNodeId: 'missing-node',
              },
            },
          ],
        },
      },
    });

    expect(result.hasError).toBe(true);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'PIR-3002',
          domain: 'pir',
          severity: 'warning',
        }),
        expect.objectContaining({
          code: 'PIR-3010',
          domain: 'pir',
          severity: 'warning',
        }),
        expect.objectContaining({
          code: 'PIR-3010',
          domain: 'pir',
          severity: 'warning',
        }),
        expect.objectContaining({
          code: 'PIR-2007',
          domain: 'pir',
          severity: 'error',
        }),
      ])
    );
  });
});
