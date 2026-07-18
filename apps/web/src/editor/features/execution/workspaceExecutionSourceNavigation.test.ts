import { afterEach, describe, expect, it } from 'vitest';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  closeCodeAuthoringOverlay,
  useCodeAuthoringOverlayStore,
} from '@/editor/features/code';
import { createWorkspaceExecutionSnapshotId } from './workspaceExecutionIdentity';
import { openWorkspaceExecutionSourceTrace } from './workspaceExecutionSourceNavigation';

const workspace: WorkspaceSnapshot = {
  id: 'workspace-source-navigation',
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
      children: ['code-node'],
    },
    'code-node': {
      id: 'code-node',
      kind: 'doc',
      name: 'auth.ts',
      parentId: 'root',
      docId: 'code-auth',
    },
  },
  docsById: {
    'code-auth': {
      id: 'code-auth',
      type: 'code',
      path: '/auth.ts',
      contentRev: 1,
      metaRev: 1,
      content: {
        language: 'ts',
        source: 'export const loadPrincipal = () => true;\n',
      },
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'code-auth' },
  },
};

afterEach(() => closeCodeAuthoringOverlay());

describe('Workspace execution source navigation', () => {
  it('opens the exact CodeArtifact and SourceSpan in the shared authoring overlay', () => {
    const sourceTrace = {
      sourceRef: { kind: 'code-artifact' as const, artifactId: 'code-auth' },
      sourceSpan: {
        artifactId: 'code-auth',
        startLine: 1,
        startColumn: 14,
        endLine: 1,
        endColumn: 27,
      },
    };
    expect(
      openWorkspaceExecutionSourceTrace({
        workspace,
        snapshotId: createWorkspaceExecutionSnapshotId(workspace),
        sourceTrace,
        originSurface: 'blueprint-canvas',
      })
    ).toEqual({ status: 'opened' });
    expect(useCodeAuthoringOverlayStore.getState().request).toMatchObject({
      workspaceId: workspace.id,
      artifactId: 'code-auth',
      sourceSpan: sourceTrace.sourceSpan,
      presentation: 'maximized',
      origin: {
        surface: 'blueprint-canvas',
        targetRef: sourceTrace.sourceRef,
      },
    });
  });

  it('fails closed before navigation when the Workspace snapshot is stale', () => {
    expect(
      openWorkspaceExecutionSourceTrace({
        workspace,
        snapshotId: 'older-snapshot',
        sourceTrace: {
          sourceRef: { kind: 'code-artifact', artifactId: 'code-auth' },
        },
        originSurface: 'blueprint-canvas',
      })
    ).toEqual({ status: 'unavailable', reason: 'snapshot-stale' });
    expect(useCodeAuthoringOverlayStore.getState().request).toBeNull();
  });

  it('rejects non-CodeArtifact and unavailable source targets', () => {
    const snapshotId = createWorkspaceExecutionSnapshotId(workspace);
    expect(
      openWorkspaceExecutionSourceTrace({
        workspace,
        snapshotId,
        sourceTrace: {
          sourceRef: { kind: 'workspace', workspaceId: workspace.id },
        },
        originSurface: 'blueprint-canvas',
      })
    ).toEqual({ status: 'unavailable', reason: 'source-unavailable' });
    expect(
      openWorkspaceExecutionSourceTrace({
        workspace,
        snapshotId,
        sourceTrace: {
          sourceRef: { kind: 'code-artifact', artifactId: 'missing-code' },
        },
        originSurface: 'blueprint-canvas',
      })
    ).toEqual({ status: 'unavailable', reason: 'source-unavailable' });
  });
});
