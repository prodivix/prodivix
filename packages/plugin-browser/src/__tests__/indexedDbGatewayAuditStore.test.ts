import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createIndexedDbGatewayAuditStore } from '#browser/gateway/audit/indexedDbGatewayAuditStore';
import type { GatewayAuditRecord } from '#browser/gateway/audit/gatewayAudit';

const record = (eventId: string, occurredAt: number): GatewayAuditRecord => ({
  eventId,
  occurredAt,
  owner: {
    pluginId: 'publisher.plugin' as GatewayAuditRecord['owner']['pluginId'],
    installationId: 'installation-1',
    generation: 1,
  },
  pluginVersion: '1.0.0',
  operationId: `operation-${eventId}`,
  method: 'workspace/dispatch-intent',
  contractVersion: '1',
  permissionRevision: 1,
  phase: 'preflight',
  outcome: 'attempted',
  requestBytes: 0,
  metadata: {},
});

const deleteDatabase = (factory: IDBFactory, name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error('deleteDatabase failed.'));
  });

describe('IndexedDB gateway audit store', () => {
  it('keeps appending after the open handle is closed by a version change', async () => {
    const factory = new IDBFactory();
    const databaseName = 'audit-versionchange';
    const store = createIndexedDbGatewayAuditStore({
      databaseName,
      indexedDb: factory,
    });

    await store.append(record('event-1', 1_000));
    expect(await store.readRecent()).toHaveLength(1);

    // Clearing site data (or another tab upgrading) fires versionchange and
    // closes the handle the store memoized.
    await deleteDatabase(factory, databaseName);

    await store.append(record('event-2', 2_000));
    expect((await store.readRecent()).map((entry) => entry.eventId)).toEqual([
      'event-2',
    ]);
  });

  it('retries the open after a failed one instead of caching the rejection', async () => {
    const backing = new IDBFactory();
    let failNextOpen = true;
    const factory = {
      open: (name: string, version?: number) => {
        if (!failNextOpen) return backing.open(name, version);
        failNextOpen = false;
        const request = {
          error: new Error('Quota exceeded.'),
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null,
          onblocked: null,
        } as unknown as IDBOpenDBRequest;
        queueMicrotask(() => request.onerror?.(new Event('error')));
        return request;
      },
    } as unknown as IDBFactory;

    const store = createIndexedDbGatewayAuditStore({
      databaseName: 'audit-open-failure',
      indexedDb: factory,
    });

    await expect(store.append(record('event-1', 1_000))).rejects.toThrow();
    await store.append(record('event-2', 2_000));

    expect((await store.readRecent()).map((entry) => entry.eventId)).toEqual([
      'event-2',
    ]);
  });
});
