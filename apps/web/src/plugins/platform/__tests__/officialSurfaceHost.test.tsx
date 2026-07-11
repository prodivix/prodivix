import { act, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useOfficialReactSurfaceHost } from '@prodivix/plugin-react-host';
import type { PluginOwnerRef } from '@prodivix/plugin-host';
import {
  createOfficialSurfaceLeaseRegistry,
  OfficialPluginOwnerSurface,
  OfficialReactSurfaceBoundary,
  OfficialSurfaceLeaseRegistryContext,
} from '@/plugins/platform/officialSurfaceHost';

const owner = (generation: number): PluginOwnerRef => ({
  pluginId: '@prodivix/plugin-surface-test',
  installationId: 'surface-test-installation',
  generation,
});

function SurfaceLeaseProbe({ cleanup }: Readonly<{ cleanup: () => void }>) {
  const host = useOfficialReactSurfaceHost();
  useEffect(() => {
    if (!host) throw new Error('Surface lease probe requires a host.');
    return host.registerCleanup(cleanup).dispose;
  }, [cleanup, host]);
  return <button type="button">Surface ready</button>;
}

describe('official React surface host', () => {
  it('releases only the exact owner generation and remains idempotent', async () => {
    const registry = createOfficialSurfaceLeaseRegistry();
    const firstCleanup = vi.fn();
    const secondCleanup = vi.fn();
    registry.register(owner(1), firstCleanup);
    registry.register(owner(2), secondCleanup);

    expect(registry.listSnapshots()).toEqual([
      { owner: owner(1), leaseCount: 1 },
      { owner: owner(2), leaseCount: 1 },
    ]);
    await registry.releaseOwner(owner(1));
    await registry.releaseOwner(owner(1));

    expect(firstCleanup).toHaveBeenCalledTimes(1);
    expect(secondCleanup).not.toHaveBeenCalled();
    expect(registry.listSnapshots()).toEqual([
      { owner: owner(2), leaseCount: 1 },
    ]);
  });

  it('binds mounted surface cleanup to the projected plugin owner', async () => {
    const registry = createOfficialSurfaceLeaseRegistry();
    const cleanup = vi.fn();
    render(
      <OfficialSurfaceLeaseRegistryContext.Provider value={registry}>
        <div className="relative">
          <OfficialReactSurfaceBoundary>
            <OfficialPluginOwnerSurface owner={owner(3)}>
              <SurfaceLeaseProbe cleanup={cleanup} />
            </OfficialPluginOwnerSurface>
          </OfficialReactSurfaceBoundary>
        </div>
      </OfficialSurfaceLeaseRegistryContext.Provider>
    );

    expect(
      await screen.findByRole('button', { name: 'Surface ready' })
    ).toBeTruthy();
    await waitFor(() =>
      expect(registry.listSnapshots()).toEqual([
        { owner: owner(3), leaseCount: 1 },
      ])
    );
    await act(() => registry.releaseOwner(owner(3)));

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(registry.listSnapshots()).toEqual([]);
  });

  it('awaits an in-flight disposed lease and reuses its cleanup Promise', async () => {
    const registry = createOfficialSurfaceLeaseRegistry();
    let finishCleanup: (() => void) | undefined;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        })
    );
    const registration = registry.register(owner(4), cleanup);

    const firstDispose = registration.dispose();
    const secondDispose = registration.dispose();
    let releaseSettled = false;
    const release = registry.releaseOwner(owner(4)).then(() => {
      releaseSettled = true;
    });

    expect(secondDispose).toBe(firstDispose);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(releaseSettled).toBe(false);
    finishCleanup?.();
    await firstDispose;
    await release;

    expect(releaseSettled).toBe(true);
    expect(registry.listSnapshots()).toEqual([]);
  });

  it('waits for every owner lease before reporting a cleanup failure', async () => {
    const registry = createOfficialSurfaceLeaseRegistry();
    const cleanupError = new Error('surface cleanup failed');
    let rejectCleanup: ((error: Error) => void) | undefined;
    let finishCleanup: (() => void) | undefined;
    const failedRegistration = registry.register(
      owner(5),
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectCleanup = reject;
        })
    );
    const pendingRegistration = registry.register(
      owner(5),
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        })
    );

    const release = registry.releaseOwner(owner(5));
    let releaseSettled = false;
    void release.then(
      () => {
        releaseSettled = true;
      },
      () => {
        releaseSettled = true;
      }
    );
    rejectCleanup?.(cleanupError);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(releaseSettled).toBe(false);
    finishCleanup?.();
    await expect(release).rejects.toBe(cleanupError);
    await expect(failedRegistration.dispose()).rejects.toBe(cleanupError);
    await expect(pendingRegistration.dispose()).resolves.toBeUndefined();
    expect(releaseSettled).toBe(true);
    expect(registry.listSnapshots()).toEqual([]);
  });

  it('awaits an in-flight disposed lease during full release', async () => {
    const registry = createOfficialSurfaceLeaseRegistry();
    let finishCleanup: (() => void) | undefined;
    const disposal = registry
      .register(
        owner(6),
        () =>
          new Promise<void>((resolve) => {
            finishCleanup = resolve;
          })
      )
      .dispose();
    let releaseSettled = false;
    const release = registry.releaseAll().then(() => {
      releaseSettled = true;
    });

    expect(releaseSettled).toBe(false);
    finishCleanup?.();
    await disposal;
    await release;

    expect(releaseSettled).toBe(true);
    expect(registry.listSnapshots()).toEqual([]);
  });

  it('waits for every owner batch before full release reports failure', async () => {
    const registry = createOfficialSurfaceLeaseRegistry();
    const cleanupError = new Error('full surface cleanup failed');
    let rejectCleanup: ((error: Error) => void) | undefined;
    let finishCleanup: (() => void) | undefined;
    registry.register(
      owner(7),
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectCleanup = reject;
        })
    );
    registry.register(
      owner(8),
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        })
    );

    const release = registry.releaseAll();
    let releaseSettled = false;
    void release.then(
      () => {
        releaseSettled = true;
      },
      () => {
        releaseSettled = true;
      }
    );
    rejectCleanup?.(cleanupError);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(releaseSettled).toBe(false);
    finishCleanup?.();
    await expect(release).rejects.toBe(cleanupError);
    expect(releaseSettled).toBe(true);
    expect(registry.listSnapshots()).toEqual([]);
  });

  it('reuses the active owner release Promise until cleanup finishes', async () => {
    const registry = createOfficialSurfaceLeaseRegistry();
    let finishCleanup: (() => void) | undefined;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        })
    );
    registry.register(owner(9), cleanup);

    const firstRelease = registry.releaseOwner(owner(9));
    const secondRelease = registry.releaseOwner(owner(9));

    expect(secondRelease).toBe(firstRelease);
    expect(cleanup).toHaveBeenCalledTimes(1);
    finishCleanup?.();
    await firstRelease;
    expect(registry.listSnapshots()).toEqual([]);
  });

  it('reuses the active global release Promise until cleanup finishes', async () => {
    const registry = createOfficialSurfaceLeaseRegistry();
    let finishCleanup: (() => void) | undefined;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        })
    );
    registry.register(owner(10), cleanup);

    const firstRelease = registry.releaseAll();
    const secondRelease = registry.releaseAll();

    expect(secondRelease).toBe(firstRelease);
    expect(cleanup).toHaveBeenCalledTimes(1);
    finishCleanup?.();
    await firstRelease;
    expect(registry.listSnapshots()).toEqual([]);
  });

  it('drains owner leases registered by cleanup and rejects post-release leaks', async () => {
    const registry = createOfficialSurfaceLeaseRegistry();
    const nestedCleanup = vi.fn();
    registry.register(owner(11), () => {
      registry.register(owner(11), nestedCleanup);
    });

    await registry.releaseOwner(owner(11));

    expect(nestedCleanup).toHaveBeenCalledTimes(1);
    expect(registry.listSnapshots()).toEqual([]);

    const postReleaseCleanup = vi.fn();
    const postReleaseRegistration = registry.register(
      owner(11),
      postReleaseCleanup
    );
    await postReleaseRegistration.dispose();
    expect(postReleaseCleanup).toHaveBeenCalledTimes(1);
    expect(registry.listSnapshots()).toEqual([]);
  });

  it('drains new owners registered by cleanup and closes the global registry', async () => {
    const registry = createOfficialSurfaceLeaseRegistry();
    const nestedCleanup = vi.fn();
    registry.register(owner(12), () => {
      registry.register(owner(13), nestedCleanup);
    });

    await registry.releaseAll();

    expect(nestedCleanup).toHaveBeenCalledTimes(1);
    expect(registry.listSnapshots()).toEqual([]);

    const postReleaseCleanup = vi.fn();
    const postReleaseRegistration = registry.register(
      owner(14),
      postReleaseCleanup
    );
    await postReleaseRegistration.dispose();
    expect(postReleaseCleanup).toHaveBeenCalledTimes(1);
    expect(registry.listSnapshots()).toEqual([]);
  });
});
