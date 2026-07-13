import { describe, expect, it } from 'vitest';
import {
  createRuntimeExecutorRegistry,
  RuntimeExecutorNotFoundError,
} from '..';

describe('runtime executor registry', () => {
  it('keeps registrations instance-owned and executes async handlers', async () => {
    const first = createRuntimeExecutorRegistry<number, number>();
    const second = createRuntimeExecutorRegistry<number, number>();
    first.register('double', async (value) => value * 2);

    await expect(first.execute('double', 4)).resolves.toBe(8);
    await expect(second.execute('double', 4)).rejects.toBeInstanceOf(
      RuntimeExecutorNotFoundError
    );
  });

  it('rejects empty and duplicate keys instead of silently overriding', () => {
    const registry = createRuntimeExecutorRegistry<void, void>();
    registry.register('run', () => undefined);

    expect(() => registry.register('run', () => undefined)).toThrow(
      'Runtime executor is already registered: run'
    );
    expect(() => registry.resolve('   ')).toThrow(
      'Runtime executor key must not be empty.'
    );
  });

  it('only unregisters the executor owned by its disposer', () => {
    const registry = createRuntimeExecutorRegistry<void, void>();
    const dispose = registry.register('run', () => undefined);

    expect(registry.listKeys()).toEqual(['run']);
    dispose();
    dispose();
    expect(registry.listKeys()).toEqual([]);
  });
});
