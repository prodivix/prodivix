import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Boxes, CircleAlert } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import type { DiagnosticTargetRef } from '@prodivix/diagnostics';
import type { PIRComponentContract } from '@prodivix/pir';
import { analyzeWorkspaceComponentImpact } from '@prodivix/workspace';
import { createWorkspaceCodeLanguageEnvironment } from '@/editor/codeLanguage';
import { ComponentContractEditor } from '@/editor/features/component/components/ComponentContractEditor';
import { ComponentDefinitionList } from '@/editor/features/component/components/ComponentDefinitionList';
import {
  ComponentRelationshipsPanel,
  type ComponentReferenceItem,
  type ComponentRelationshipItem,
} from '@/editor/features/component/components/ComponentRelationshipsPanel';
import { useWorkspaceComponentAuthoring } from '@/editor/features/component/controller/useWorkspaceComponentAuthoring';
import { BlueprintAuthoringSurface } from '@/editor/features/blueprint/editor/authoring/BlueprintAuthoringSurface';
import {
  navigateToWorkspaceSemanticTarget,
  resolveWorkspaceSemanticIndex,
} from '@/editor/navigation';

const ownerLabel = (ownerRef: DiagnosticTargetRef): string => {
  switch (ownerRef.kind) {
    case 'document':
      return `Document · ${ownerRef.documentId}`;
    case 'pir-node':
      return `Node · ${ownerRef.documentId}/${ownerRef.nodeId}`;
    case 'inspector-field':
      return `Instance · ${ownerRef.documentId}/${ownerRef.nodeId}`;
    case 'component-slot':
      return `Slot · ${ownerRef.documentId}/${ownerRef.nodeId}`;
    case 'route':
      return `Route · ${ownerRef.routeId}`;
    case 'code-artifact':
      return `Code · ${ownerRef.artifactId}`;
    case 'workspace':
      return `Workspace · ${ownerRef.workspaceId}`;
    case 'workspace-node':
      return `Workspace node · ${ownerRef.nodeId}`;
    case 'nodegraph-node':
      return `NodeGraph · ${ownerRef.documentId}/${ownerRef.nodeId}`;
    case 'nodegraph-port':
      return `NodeGraph port · ${ownerRef.documentId}/${ownerRef.portId}`;
    case 'animation-timeline':
      return `Animation · ${ownerRef.documentId}/${ownerRef.timelineId}`;
    case 'animation-track':
      return `Animation · ${ownerRef.documentId}/${ownerRef.trackId}`;
    case 'operation':
      return `Operation · ${ownerRef.operation}`;
    case 'theme-token':
      return `Token · ${ownerRef.tokenPath}`;
    case 'viewport':
      return `Viewport · ${ownerRef.width}×${ownerRef.height}`;
    case 'runtime-dom':
      return `Runtime · ${ownerRef.stablePath}`;
  }
};

/**
 * Hosts the Component surface. Selection is Workspace-backed while
 * drafts remain local UI state; all durable writes cross the controller's
 * Workspace Transaction and Outbox boundary.
 */
export function ComponentAuthoringPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const {
    workspace,
    readonly,
    model,
    createDefinition,
    updateContract,
    setActiveDocumentId,
  } = useWorkspaceComponentAuthoring();
  const [uiSelectedDocumentId, setUiSelectedDocumentId] = useState<
    string | null
  >(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeView, setActiveView] = useState<'canvas' | 'contract'>('canvas');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const definitions = model?.definitions ?? [];
  const definitionIds = useMemo(
    () => new Set(definitions.map(({ documentId }) => documentId)),
    [definitions]
  );
  const activeDefinitionId =
    workspace?.activeDocumentId && definitionIds.has(workspace.activeDocumentId)
      ? workspace.activeDocumentId
      : null;
  const selectedDocumentId =
    activeDefinitionId ??
    (uiSelectedDocumentId && definitionIds.has(uiSelectedDocumentId)
      ? uiSelectedDocumentId
      : (definitions[0]?.documentId ?? null));
  const selectedDefinition =
    definitions.find(({ documentId }) => documentId === selectedDocumentId) ??
    null;

  useEffect(() => {
    const next = activeDefinitionId ?? definitions[0]?.documentId ?? null;
    setUiSelectedDocumentId((current) =>
      current && definitionIds.has(current) && !activeDefinitionId
        ? current
        : next
    );
  }, [activeDefinitionId, definitionIds, definitions]);

  const semanticComposition = useMemo(
    () =>
      workspace
        ? createWorkspaceCodeLanguageEnvironment(workspace).semanticComposition
        : null,
    [workspace]
  );
  const impactResult = useMemo(() => {
    if (
      !workspace ||
      !selectedDefinition ||
      semanticComposition?.status !== 'ready'
    ) {
      return null;
    }
    return analyzeWorkspaceComponentImpact({
      workspace,
      semanticIndex: semanticComposition.index,
      componentDocumentId: selectedDefinition.documentId,
    });
  }, [selectedDefinition, semanticComposition, workspace]);

  const documentNames = useMemo(
    () =>
      new Map(
        Object.values(workspace?.docsById ?? {}).map((document) => [
          document.id,
          document.name?.trim() ||
            document.path.split('/').at(-1) ||
            document.id,
        ])
      ),
    [workspace]
  );
  const dependencies = useMemo<readonly ComponentRelationshipItem[]>(
    () =>
      !workspace || !selectedDefinition
        ? []
        : selectedDefinition.dependencies.map((edge) => ({
            id: `${edge.sourceDocumentId}:${edge.instanceNodeId}:${edge.targetDocumentId}`,
            label:
              documentNames.get(edge.targetDocumentId) ?? edge.targetDocumentId,
            detail: `instance ${edge.instanceNodeId}`,
            ownerRef: {
              kind: 'document' as const,
              workspaceId: workspace.id,
              documentId: edge.targetDocumentId,
            },
          })),
    [documentNames, selectedDefinition, workspace]
  );
  const references = useMemo<readonly ComponentReferenceItem[]>(() => {
    if (
      semanticComposition?.status !== 'ready' ||
      impactResult?.status !== 'ready'
    ) {
      return [];
    }
    return impactResult.impact.directReferences.flatMap((reference) => {
      const edge = semanticComposition.index.getReference(
        reference.referenceId
      );
      if (!edge) return [];
      const target = semanticComposition.index.getSymbol(
        reference.targetSymbolId
      );
      return [
        {
          id: reference.referenceId,
          label: ownerLabel(edge.sourceRef),
          detail: `${reference.kind} → ${target?.displayName ?? target?.name ?? reference.targetSymbolId}`,
          kind: reference.kind,
          addressing: reference.addressing,
          ownerRef: edge.sourceRef,
        },
      ];
    });
  }, [impactResult, semanticComposition]);

  const selectDefinition = useCallback(
    (documentId: string) => {
      setUiSelectedDocumentId(documentId);
      setActiveDocumentId(documentId);
      setActionMessage(null);
    },
    [setActiveDocumentId]
  );
  const navigateOwner = useCallback(
    (ownerRef: DiagnosticTargetRef) => {
      if (!projectId) {
        setActionMessage('Project navigation is unavailable.');
        return;
      }
      const result = navigateToWorkspaceSemanticTarget({
        projectId,
        target: { kind: 'diagnostic-target', targetRef: ownerRef },
        navigate,
        resolveSemanticIndex: resolveWorkspaceSemanticIndex,
      });
      setActionMessage(
        result.status === 'navigated'
          ? `Opened ${ownerLabel(ownerRef)}.`
          : `Navigation unavailable: ${result.reason}.`
      );
    },
    [navigate, projectId]
  );
  const handleCreate = useCallback(
    async (input: { name: string; rootType: string }): Promise<boolean> => {
      setCreating(true);
      setActionMessage(null);
      try {
        const result = await createDefinition(input);
        setActionMessage(
          result.status === 'applied'
            ? `Created ${input.name}.`
            : result.message
        );
        return result.status === 'applied';
      } finally {
        setCreating(false);
      }
    },
    [createDefinition]
  );
  const handleSaveContract = useCallback(
    async (contract: PIRComponentContract): Promise<boolean> => {
      if (!selectedDefinition) return false;
      setSaving(true);
      setActionMessage(null);
      try {
        const result = await updateContract(
          selectedDefinition.documentId,
          contract
        );
        setActionMessage(
          result.status === 'applied'
            ? 'Component Contract saved.'
            : result.message
        );
        return result.status === 'applied';
      } finally {
        setSaving(false);
      }
    },
    [selectedDefinition, updateContract]
  );

  if (!workspace || !model) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-(--bg-canvas) p-8 text-(--text-primary)">
        <div className="max-w-sm space-y-2 text-center">
          <Boxes size={24} className="mx-auto text-(--text-muted)" />
          <h1 className="m-0 text-base font-semibold">Workspace unavailable</h1>
          <p className="m-0 text-xs leading-5 text-(--text-muted)">
            Load a project Workspace before opening Component authoring.
          </p>
        </div>
      </main>
    );
  }

  const semanticIssues =
    semanticComposition?.status === 'blocked' ? semanticComposition.issues : [];
  const selectedGraphIssues = selectedDefinition
    ? model.graphIssues.filter(
        (issue) =>
          issue.documentId === selectedDefinition.documentId ||
          issue.targetDocumentId === selectedDefinition.documentId
      )
    : [];

  return (
    <main className="flex min-h-screen flex-col bg-(--bg-canvas) text-(--text-primary)">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-(--border-subtle) px-6 py-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-2.5 text-(--text-secondary)">
            <Boxes size={19} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 text-xl font-semibold">Components</h1>
              <span className="rounded-full border border-(--border-subtle) px-2 py-0.5 font-mono text-[10px] text-(--text-muted)">
                Canonical PIR
              </span>
            </div>
            <p className="m-0 mt-1 text-sm text-(--text-secondary)">
              Reusable Definitions, public contracts, and revision-bound impact.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-(--text-muted)">
          <span className="rounded-full border border-(--border-subtle) px-3 py-1.5">
            Workspace r{workspace.workspaceRev}
          </span>
          <span className="rounded-full border border-(--border-subtle) px-3 py-1.5">
            {semanticComposition?.status === 'ready'
              ? 'Semantic index ready'
              : 'Semantic index blocked'}
          </span>
          {readonly && (
            <span className="rounded-full border border-(--border-subtle) px-3 py-1.5">
              Read-only
            </span>
          )}
        </div>
      </header>

      {actionMessage && (
        <div className="border-b border-(--border-subtle) bg-(--bg-panel) px-6 py-2 text-xs text-(--text-secondary)">
          {actionMessage}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <ComponentDefinitionList
          definitions={definitions}
          selectedDocumentId={selectedDocumentId}
          readonly={readonly}
          creating={creating}
          onSelect={selectDefinition}
          onCreate={handleCreate}
        />

        <div className="min-w-0 flex-1 overflow-auto p-6">
          {selectedDefinition ? (
            <div className="mx-auto max-w-[1480px] space-y-4">
              <nav className="flex items-center gap-1 rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-1">
                {(['canvas', 'contract'] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setActiveView(view)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${
                      activeView === view
                        ? 'bg-black text-white'
                        : 'text-(--text-secondary) hover:text-(--text-primary)'
                    }`}
                  >
                    {view}
                  </button>
                ))}
              </nav>

              {activeView === 'canvas' ? (
                <section className="flex min-h-[680px] overflow-hidden rounded-xl border border-(--border-subtle) bg-(--bg-panel)">
                  <BlueprintAuthoringSurface
                    entryDocumentId={selectedDefinition.documentId}
                    compactHeader
                  />
                </section>
              ) : (
                <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="min-w-0 space-y-4">
                    <section className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-panel) px-4 py-3">
                      <div>
                        <h2 className="m-0 text-sm font-semibold">
                          {selectedDefinition.name}
                        </h2>
                        <code className="mt-1 block text-[10px] text-(--text-muted)">
                          {selectedDefinition.documentId} ·{' '}
                          {selectedDefinition.path}
                        </code>
                      </div>
                      <div className="flex gap-2 text-[10px] text-(--text-muted)">
                        <span className="rounded-full border border-(--border-subtle) px-2 py-1">
                          {selectedDefinition.nodeCount} nodes
                        </span>
                        <span className="rounded-full border border-(--border-subtle) px-2 py-1">
                          {selectedDefinition.dependencies.length} dependencies
                        </span>
                      </div>
                    </section>

                    {selectedGraphIssues.length > 0 && (
                      <section className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) px-4 py-3">
                        <div className="flex items-center gap-2 text-xs font-medium">
                          <CircleAlert
                            size={14}
                            className="text-(--text-muted)"
                          />
                          {selectedGraphIssues.length} Component graph issue
                          {selectedGraphIssues.length === 1 ? '' : 's'}
                        </div>
                        <p className="m-0 mt-1 text-[11px] text-(--text-muted)">
                          {selectedGraphIssues[0]?.message}
                        </p>
                      </section>
                    )}

                    <ComponentContractEditor
                      definition={selectedDefinition}
                      readonly={readonly}
                      saving={saving}
                      onSave={handleSaveContract}
                    />
                  </div>

                  <ComponentRelationshipsPanel
                    dependencies={dependencies}
                    references={references}
                    impactResult={impactResult}
                    semanticIssues={semanticIssues}
                    onNavigateOwnerRef={navigateOwner}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-[440px] flex-col items-center justify-center gap-3 text-center">
              <Box size={26} className="text-(--text-muted)" />
              <div>
                <h2 className="m-0 text-sm font-semibold">
                  Create the first Definition
                </h2>
                <p className="m-0 mt-1 max-w-sm text-xs leading-5 text-(--text-muted)">
                  A Definition owns a normalized PIR graph and a stable public
                  contract. Create one to open its Canvas and Contract surface.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default ComponentAuthoringPage;
