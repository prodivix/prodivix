import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  collectWorkspaceCodeArtifactLifecycleDiagnostics,
  createWorkspaceCodeSlotRegistryFromSnapshot,
  createWorkspaceExternalAdapterBindingTransactionPlan,
  createWorkspaceExternalAdapterCodeSlotId,
  createWorkspaceOrphanCodeArtifactToModuleCommand,
  createWorkspaceSemanticIndexFromSnapshot,
  projectWorkspaceCodeArtifactLifecycles,
  type WorkspaceSnapshot,
} from '..';

const suffixArbitrary = fc.string({
  unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
  minLength: 1,
  maxLength: 16,
});

const createWorkspace = (
  suffix: string
): { workspace: WorkspaceSnapshot; libraryId: string; artifactId: string } => {
  const libraryId = `library-${suffix}`;
  const artifactId = `adapter-${suffix}`;
  return {
    libraryId,
    artifactId,
    workspace: {
      id: `workspace-${suffix}`,
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
          children: ['config-dir', 'src-dir'],
        },
        'config-dir': {
          id: 'config-dir',
          kind: 'dir',
          name: 'config',
          parentId: 'root',
          children: ['config-node'],
        },
        'config-node': {
          id: 'config-node',
          kind: 'doc',
          name: 'external-libraries.json',
          parentId: 'config-dir',
          docId: 'external-config',
        },
        'src-dir': {
          id: 'src-dir',
          kind: 'dir',
          name: 'src',
          parentId: 'root',
          children: ['adapters-dir'],
        },
        'adapters-dir': {
          id: 'adapters-dir',
          kind: 'dir',
          name: 'adapters',
          parentId: 'src-dir',
          children: ['adapter-node'],
        },
        'adapter-node': {
          id: 'adapter-node',
          kind: 'doc',
          name: `${artifactId}.ts`,
          parentId: 'adapters-dir',
          docId: artifactId,
        },
      },
      docsById: {
        'external-config': {
          id: 'external-config',
          type: 'project-config',
          path: '/config/external-libraries.json',
          contentRev: 1,
          metaRev: 1,
          content: {
            kind: 'config',
            value: {
              activeLibraries: [
                { id: libraryId, scope: 'utility', version: '1.0.0' },
              ],
            },
          },
        },
        [artifactId]: {
          id: artifactId,
          type: 'code',
          path: `/src/adapters/${artifactId}.ts`,
          contentRev: 1,
          metaRev: 1,
          content: {
            language: 'ts',
            source: 'export default {};',
          },
        },
      },
      routeManifest: { version: '1', root: { id: 'route-root' } },
    },
  };
};

describe('workspace external adapter lifecycle properties', () => {
  it('moves bind, orphan, and module conversion through reversible operations', () => {
    fc.assert(
      fc.property(suffixArbitrary, (suffix) => {
        const { workspace, libraryId, artifactId } = createWorkspace(suffix);
        const bind = createWorkspaceExternalAdapterBindingTransactionPlan({
          workspace,
          libraryId,
          reference: { artifactId, exportName: 'default' },
          transactionId: `bind-${suffix}`,
          issuedAt: '2026-07-15T00:00:00.000Z',
        });
        expect(bind.status).toBe('ready');
        if (bind.status !== 'ready') return;
        const bound = applyWorkspaceTransaction(workspace, bind.transaction);
        if (!bound.ok) throw new Error(JSON.stringify(bound.issues));
        const activeProjection = projectWorkspaceCodeArtifactLifecycles(
          bound.snapshot
        );
        expect(activeProjection.status).toBe('ready');
        if (activeProjection.status !== 'ready') return;
        expect(
          activeProjection.records.find(
            ({ artifact }) => artifact.id === artifactId
          )?.lifecycle.status
        ).toBe('active');
        const registry = createWorkspaceCodeSlotRegistryFromSnapshot(
          bound.snapshot
        );
        const semantic = createWorkspaceSemanticIndexFromSnapshot(
          bound.snapshot
        );
        expect(registry.status).toBe('ready');
        expect(semantic.status).toBe('ready');
        if (registry.status !== 'ready' || semantic.status !== 'ready') return;
        const adapterProjection = registry.registry.getBindingProjection(
          createWorkspaceExternalAdapterCodeSlotId(libraryId)
        );
        expect(adapterProjection).not.toBeNull();
        expect(
          semantic.index.getReference(
            adapterProjection?.semanticReferenceId ?? 'missing'
          )
        ).toEqual(
          expect.objectContaining({
            id: adapterProjection?.semanticReferenceId,
            kind: 'code-reference',
          })
        );

        const detach = createWorkspaceExternalAdapterBindingTransactionPlan({
          workspace: bound.snapshot,
          libraryId,
          reference: null,
          transactionId: `detach-${suffix}`,
          issuedAt: '2026-07-15T00:00:01.000Z',
        });
        expect(detach.status).toBe('ready');
        if (detach.status !== 'ready') return;
        const detached = applyWorkspaceTransaction(
          bound.snapshot,
          detach.transaction
        );
        if (!detached.ok) throw new Error(JSON.stringify(detached.issues));
        expect(
          collectWorkspaceCodeArtifactLifecycleDiagnostics(detached.snapshot)
        ).toEqual([
          expect.objectContaining({
            code: 'COD-3017',
            targetRef: { kind: 'code-artifact', artifactId },
          }),
        ]);

        const conversion = createWorkspaceOrphanCodeArtifactToModuleCommand({
          workspace: detached.snapshot,
          artifactId,
          commandId: `convert-${suffix}`,
          issuedAt: '2026-07-15T00:00:02.000Z',
        });
        expect(conversion.status).toBe('ready');
        if (conversion.status !== 'ready') return;
        const converted = applyWorkspaceCommand(
          detached.snapshot,
          conversion.command
        );
        expect(converted.ok).toBe(true);
        if (!converted.ok) return;
        const finalProjection = projectWorkspaceCodeArtifactLifecycles(
          converted.snapshot
        );
        expect(finalProjection.status).toBe('ready');
        if (finalProjection.status !== 'ready') return;
        expect(
          finalProjection.records.find(
            ({ artifact }) => artifact.id === artifactId
          )?.lifecycle.status
        ).toBe('workspace-module');
      }),
      { numRuns: 30 }
    );
  });
});
