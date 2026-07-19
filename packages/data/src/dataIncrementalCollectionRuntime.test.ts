import { describe, expect, it } from 'vitest';
import {
  createDataIncrementalCollectionRuntime,
  DATA_INCREMENTAL_COLLECTION_ERROR_CODES,
} from './dataIncrementalCollectionRuntime';

const policy = Object.freeze({
  kind: 'keyed-event-v1' as const,
  entityIdPath: '/id',
  maxItems: 3,
});

describe('Data stream incremental collection runtime', () => {
  it('applies replace/upsert/delete in exact cursor order without mutating prior snapshots', () => {
    const runtime = createDataIncrementalCollectionRuntime({ policy });
    const replaced = runtime.apply({
      cursor: 1,
      value: {
        action: 'replace',
        items: [
          { id: 'p1', name: 'Alpha' },
          { id: 'p2', name: 'Beta' },
        ],
      },
    });
    const updated = runtime.apply({
      cursor: 2,
      value: {
        action: 'upsert',
        entity: { id: 'p2', name: 'Beta Updated' },
      },
    });
    const inserted = runtime.apply({
      cursor: 3,
      value: { action: 'upsert', entity: { id: 'p3', name: 'Gamma' } },
    });
    const deleted = runtime.apply({
      cursor: 4,
      value: { action: 'delete', id: 'p1' },
    });

    expect(replaced.items).toEqual([
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Beta' },
    ]);
    expect(updated.items).toEqual([
      { id: 'p1', name: 'Alpha' },
      { id: 'p2', name: 'Beta Updated' },
    ]);
    expect(inserted.items).toHaveLength(3);
    expect(deleted).toEqual({
      cursor: 4,
      appliedEvents: 4,
      items: [
        { id: 'p2', name: 'Beta Updated' },
        { id: 'p3', name: 'Gamma' },
      ],
    });
  });

  it('fails closed on gaps, malformed envelopes, duplicate identity, and capacity', () => {
    expect(() =>
      createDataIncrementalCollectionRuntime({
        policy,
        initialItems: [{ id: 'p1' }, { id: 'p1' }],
      })
    ).toThrow(
      expect.objectContaining({
        code: DATA_INCREMENTAL_COLLECTION_ERROR_CODES.identityConflict,
      })
    );

    const runtime = createDataIncrementalCollectionRuntime({
      policy: { ...policy, maxItems: 1 },
      initialItems: [{ id: 'p1' }],
    });
    expect(() =>
      runtime.apply({
        cursor: 2,
        value: { action: 'delete', id: 'p1' },
      })
    ).toThrow(
      expect.objectContaining({
        code: DATA_INCREMENTAL_COLLECTION_ERROR_CODES.cursorConflict,
      })
    );
    expect(() =>
      runtime.apply({ cursor: 1, value: { action: 'unknown' } })
    ).toThrow(
      expect.objectContaining({
        code: DATA_INCREMENTAL_COLLECTION_ERROR_CODES.eventInvalid,
      })
    );
    expect(() =>
      runtime.apply({
        cursor: 1,
        value: { action: 'upsert', entity: { id: 'p2' } },
      })
    ).toThrow(
      expect.objectContaining({
        code: DATA_INCREMENTAL_COLLECTION_ERROR_CODES.capacity,
      })
    );
    expect(runtime.getSnapshot()).toEqual({
      cursor: 0,
      appliedEvents: 0,
      items: [{ id: 'p1' }],
    });
  });
});
