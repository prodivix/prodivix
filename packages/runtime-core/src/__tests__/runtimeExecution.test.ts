import { describe, expect, it, vi } from 'vitest';
import {
  createRuntimeCancellationController,
  RuntimeCancellationError,
} from '../runtimeExecution';

describe('runtime cancellation controller', () => {
  it('publishes one immutable cancellation to current and late subscribers', () => {
    const controller = createRuntimeCancellationController();
    const current = vi.fn();
    const removed = vi.fn();
    const unsubscribe = controller.signal.subscribe(current);
    controller.signal.subscribe(removed)();

    expect(controller.abort('verification timeout')).toBe(true);
    expect(controller.abort('late cancellation')).toBe(false);
    expect(controller.signal).toMatchObject({
      aborted: true,
      reason: 'verification timeout',
    });
    expect(current).toHaveBeenCalledOnce();
    expect(current).toHaveBeenCalledWith('verification timeout');
    expect(removed).not.toHaveBeenCalled();

    const late = vi.fn();
    const unsubscribeLate = controller.signal.subscribe(late);
    expect(late).toHaveBeenCalledOnce();
    expect(late).toHaveBeenCalledWith('verification timeout');
    unsubscribe();
    unsubscribeLate();
  });

  it('reports listener failures without interrupting cancellation delivery', () => {
    const onListenerError = vi.fn();
    const controller = createRuntimeCancellationController({
      onListenerError,
    });
    const delivered = vi.fn();
    controller.signal.subscribe(() => {
      throw new Error('observer failed');
    });
    controller.signal.subscribe(delivered);

    expect(controller.abort()).toBe(true);
    expect(onListenerError).toHaveBeenCalledOnce();
    expect(delivered).toHaveBeenCalledOnce();
  });

  it('throws a typed error only after cancellation commits', () => {
    const controller = createRuntimeCancellationController();
    expect(() => controller.signal.throwIfAborted()).not.toThrow();

    const reason = new Error('worker lost');
    controller.abort(reason);
    expect(() => controller.signal.throwIfAborted()).toThrow(
      RuntimeCancellationError
    );
    try {
      controller.signal.throwIfAborted();
    } catch (error) {
      expect(error).toMatchObject({ reason });
    }
  });
});
