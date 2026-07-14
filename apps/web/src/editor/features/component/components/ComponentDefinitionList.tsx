import { useState, type FormEvent } from 'react';
import { Box, Plus } from 'lucide-react';
import type { WorkspaceComponentDefinitionSummary } from '@/editor/features/component/model/workspaceComponentAuthoringModel';

export type ComponentDefinitionListProps = Readonly<{
  definitions: readonly WorkspaceComponentDefinitionSummary[];
  selectedDocumentId: string | null;
  readonly: boolean;
  creating: boolean;
  onSelect: (documentId: string) => void;
  onCreate: (input: { name: string; rootType: string }) => Promise<boolean>;
}>;

const contractMemberCount = (
  definition: WorkspaceComponentDefinitionSummary
): number =>
  Object.keys(definition.contract.propsById).length +
  Object.keys(definition.contract.eventsById).length +
  Object.keys(definition.contract.slotsById).length +
  Object.keys(definition.contract.variantAxesById).length;

export function ComponentDefinitionList({
  definitions,
  selectedDocumentId,
  readonly,
  creating,
  onSelect,
  onCreate,
}: ComponentDefinitionListProps) {
  const [name, setName] = useState('');
  const [rootType, setRootType] = useState('div');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || creating || readonly) return;
    const applied = await onCreate({ name: name.trim(), rootType });
    if (applied) {
      setName('');
      setRootType('div');
    }
  };

  return (
    <aside className="flex min-h-0 w-[300px] shrink-0 flex-col border-r border-(--border-subtle) bg-(--bg-panel)">
      <div className="border-b border-(--border-subtle) px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-sm font-semibold">Definitions</h2>
            <p className="m-0 mt-1 text-xs text-(--text-muted)">
              {definitions.length} reusable component
              {definitions.length === 1 ? '' : 's'}
            </p>
          </div>
          <Box size={17} className="text-(--text-muted)" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {definitions.length > 0 ? (
          <ul className="m-0 list-none space-y-1 p-0">
            {definitions.map((definition) => {
              const selected = definition.documentId === selectedDocumentId;
              return (
                <li key={definition.documentId}>
                  <button
                    type="button"
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? 'border-(--border-strong) bg-(--bg-raised)'
                        : 'border-transparent bg-transparent hover:border-(--border-subtle) hover:bg-(--bg-raised)'
                    }`}
                    aria-pressed={selected}
                    onClick={() => onSelect(definition.documentId)}
                  >
                    <span className="block truncate text-sm font-medium text-(--text-primary)">
                      {definition.name}
                    </span>
                    <span className="mt-1 block truncate font-mono text-[10px] text-(--text-muted)">
                      {definition.path}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-(--text-secondary)">
                      <span className="rounded-full border border-(--border-subtle) px-2 py-0.5">
                        {definition.nodeCount} nodes
                      </span>
                      <span className="rounded-full border border-(--border-subtle) px-2 py-0.5">
                        {contractMemberCount(definition)} contract members
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-4 text-center">
            <Box size={20} className="text-(--text-muted)" />
            <p className="m-0 text-xs font-medium">No Component Definition</p>
            <p className="m-0 text-[11px] leading-5 text-(--text-muted)">
              Create a canonical PIR Definition to establish a reusable public
              contract.
            </p>
          </div>
        )}
      </div>

      <form
        className="space-y-2 border-t border-(--border-subtle) p-3"
        onSubmit={submit}
      >
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold tracking-wide text-(--text-muted) uppercase">
            New definition
          </span>
          <input
            value={name}
            placeholder="Component name"
            className="w-full rounded-lg border border-(--border-subtle) bg-(--bg-canvas) px-3 py-2 text-xs text-(--text-primary) outline-none focus:border-(--border-strong)"
            disabled={readonly || creating}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <div className="flex gap-2">
          <input
            value={rootType}
            aria-label="Root element type"
            title="Root element type"
            className="min-w-0 flex-1 rounded-lg border border-(--border-subtle) bg-(--bg-canvas) px-3 py-2 font-mono text-xs text-(--text-primary) outline-none focus:border-(--border-strong)"
            disabled={readonly || creating}
            onChange={(event) => setRootType(event.target.value)}
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-lg border border-(--border-strong) bg-(--text-primary) px-3 py-2 text-xs font-medium text-(--bg-canvas) disabled:cursor-not-allowed disabled:opacity-40"
            disabled={readonly || creating || !name.trim()}
          >
            <Plus size={13} />
            {creating ? 'Creating' : 'Create'}
          </button>
        </div>
      </form>
    </aside>
  );
}
