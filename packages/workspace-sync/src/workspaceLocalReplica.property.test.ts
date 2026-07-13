import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createWorkspaceCommandOperation,
  createWorkspaceProjectConfigDocumentContent,
  createWorkspaceProjectConfigValueUpdateCommand,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { createWorkspaceOutboxEntry } from './workspaceOutbox';
import {
  advanceWorkspaceLocalReplica,
  createWorkspaceLocalReplica,
  materializeWorkspaceLocalReplica,
} from './workspaceLocalReplica';
import { createWorkspaceSettingsOutboxEntry } from './workspaceSettingsOutbox';

const workspace: WorkspaceSnapshot = {
  id: 'workspace-1',
  workspaceRev: 3,
  routeRev: 1,
  opSeq: 5,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['config-node'],
    },
    'config-node': {
      id: 'config-node',
      kind: 'doc',
      name: 'config.json',
      parentId: 'root',
      docId: 'config-document',
    },
  },
  docsById: {
    'config-document': {
      id: 'config-document',
      type: 'project-config',
      path: '/config.json',
      contentRev: 2,
      metaRev: 1,
      content: createWorkspaceProjectConfigDocumentContent(null),
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'root' },
  },
  activeRouteNodeId: 'root',
};

const canonicalJson = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const createReplica = (settings: Readonly<Record<string, unknown>> = {}) => {
  const created = createWorkspaceLocalReplica({
    snapshot: workspace,
    settings,
    savedAt: 100,
  });
  if (!created.ok) throw new Error(created.issues[0]?.message);
  expect(created.ok).toBe(true);
  return created.replica;
};

describe('workspace local replica properties', () => {
  it('round-trips arbitrary JSON settings through the canonical codec', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (settings) => {
        const canonical = canonicalJson(settings);
        const replica = createReplica(canonical);
        expect(replica.settings).toEqual(canonical);
        expect(replica.confirmedSnapshot).toEqual(workspace);
      }),
      { numRuns: 300, seed: 0x13_07_2026 }
    );
  });

  it('replays pending resource operations over the confirmed snapshot', () => {
    fc.assert(
      fc.property(
        fc.jsonValue().filter((value) => value !== null),
        (value) => {
          const canonical = canonicalJson(value);
          const command = createWorkspaceProjectConfigValueUpdateCommand({
            workspaceId: workspace.id,
            document: workspace.docsById['config-document'],
            commandId: 'config-update',
            issuedAt: '2026-07-13T00:00:00.000Z',
            value: canonical,
          });
          expect(command).not.toBeNull();
          if (!command) return;
          const entry = createWorkspaceOutboxEntry({
            baseSnapshot: workspace,
            operation: createWorkspaceCommandOperation(command),
            now: 200,
          });
          expect(entry.ok).toBe(true);
          if (!entry.ok) return;
          const materialized = materializeWorkspaceLocalReplica({
            replica: createReplica(),
            operationEntries: [entry.entry],
            settingsEntries: [],
          });
          expect(materialized.ok).toBe(true);
          if (!materialized.ok) return;
          expect(
            materialized.snapshot.docsById['config-document'].content
          ).toEqual(createWorkspaceProjectConfigDocumentContent(canonical));
          expect(materialized.pendingOperationIds).toEqual(['config-update']);
        }
      ),
      { numRuns: 300, seed: 0x13_07_2026 }
    );
  });

  it('keeps independent settings watermarks and skips acknowledged entries', () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string(), fc.jsonValue()),
        fc.dictionary(fc.string(), fc.jsonValue()),
        (firstSettings, secondSettings) => {
          const first = createWorkspaceSettingsOutboxEntry({
            baseSnapshot: workspace,
            baseSettings: {},
            settings: canonicalJson(firstSettings),
            commitId: 'settings-1',
            issuedAt: '2026-07-13T00:00:00.000Z',
            now: 200,
          });
          const second = createWorkspaceSettingsOutboxEntry({
            baseSnapshot: workspace,
            baseSettings: canonicalJson(firstSettings),
            settings: canonicalJson(secondSettings),
            commitId: 'settings-2',
            issuedAt: '2026-07-13T00:00:01.000Z',
            now: 300,
          });
          expect(first.ok && second.ok).toBe(true);
          if (!first.ok || !second.ok) return;
          const advanced = advanceWorkspaceLocalReplica(createReplica(), {
            snapshot: workspace,
            settings: canonicalJson(firstSettings),
            settingsOpSeq: 6,
            savedAt: 250,
            acknowledgedEntryIds: ['settings-1'],
          });
          expect(advanced.ok).toBe(true);
          if (!advanced.ok) return;
          const materialized = materializeWorkspaceLocalReplica({
            replica: advanced.replica,
            operationEntries: [],
            settingsEntries: [second.entry, first.entry],
          });
          expect(materialized.ok).toBe(true);
          if (!materialized.ok) return;
          expect(materialized.settings).toEqual(canonicalJson(secondSettings));
          expect(materialized.pendingSettingsCommitIds).toEqual(['settings-2']);
          expect(advanced.replica.settingsOpSeq).toBe(6);
        }
      ),
      { numRuns: 300, seed: 0x13_07_2026 }
    );
  });
});
