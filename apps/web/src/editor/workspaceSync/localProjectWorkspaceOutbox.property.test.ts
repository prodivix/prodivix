import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createEmptyPirDocument, type PIRDocument } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  type WorkspaceCommandEnvelope,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createWorkspaceOutboxEntry,
  type WorkspaceOutboxEntry,
} from '@prodivix/workspace-sync';
import { materializeLocalProjectWorkspaceOperationChain } from './localProjectWorkspaceOutbox';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'local-property',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
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
      name: 'page.pir.json',
      parentId: 'root',
      docId: 'page',
    },
  },
  docsById: {
    page: {
      id: 'page',
      type: 'pir-page',
      path: '/page.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
  },
  routeManifest: { version: '1', root: { id: 'root', children: [] } },
  activeDocumentId: 'page',
  activeRouteNodeId: 'root',
});

describe('local project Workspace Outbox properties', () => {
  it('materializes every persisted prefix to the same causal result', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { minLength: 1, maxLength: 12 }),
        fc.nat(),
        (values, prefixSeed) => {
          const entries: WorkspaceOutboxEntry[] = [];
          const snapshots: WorkspaceSnapshot[] = [createWorkspace()];
          values.forEach((value, index) => {
            const current = snapshots.at(-1)!;
            const previousMetadata = (
              current.docsById.page!.content as PIRDocument
            ).metadata;
            const metadata = { name: `Name ${index}-${value}` };
            const command: WorkspaceCommandEnvelope = {
              id: `local-operation-${index}`,
              namespace: 'core.pir',
              type: 'metadata.update',
              version: '1.0',
              issuedAt: new Date(index + 1).toISOString(),
              target: { workspaceId: current.id, documentId: 'page' },
              domainHint: 'pir',
              forwardOps: [
                previousMetadata
                  ? { op: 'replace', path: '/metadata', value: metadata }
                  : { op: 'add', path: '/metadata', value: metadata },
              ],
              reverseOps: [
                previousMetadata
                  ? {
                      op: 'replace',
                      path: '/metadata',
                      value: previousMetadata,
                    }
                  : { op: 'remove', path: '/metadata' },
              ],
            };
            const created = createWorkspaceOutboxEntry({
              baseSnapshot: current,
              operation: { kind: 'command', command },
              now: index + 1,
            });
            expect(created.ok).toBe(true);
            if (created.ok === false) return;
            entries.push(created.entry);
            const applied = applyWorkspaceCommand(current, command);
            expect(applied.ok).toBe(true);
            if (applied.ok) snapshots.push(applied.snapshot);
          });

          const prefix = prefixSeed % (entries.length + 1);
          const persisted = { ...snapshots[prefix]! };
          if (prefix % 2 === 0) delete persisted.activeDocumentId;
          const materialized = materializeLocalProjectWorkspaceOperationChain(
            persisted,
            entries
          );

          expect(materialized.persistedPrefix).toBe(prefix);
          expect(materialized.snapshot).toEqual(snapshots.at(-1));
        }
      )
    );
  });
});
