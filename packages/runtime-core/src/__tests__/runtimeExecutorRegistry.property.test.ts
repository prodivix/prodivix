import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createRuntimeExecutorRegistry } from '..';

const propertyParameters = Object.freeze({
  numRuns: 500,
  seed: 0x13_07_2026,
});

const executorKey = fc
  .string({ minLength: 1, maxLength: 48, unit: 'grapheme' })
  .filter((value) => Boolean(value.trim()));

describe('runtime executor registry properties', () => {
  it('never leaks arbitrary registrations between registry instances', async () => {
    await fc.assert(
      fc.asyncProperty(executorKey, fc.integer(), async (key, value) => {
        const first = createRuntimeExecutorRegistry<void, number>();
        const second = createRuntimeExecutorRegistry<void, number>();
        first.register(key, () => value);

        await expect(first.execute(key, undefined)).resolves.toBe(value);
        expect(second.listKeys()).toEqual([]);
      }),
      propertyParameters
    );
  });

  it('register-dispose is idempotent for arbitrary valid keys', () => {
    fc.assert(
      fc.property(executorKey, (key) => {
        const registry = createRuntimeExecutorRegistry<void, void>();
        const dispose = registry.register(key, () => undefined);

        expect(registry.resolve(key)).toBeTypeOf('function');
        dispose();
        dispose();
        expect(registry.listKeys()).toEqual([]);
      }),
      propertyParameters
    );
  });
});
