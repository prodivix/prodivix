import { describe, expect, it, vi } from 'vitest';
import {
  createAnimationConflictCoordinator,
  createAnimationRuntimePropertyRegistry,
} from './animationConflictRuntime';

const target = Object.freeze({
  targetId: 'catalog-card:opacity',
  targetDocumentId: 'catalog-page',
  targetNodeId: 'catalog-card',
  propertyId: 'style.opacity',
});

const setup = () => {
  const commit = vi.fn();
  const coordinator = createAnimationConflictCoordinator({
    properties: createAnimationRuntimePropertyRegistry([
      {
        propertyId: 'style.opacity',
        kind: 'number',
        supportedModes: ['replace', 'queue', 'add', 'reject'],
      },
    ]),
    resolveTarget: (targetId) => (targetId === target.targetId ? target : null),
    adapter: { commit },
  });
  return { coordinator, commit };
};

describe('Animation conflict coordinator', () => {
  it('uses stable replace priority and fences stale generations', async () => {
    const { coordinator, commit } = setup();
    const first = await coordinator.acquire({
      targetId: target.targetId,
      propertyId: target.propertyId,
      ownerId: 'route-enter',
      generation: 1,
      priority: 10,
      mode: 'replace',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await first.lease.apply(0.5);

    expect(
      await coordinator.acquire({
        targetId: target.targetId,
        propertyId: target.propertyId,
        ownerId: 'hover',
        generation: 1,
        priority: 5,
        mode: 'replace',
      })
    ).toMatchObject({
      ok: false,
      issue: { code: 'conflict-rejected' },
    });

    const newer = await coordinator.acquire({
      targetId: target.targetId,
      propertyId: target.propertyId,
      ownerId: 'route-enter',
      generation: 2,
      priority: 10,
      mode: 'replace',
    });
    expect(newer.ok).toBe(true);
    if (!newer.ok) return;
    await newer.lease.apply(1);
    await first.lease.release();
    expect(commit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: 1,
        contributors: [
          expect.objectContaining({ ownerId: 'route-enter', generation: 2 }),
        ],
      })
    );
    expect(await first.lease.apply(0)).toMatchObject({
      ok: false,
      issue: { code: 'lease-released' },
    });
    expect(
      await coordinator.acquire({
        targetId: target.targetId,
        propertyId: target.propertyId,
        ownerId: 'route-enter',
        generation: 1,
        mode: 'replace',
      })
    ).toMatchObject({
      ok: false,
      issue: { code: 'generation-stale' },
    });
  });

  it('adds numeric contributors and cleanup removes only its own value', async () => {
    const { coordinator, commit } = setup();
    const first = await coordinator.acquire({
      targetId: target.targetId,
      propertyId: target.propertyId,
      ownerId: 'base',
      generation: 1,
      mode: 'add',
    });
    const second = await coordinator.acquire({
      targetId: target.targetId,
      propertyId: target.propertyId,
      ownerId: 'gesture',
      generation: 1,
      mode: 'add',
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    await first.lease.apply(0.25);
    await second.lease.apply(0.5);
    expect(commit).toHaveBeenLastCalledWith(
      expect.objectContaining({ value: 0.75 })
    );
    await first.lease.release();
    expect(commit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        value: 0.5,
        contributors: [expect.objectContaining({ ownerId: 'gesture' })],
      })
    );
  });

  it('queues contributors and activates the next lease after release', async () => {
    const { coordinator } = setup();
    const first = await coordinator.acquire({
      targetId: target.targetId,
      propertyId: target.propertyId,
      ownerId: 'first',
      generation: 1,
      mode: 'queue',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    let secondSettled = false;
    const secondPromise = coordinator
      .acquire({
        targetId: target.targetId,
        propertyId: target.propertyId,
        ownerId: 'second',
        generation: 1,
        mode: 'queue',
      })
      .then((result) => {
        secondSettled = true;
        return result;
      });
    await Promise.resolve();
    expect(secondSettled).toBe(false);
    await first.lease.release();
    await expect(secondPromise).resolves.toMatchObject({ ok: true });
  });
});
