import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_PIR_WIRE_VERSION,
  createPirMigrationRegistry,
  upgradePirWireDocument,
} from './pirMigrationRegistry';
import { decodePirDocument, encodePirDocument } from './pirCodec';

describe('PIR wire migration registry properties', () => {
  it('passes the generated current wire version without a domain migration', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (payload) => {
        const wire = { version: CURRENT_PIR_WIRE_VERSION, payload };
        const result = upgradePirWireDocument(wire);
        expect(result).toMatchObject({
          ok: true,
          sourceVersion: CURRENT_PIR_WIRE_VERSION,
          targetVersion: CURRENT_PIR_WIRE_VERSION,
          appliedMigrations: [],
        });
        if (result.ok) expect(result.value).toBe(wire);
      }),
      { numRuns: 30 }
    );
  });

  it('applies an explicit migration chain in schema order', () => {
    const registry = createPirMigrationRegistry({
      currentVersion: '3',
      migrations: [
        {
          fromVersion: '1',
          toVersion: '2',
          migrate: (wire) => ({
            ...(wire as Record<string, unknown>),
            version: '2',
            steps: ['one-to-two'],
          }),
        },
        {
          fromVersion: '2',
          toVersion: '3',
          migrate: (wire) => ({
            ...(wire as Record<string, unknown>),
            version: '3',
            steps: [
              ...((wire as Record<string, unknown>).steps as string[]),
              'two-to-three',
            ],
          }),
        },
      ],
    });

    expect(registry.upgrade({ version: '1' })).toMatchObject({
      ok: true,
      value: {
        version: '3',
        steps: ['one-to-two', 'two-to-three'],
      },
      appliedMigrations: [
        { fromVersion: '1', toVersion: '2' },
        { fromVersion: '2', toVersion: '3' },
      ],
    });
  });

  it('deterministically migrates the frozen 1.3 wire contract into the current domain', () => {
    const legacyWire = {
      version: '1.3',
      metadata: { name: 'Legacy page' },
      ui: {
        graph: {
          version: 1,
          rootId: 'root',
          nodesById: {
            root: {
              id: 'root',
              type: 'container',
              text: 'Hello',
              props: { title: { $param: 'title' } },
              style: { color: 'red' },
            },
          },
          childIdsById: { root: [] },
          order: { strategy: 'childIdsById' },
        },
      },
      logic: {
        props: {
          title: { type: 'string', default: 'Hello' },
        },
        state: {
          count: { type: 'number', initial: 0 },
        },
      },
    };

    const first = upgradePirWireDocument(legacyWire);
    const second = upgradePirWireDocument(structuredClone(legacyWire));

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ok: true,
      sourceVersion: '1.3',
      targetVersion: CURRENT_PIR_WIRE_VERSION,
      value: {
        version: CURRENT_PIR_WIRE_VERSION,
        ui: {
          graph: {
            nodesById: {
              root: {
                kind: 'element',
                text: { kind: 'literal', value: 'Hello' },
                props: { title: { kind: 'param', paramId: 'title' } },
              },
            },
          },
        },
      },
    });
    if (first.ok) {
      expect(first.appliedMigrations[0]).toEqual({
        fromVersion: '1.3',
        toVersion: '1.4',
      });
      expect(first.appliedMigrations.at(-1)?.toVersion).toBe(
        CURRENT_PIR_WIRE_VERSION
      );
    }
    const decoded = decodePirDocument(legacyWire);
    expect(decoded).toMatchObject({
      ok: true,
      value: {
        ui: {
          graph: {
            nodesById: { root: { kind: 'element' } },
          },
        },
      },
    });
    if (decoded.ok) {
      expect(decoded.value).not.toHaveProperty('version');
      expect(JSON.parse(encodePirDocument(decoded.value))).toHaveProperty(
        'version',
        CURRENT_PIR_WIRE_VERSION
      );
    }
  });

  it('rejects missing and unsupported schema versions without guessing', () => {
    expect(upgradePirWireDocument({ ui: {} })).toMatchObject({
      ok: false,
      issues: [{ code: 'PIR_WIRE_SCHEMA_VERSION_MISSING' }],
    });
    expect(upgradePirWireDocument({ version: 'unknown' })).toMatchObject({
      ok: false,
      issues: [{ code: 'PIR_WIRE_SCHEMA_VERSION_UNSUPPORTED' }],
    });
    expect(
      upgradePirWireDocument({
        version: '1.3',
        ui: {
          graph: {
            version: 1,
            rootId: 'root',
            nodesById: {
              root: {
                id: 'root',
                type: 'container',
                props: { value: { $data: 'items.title' } },
              },
            },
            childIdsById: { root: [] },
          },
        },
      })
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'PIR_WIRE_MIGRATION_FAILED' }],
    });
  });
});
