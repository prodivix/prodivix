import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  claimWorkspaceOutboxEntry,
  retryWorkspaceOutboxEntry,
} from './workspaceOutbox';
import {
  createWorkspaceSettingsOutboxEntry,
  mergeWorkspaceSettings,
  workspaceSettingsEqual,
} from './workspaceSettingsOutbox';
import { createPirContent } from './__tests__/testWorkspace';

const workspace: WorkspaceSnapshot = {
  id: 'workspace-1',
  workspaceRev: 7,
  routeRev: 3,
  opSeq: 12,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: 'page-home',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/home.pir.json',
      contentRev: 2,
      metaRev: 1,
      content: createPirContent(),
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page-home' },
  },
};

const canonicalJson = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

describe('workspace settings outbox properties', () => {
  it('preserves local values whenever the remote base is unchanged', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (local) => {
        const base = { stable: true };
        const canonicalLocal = canonicalJson(local);
        expect(mergeWorkspaceSettings(base, canonicalLocal, base)).toEqual(
          canonicalLocal
        );
      }),
      { numRuns: 300, seed: 0x13_07_2026 }
    );
  });

  it('combines non-overlapping local and remote changes', () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), (local, remote) => {
        const canonicalLocal = canonicalJson(local);
        const canonicalRemote = canonicalJson(remote);
        expect(
          mergeWorkspaceSettings(
            { stable: true },
            { stable: true, local: canonicalLocal },
            { stable: true, remote: canonicalRemote }
          )
        ).toEqual({
          stable: true,
          local: canonicalLocal,
          remote: canonicalRemote,
        });
      }),
      { numRuns: 300, seed: 0x13_07_2026 }
    );
  });

  it('compares settings independently of object key insertion order', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (settings) => {
        const canonical = canonicalJson(settings);
        const reversed = Object.fromEntries(
          Object.entries(canonical).reverse()
        );
        expect(workspaceSettingsEqual(canonical, reversed)).toBe(true);
      }),
      { numRuns: 300, seed: 0x13_07_2026 }
    );
  });

  it('keeps the exact request across retry leases', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (settings) => {
        const created = createWorkspaceSettingsOutboxEntry({
          baseSnapshot: workspace,
          baseSettings: {},
          settings,
          commitId: 'settings-commit',
          issuedAt: '2026-07-13T00:00:00.000Z',
          now: 100,
        });
        expect(created.ok).toBe(true);
        if (!created.ok) return;
        const exactRequest = JSON.stringify(created.entry.request);
        const claimed = claimWorkspaceOutboxEntry(created.entry, {
          leaseOwnerId: 'tab-1',
          now: 100,
          leaseDurationMs: 1_000,
        });
        expect(claimed).not.toBeNull();
        if (!claimed) return;
        const retry = retryWorkspaceOutboxEntry(claimed, {
          leaseOwnerId: 'tab-1',
          now: 200,
          failure: {
            code: 'NETWORK_ERROR',
            message: 'offline',
            retryable: true,
          },
          entropy: 0.5,
        });
        expect(retry).not.toBeNull();
        expect(JSON.stringify(retry?.request)).toBe(exactRequest);
      }),
      { numRuns: 300, seed: 0x13_07_2026 }
    );
  });
});
