import { useState, type FormEvent } from 'react';
import { Braces, LoaderCircle, Network, Plus } from 'lucide-react';
import { PdxSelect, PdxTooltip } from '@prodivix/ui';
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
    <aside className="flex min-h-0 w-[280px] shrink-0 flex-col border-r border-(--border-subtle) bg-(--bg-panel)">
      <div className="flex h-11 items-center gap-2 border-b border-(--border-subtle) px-3">
        <h2 className="m-0 text-xs font-semibold">Definitions</h2>
        <span
          className="rounded-full bg-(--bg-raised) px-1.5 py-0.5 text-[10px] text-(--text-muted) tabular-nums"
          aria-label={`${definitions.length} definitions`}
          title={`${definitions.length} definitions`}
        >
          {definitions.length}
        </span>
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
                    <span className="mt-2 flex items-center gap-2 text-[10px] text-(--text-muted) tabular-nums">
                      <span
                        className="inline-flex items-center gap-1"
                        aria-label={`${definition.nodeCount} nodes`}
                        title={`${definition.nodeCount} nodes`}
                      >
                        <Network size={11} aria-hidden="true" />
                        {definition.nodeCount}
                      </span>
                      <span
                        className="inline-flex items-center gap-1"
                        aria-label={`${contractMemberCount(definition)} contract members`}
                        title={`${contractMemberCount(definition)} contract members`}
                      >
                        <Braces size={11} aria-hidden="true" />
                        {contractMemberCount(definition)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <form
        className="flex items-center gap-1.5 border-t border-(--border-subtle) p-2"
        onSubmit={submit}
      >
        <input
          value={name}
          aria-label="Component name"
          placeholder="Component name"
          className="min-w-0 flex-1 rounded-md border border-(--border-subtle) bg-(--bg-canvas) px-2.5 py-1.5 text-xs text-(--text-primary) outline-none focus:border-(--border-strong)"
          disabled={readonly || creating}
          onChange={(event) => setName(event.target.value)}
        />
        <PdxSelect
          aria-label="Root element type"
          title="Root element type"
          controlClassName="font-mono!"
          disabled={readonly || creating}
          options={['div', 'section', 'article', 'button', 'span'].map(
            (type) => ({ label: type, value: type })
          )}
          size="ExtraSmall"
          style={{ flex: '0 0 82px', width: 82 }}
          value={rootType}
          onValueChange={setRootType}
        />
        <PdxTooltip
          content={creating ? 'Creating definition' : 'Create definition'}
        >
          <button
            type="submit"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-(--border-strong) bg-(--text-primary) text-(--bg-canvas) transition-colors hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-35"
            disabled={readonly || creating || !name.trim()}
            aria-label={creating ? 'Creating definition' : 'Create definition'}
            aria-busy={creating || undefined}
            title={creating ? 'Creating definition' : 'Create definition'}
          >
            {creating ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
          </button>
        </PdxTooltip>
      </form>
    </aside>
  );
}
