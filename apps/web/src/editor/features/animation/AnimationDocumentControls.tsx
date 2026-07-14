import { Plus } from 'lucide-react';

export type AnimationDocumentOption = Readonly<{
  id: string;
  label: string;
  valid: boolean;
}>;

export type AnimationTargetOption = Readonly<{
  id: string;
  label: string;
}>;

type AnimationDocumentControlsProps = Readonly<{
  documents: readonly AnimationDocumentOption[];
  selectedDocumentId?: string;
  targets: readonly AnimationTargetOption[];
  targetDocumentId: string;
  creating: boolean;
  readonly: boolean;
  error?: string;
  onSelectDocument: (documentId: string) => void;
  onSelectTarget: (documentId: string) => void;
  onCreate: () => void;
}>;

export const AnimationDocumentControls = ({
  documents,
  selectedDocumentId,
  targets,
  targetDocumentId,
  creating,
  readonly,
  error,
  onSelectDocument,
  onSelectTarget,
  onCreate,
}: AnimationDocumentControlsProps) => (
  <div className="flex min-w-0 items-center gap-2">
    <select
      aria-label="Animation document"
      value={selectedDocumentId ?? ''}
      onChange={(event) => onSelectDocument(event.target.value)}
      disabled={!documents.length}
      className="h-7 max-w-56 min-w-40 rounded-md border border-black/10 bg-white px-2 text-xs text-(--text-secondary) outline-none focus:border-black/25 disabled:opacity-50"
    >
      {!documents.length ? (
        <option value="">No animation documents</option>
      ) : null}
      {documents.map((document) => (
        <option key={document.id} value={document.id}>
          {document.label}
          {document.valid ? '' : ' (invalid)'}
        </option>
      ))}
    </select>

    <select
      aria-label="Animation target document"
      value={targetDocumentId}
      onChange={(event) => onSelectTarget(event.target.value)}
      disabled={!targets.length || creating || readonly}
      className="h-7 max-w-52 min-w-36 rounded-md border border-black/10 bg-white px-2 text-xs text-(--text-secondary) outline-none focus:border-black/25 disabled:opacity-50"
    >
      {!targets.length ? <option value="">No PIR target</option> : null}
      {targets.map((target) => (
        <option key={target.id} value={target.id}>
          {target.label}
        </option>
      ))}
    </select>

    <button
      type="button"
      onClick={onCreate}
      disabled={!targetDocumentId || creating || readonly}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-black px-2.5 text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35"
    >
      <Plus size={12} />
      {creating ? 'Creating…' : 'New animation'}
    </button>

    {error ? (
      <span className="max-w-56 truncate text-xs text-red-600" title={error}>
        {error}
      </span>
    ) : null}
  </div>
);
