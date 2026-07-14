import { useMemo, useState } from 'react';
import { Boxes, Plus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { createComponentSymbolId } from '@prodivix/authoring';
import { selectWorkspacePirDocument } from '@prodivix/workspace';
import { useWorkspaceComponentAuthoring } from '@/editor/features/component/controller/useWorkspaceComponentAuthoring';
import {
  navigateToWorkspaceSemanticTarget,
  resolveWorkspaceSemanticIndex,
} from '@/editor/navigation';

export const ComponentResourcePage = () => {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { workspace, readonly, model, createDefinition, insertInstance } =
    useWorkspaceComponentAuthoring();
  const [name, setName] = useState('New Component');
  const [rootType, setRootType] = useState('div');
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const activeDocument = useMemo(
    () =>
      selectWorkspacePirDocument(
        workspace ?? undefined,
        workspace?.activeDocumentId
      ),
    [workspace]
  );
  const insertionPlacement =
    activeDocument?.status === 'valid'
      ? {
          sourceDocumentId: activeDocument.document.id,
          placement: {
            parentId: activeDocument.decodedContent.ui.graph.rootId,
            index:
              activeDocument.decodedContent.ui.graph.childIdsById[
                activeDocument.decodedContent.ui.graph.rootId
              ]?.length ?? 0,
          },
        }
      : null;
  const openDefinition = (documentId: string) => {
    if (!projectId || !workspace) {
      setStatusMessage('The current Project route is unavailable.');
      return;
    }
    const result = navigateToWorkspaceSemanticTarget({
      projectId,
      navigate,
      preferredSurface: 'component',
      resolveSemanticIndex: resolveWorkspaceSemanticIndex,
      target: {
        kind: 'semantic-symbol',
        symbolId: createComponentSymbolId(workspace.id, documentId),
        destination: { kind: 'definition' },
      },
    });
    if (result.status === 'unavailable') {
      setStatusMessage(
        'The Component Definition is unavailable in this semantic revision.'
      );
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
        <div className="flex items-center gap-2">
          <Plus size={14} />
          <h2 className="text-sm font-semibold text-(--text-primary)">
            Create Definition
          </h2>
        </div>
        <p className="mt-2 text-xs text-(--text-secondary)">
          Creates one canonical PIR Component document through an atomic
          Workspace Transaction.
        </p>
        <label className="mt-4 block text-xs text-(--text-secondary)">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-black/12 bg-transparent px-3 py-2 text-sm text-(--text-primary) outline-none focus:border-black"
          />
        </label>
        <label className="mt-3 block text-xs text-(--text-secondary)">
          Root element
          <select
            value={rootType}
            onChange={(event) => setRootType(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-black/12 bg-transparent px-3 py-2 text-sm text-(--text-primary)"
          >
            {['div', 'section', 'article', 'button', 'span'].map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || readonly || !name.trim()}
          onClick={async () => {
            setBusy(true);
            setStatusMessage(null);
            const outcome = await createDefinition({ name, rootType });
            setBusy(false);
            setStatusMessage(
              outcome.status === 'applied'
                ? 'Component Definition created.'
                : outcome.message
            );
          }}
          className="mt-4 w-full rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
        >
          {busy ? 'Creating…' : 'Create Definition'}
        </button>
        {statusMessage ? (
          <p className="mt-3 text-xs text-(--text-secondary)">
            {statusMessage}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-black/8 bg-(--bg-canvas) p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Boxes size={14} />
            <h2 className="text-sm font-semibold text-(--text-primary)">
              Workspace Components
            </h2>
          </div>
          <span className="rounded-full bg-black/5 px-2 py-1 text-[10px] text-(--text-muted)">
            {model?.definitions.length ?? 0} definitions
          </span>
        </div>
        <div className="mt-4 divide-y divide-black/8">
          {model?.definitions.map((definition) => (
            <article
              key={definition.documentId}
              className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <button
                type="button"
                onClick={() => openDefinition(definition.documentId)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium text-(--text-primary)">
                  {definition.name}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[10px] text-(--text-muted)">
                  {definition.path}
                </span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openDefinition(definition.documentId)}
                  className="rounded-lg border border-black/10 px-2.5 py-1.5 text-[10px] text-(--text-secondary)"
                >
                  Open Definition
                </button>
                <button
                  type="button"
                  disabled={!insertionPlacement || readonly}
                  onClick={async () => {
                    if (!insertionPlacement) return;
                    setStatusMessage(null);
                    const outcome = await insertInstance({
                      ...insertionPlacement,
                      componentDocumentId: definition.documentId,
                    });
                    setStatusMessage(
                      outcome.status === 'applied'
                        ? `Inserted ${definition.name} into the active document.`
                        : outcome.message
                    );
                  }}
                  className="rounded-lg bg-black px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-35"
                >
                  Insert Instance
                </button>
              </div>
            </article>
          ))}
          {model?.definitions.length === 0 ? (
            <p className="py-8 text-center text-xs text-(--text-muted)">
              No canonical Component Definitions yet.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
};
