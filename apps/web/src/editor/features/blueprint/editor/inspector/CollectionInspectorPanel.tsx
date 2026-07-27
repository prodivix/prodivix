import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, CircleAlert } from 'lucide-react';
import type {
  DataOperationInputBinding,
  DataOperationReference,
} from '@prodivix/data';
import {
  PIR_COLLECTION_PREVIEW_STATES,
  type PIRCollectionKeyBinding,
  type PIRCollectionPreviewInput,
  type PIRCollectionPreviewState,
  type PIRCollectionSourceBinding,
  type PIRDataQueryActivation,
  type PIRJsonValue,
} from '@prodivix/pir';
import type {
  CollectionInspectorBindingCandidate,
  CollectionInspectorDataOperationCandidate,
  CollectionInspectorModel,
  CollectionInspectorRegionName,
  CollectionInspectorSymbolRole,
} from './domain/collectionInspectorModel';
import { useFocusGuardedDraft } from '@/editor/drafts/useFocusGuardedDraft';

export type CollectionInspectorRegionNavigation = Readonly<{
  documentId: string;
  collectionNodeId: string;
  regionName: CollectionInspectorRegionName;
  nodeIds: readonly string[];
}>;

export type CollectionInspectorPanelProps = Readonly<{
  model: CollectionInspectorModel;
  preview: PIRCollectionPreviewInput;
  disabled?: boolean;
  onSourceChange: (source: PIRCollectionSourceBinding) => void;
  onDataOperationChange: (binding: {
    dataId: string;
    operation: DataOperationReference;
    idle: 'loading' | 'empty';
    path?: string;
    input?: DataOperationInputBinding;
    activations?: readonly PIRDataQueryActivation[];
  }) => void;
  onKeyChange: (key: PIRCollectionKeyBinding) => void;
  onSymbolNameChange: (
    role: Extract<CollectionInspectorSymbolRole, 'item' | 'index'>,
    name: string
  ) => void;
  onPreviewChange: (preview: PIRCollectionPreviewInput) => void;
  onRegionNavigate: (navigation: CollectionInspectorRegionNavigation) => void;
}>;

const controlClassName =
  'min-h-7 w-full rounded-md border border-(--border-default) bg-(--bg-canvas) px-2 text-[11px] text-(--text-primary) outline-none transition-colors focus:border-(--border-strong) disabled:cursor-not-allowed disabled:opacity-50';

const bindingIdentity = (
  binding: CollectionInspectorBindingCandidate['binding']
): string => JSON.stringify(binding);

const currentCandidateId = (
  candidates: readonly CollectionInspectorBindingCandidate[],
  currentBinding: CollectionInspectorBindingCandidate['binding']
): string =>
  candidates.find(
    ({ binding }) =>
      bindingIdentity(binding) === bindingIdentity(currentBinding)
  )?.id ?? '';

const candidateLabel = (
  candidate: CollectionInspectorBindingCandidate
): string => {
  const locality = candidate.local ? 'Local · ' : '';
  const type = candidate.typeRef ? ` · ${candidate.typeRef}` : '';
  return `${locality}${candidate.label}${type}`;
};

const operationIdentity = (operation: DataOperationReference): string =>
  `${operation.documentId}\u0000${operation.operationId}`;

const currentOperationCandidateId = (
  candidates: readonly CollectionInspectorDataOperationCandidate[],
  operation: DataOperationReference | undefined
): string =>
  operation
    ? (candidates.find(
        (candidate) =>
          operationIdentity(candidate.reference) ===
          operationIdentity(operation)
      )?.id ?? '')
    : '';

const createCollectionDataId = (model: CollectionInspectorModel): string => {
  const current = model.dataOperation.binding?.dataId;
  if (current) return current;
  const base = `${model.collection.id.replace(/[^A-Za-z0-9._:-]/g, '-')}-data`;
  const existing = model.document.logic?.dataById ?? {};
  if (!Object.hasOwn(existing, base)) return base;
  let suffix = 2;
  while (Object.hasOwn(existing, `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

function InspectorField({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <label className="grid grid-cols-[78px_minmax(0,1fr)] items-center gap-2 text-[10px] text-(--text-muted)">
      <span>{label}</span>
      <span className="min-w-0">{children}</span>
    </label>
  );
}

function BindingCandidateSelect({
  candidates,
  value,
  disabled,
  unavailableLabel,
  onChange,
}: Readonly<{
  candidates: readonly CollectionInspectorBindingCandidate[];
  value: string;
  disabled: boolean;
  unavailableLabel: string;
  onChange: (candidate: CollectionInspectorBindingCandidate) => void;
}>) {
  return (
    <select
      className={controlClassName}
      value={value}
      disabled={disabled || candidates.length === 0}
      onChange={(event) => {
        const candidate = candidates.find(
          ({ id }) => id === event.currentTarget.value
        );
        if (candidate) onChange(candidate);
      }}
    >
      {value ? null : <option value="">{unavailableLabel}</option>}
      {candidates.map((candidate) => (
        <option key={candidate.id} value={candidate.id}>
          {candidateLabel(candidate)}
        </option>
      ))}
    </select>
  );
}

const readonlyMessage = (reason: 'code-owned' | 'complex-binding'): string =>
  reason === 'code-owned'
    ? 'This CodeReference is owned by the shared Code Authoring Environment.'
    : 'This binding has structured value or path semantics and is read-only here.';

/**
 * Renders the Collection-specific Inspector surface. Every edit is emitted as
 * a typed value; the composition root remains responsible for planning and
 * applying the corresponding Workspace Command or Transaction.
 */
export function CollectionInspectorPanel({
  model,
  preview,
  disabled = false,
  onSourceChange,
  onDataOperationChange,
  onKeyChange,
  onSymbolNameChange,
  onPreviewChange,
  onRegionNavigate,
}: CollectionInspectorPanelProps) {
  const sourceCandidates = model.candidateScopes.source.candidates;
  const keyCandidates = model.candidateScopes.key.candidates;
  const operationBinding = model.dataOperation.binding;
  const operationCandidates = model.dataOperation.candidates;
  const sourceMode = operationBinding ? 'data-operation' : model.source.kind;
  const literalSourceText = useMemo(
    () =>
      model.source.kind === 'literal'
        ? JSON.stringify(model.source.value, null, 2)
        : '[]',
    [model.source]
  );
  const [literalDraft, setLiteralDraft] = useState(literalSourceText);
  const [literalError, setLiteralError] = useState<string>();
  const [resultPathDraft, setResultPathDraft] = useState(
    operationBinding?.path ?? ''
  );
  const operationInputText = JSON.stringify(
    operationBinding?.input ?? { kind: 'literal', value: {} },
    null,
    2
  );
  const [operationInputDraft, setOperationInputDraft] =
    useState(operationInputText);
  const [operationInputError, setOperationInputError] = useState<string>();

  const literalEditing = useFocusGuardedDraft(literalSourceText, (text) => {
    setLiteralDraft(text);
    setLiteralError(undefined);
  });

  useEffect(() => {
    setResultPathDraft(operationBinding?.path ?? '');
  }, [operationBinding?.dataId, operationBinding?.path]);

  useEffect(() => {
    setOperationInputDraft(operationInputText);
    setOperationInputError(undefined);
  }, [operationInputText]);

  const sourceCandidateId =
    model.source.kind === 'binding'
      ? currentCandidateId(sourceCandidates, model.source.binding)
      : '';
  const keyCandidateId =
    model.key.kind === 'binding'
      ? currentCandidateId(keyCandidates, model.key.binding)
      : '';
  const sourceReadOnly =
    disabled ||
    (sourceMode !== 'data-operation' &&
      model.source.kind === 'binding' &&
      model.source.readOnly);
  const keyReadOnly =
    disabled || (model.key.kind === 'binding' && model.key.readOnly);

  const changeSourceMode = (kind: 'literal' | 'binding' | 'data-operation') => {
    if (kind === sourceMode) return;
    if (kind === 'literal') {
      onSourceChange({ kind: 'literal', value: [] });
      return;
    }
    if (kind === 'data-operation') {
      const candidate = operationCandidates[0];
      if (candidate) {
        onDataOperationChange({
          dataId: createCollectionDataId(model),
          operation: candidate.reference,
          idle: 'loading',
          input: { kind: 'literal', value: {} },
          activations: [{ kind: 'document' }],
        });
      }
      return;
    }
    const candidate = sourceCandidates[0];
    if (candidate)
      onSourceChange({ kind: 'binding', value: candidate.binding });
  };

  const updateDataOperation = (
    next: Partial<{
      operation: DataOperationReference;
      idle: 'loading' | 'empty';
      path: string;
      input: DataOperationInputBinding;
      activations: readonly PIRDataQueryActivation[];
    }>
  ) => {
    if (!operationBinding) return;
    const path = (next.path ?? operationBinding.path)?.trim();
    onDataOperationChange({
      dataId: operationBinding.dataId,
      operation: next.operation ?? operationBinding.operation,
      idle: next.idle ?? operationBinding.idle,
      ...((next.input ?? operationBinding.input)
        ? { input: next.input ?? operationBinding.input }
        : {}),
      ...((next.activations ?? operationBinding.activations)
        ? {
            activations: next.activations ?? operationBinding.activations ?? [],
          }
        : {}),
      ...(path ? { path } : {}),
    });
  };

  const commitResultPath = () => {
    const nextPath = resultPathDraft.trim();
    if (nextPath === (operationBinding?.path ?? '')) return;
    updateDataOperation({ path: nextPath });
  };

  const commitOperationInput = () => {
    try {
      const parsed = JSON.parse(
        operationInputDraft
      ) as DataOperationInputBinding;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new TypeError();
      setOperationInputError(undefined);
      updateDataOperation({ input: parsed });
    } catch {
      setOperationInputError('Enter a valid typed Data input binding.');
    }
  };

  const toggleDocumentActivation = (enabled: boolean) => {
    const current = operationBinding?.activations ?? [];
    updateDataOperation({
      activations: enabled
        ? [
            ...current.filter(({ kind }) => kind !== 'document'),
            { kind: 'document' },
          ]
        : current.filter(({ kind }) => kind !== 'document'),
    });
  };

  const changeKeyMode = (kind: 'index' | 'binding') => {
    if (kind === model.key.kind) return;
    if (kind === 'index') {
      onKeyChange({ kind: 'index' });
      return;
    }
    const candidate = keyCandidates[0];
    if (candidate) onKeyChange({ kind: 'binding', value: candidate.binding });
  };

  const changeLiteralSource = (next: string) => {
    setLiteralDraft(next);
    try {
      const parsed: unknown = JSON.parse(next);
      if (!Array.isArray(parsed)) {
        setLiteralError('Literal source must be a JSON array.');
        return;
      }
      setLiteralError(undefined);
      onSourceChange({
        kind: 'literal',
        value: parsed as readonly PIRJsonValue[],
      });
    } catch {
      setLiteralError('Enter valid JSON before applying the source.');
    }
  };

  const changePreview = (state: PIRCollectionPreviewState) => {
    onPreviewChange({
      state,
      ...(state === 'error' && preview.errorValue !== undefined
        ? { errorValue: preview.errorValue }
        : {}),
    });
  };

  return (
    <section className="CollectionInspectorPanel flex flex-col gap-3 px-3 py-3 text-(--text-primary)">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="m-0 text-[11px] font-medium">Collection</h3>
          <p className="m-0 mt-0.5 truncate font-mono text-[9px] text-(--text-muted)">
            {model.collection.id}
          </p>
        </div>
        <span className="rounded-full border border-(--border-default) px-2 py-0.5 text-[9px] text-(--text-muted)">
          {model.source.kind === 'literal'
            ? `${model.source.itemCount} items`
            : sourceMode === 'data-operation'
              ? 'Data operation'
              : 'Bound source'}
        </span>
      </header>

      <div className="flex flex-col gap-2 rounded-lg border border-(--border-default) bg-(--bg-raised) p-2.5">
        <div className="text-[10px] font-medium">Data</div>
        <InspectorField label="Source">
          <select
            className={controlClassName}
            value={sourceMode}
            disabled={sourceReadOnly}
            onChange={(event) =>
              changeSourceMode(
                event.currentTarget.value as
                  'literal' | 'binding' | 'data-operation'
              )
            }
          >
            <option value="literal">Literal</option>
            <option value="binding" disabled={sourceCandidates.length === 0}>
              Symbol
            </option>
            <option
              value="data-operation"
              disabled={
                operationCandidates.length === 0 &&
                operationBinding === undefined
              }
            >
              Data operation
            </option>
          </select>
        </InspectorField>
        {sourceMode === 'literal' && model.source.kind === 'literal' ? (
          <label className="flex flex-col gap-1 text-[10px] text-(--text-muted)">
            <span>Literal items</span>
            <textarea
              className={`${controlClassName} min-h-20 resize-y py-1.5 font-mono leading-4`}
              value={literalDraft}
              disabled={disabled}
              spellCheck={false}
              onFocus={literalEditing.beginEditing}
              onBlur={literalEditing.endEditing}
              onChange={(event) =>
                changeLiteralSource(event.currentTarget.value)
              }
            />
            {literalError ? (
              <span className="flex items-center gap-1 text-[9px] text-(--danger-default)">
                <CircleAlert size={10} />
                {literalError}
              </span>
            ) : null}
          </label>
        ) : sourceMode === 'binding' && model.source.kind === 'binding' ? (
          <>
            <InspectorField label="Symbol">
              <BindingCandidateSelect
                candidates={sourceCandidates}
                value={sourceCandidateId}
                disabled={sourceReadOnly}
                unavailableLabel={model.source.label}
                onChange={(candidate) =>
                  onSourceChange({ kind: 'binding', value: candidate.binding })
                }
              />
            </InspectorField>
            {model.source.readOnlyReason ? (
              <p className="m-0 text-[9px] leading-4 text-(--text-muted)">
                {readonlyMessage(model.source.readOnlyReason)}
              </p>
            ) : null}
          </>
        ) : operationBinding ? (
          <>
            <InspectorField label="Operation">
              <select
                className={controlClassName}
                value={currentOperationCandidateId(
                  operationCandidates,
                  operationBinding.operation
                )}
                disabled={disabled || operationCandidates.length === 0}
                onChange={(event) => {
                  const candidate = operationCandidates.find(
                    ({ id }) => id === event.currentTarget.value
                  );
                  if (candidate)
                    updateDataOperation({ operation: candidate.reference });
                }}
              >
                {currentOperationCandidateId(
                  operationCandidates,
                  operationBinding.operation
                ) ? null : (
                  <option value="">
                    {operationBinding.operation.documentId} ·{' '}
                    {operationBinding.operation.operationId}
                  </option>
                )}
                {operationCandidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label} · {candidate.detail}
                  </option>
                ))}
              </select>
            </InspectorField>
            <InspectorField label="Local data">
              <code className="block truncate rounded-md border border-(--border-default) bg-(--bg-canvas) px-2 py-1.5 text-[10px] text-(--text-secondary)">
                {operationBinding.dataId}
              </code>
            </InspectorField>
            <InspectorField label="Result path">
              <input
                className={controlClassName}
                value={resultPathDraft}
                disabled={disabled}
                placeholder="Array root"
                onChange={(event) =>
                  setResultPathDraft(event.currentTarget.value)
                }
                onBlur={commitResultPath}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur();
                  }
                }}
              />
            </InspectorField>
            <InspectorField label="Idle state">
              <select
                className={controlClassName}
                value={operationBinding.idle}
                disabled={disabled}
                onChange={(event) =>
                  updateDataOperation({
                    idle: event.currentTarget.value as 'loading' | 'empty',
                  })
                }
              >
                <option value="loading">Loading</option>
                <option value="empty">Empty</option>
              </select>
            </InspectorField>
            <InspectorField label="Auto run">
              <label className="inline-flex items-center gap-2 text-[10px] text-(--text-secondary)">
                <input
                  type="checkbox"
                  checked={Boolean(
                    operationBinding.activations?.some(
                      ({ kind }) => kind === 'document'
                    )
                  )}
                  disabled={disabled}
                  onChange={(event) =>
                    toggleDocumentActivation(event.currentTarget.checked)
                  }
                />
                On document instance
              </label>
            </InspectorField>
            <label className="flex flex-col gap-1 text-[10px] text-(--text-muted)">
              <span>Typed input mapping</span>
              <textarea
                className={`${controlClassName} min-h-24 resize-y py-1.5 font-mono leading-4`}
                value={operationInputDraft}
                disabled={disabled}
                spellCheck={false}
                onChange={(event) =>
                  setOperationInputDraft(event.currentTarget.value)
                }
                onBlur={commitOperationInput}
              />
              {operationInputError ? (
                <span className="flex items-center gap-1 text-[9px] text-(--danger-default)">
                  <CircleAlert size={10} />
                  {operationInputError}
                </span>
              ) : null}
            </label>
            <p className="m-0 text-[9px] leading-4 text-(--text-muted)">
              Runtime status maps to loading, item, empty, and error regions;
              success never infers empty from the result shape.
            </p>
          </>
        ) : null}

        <InspectorField label="Key">
          <select
            className={controlClassName}
            value={model.key.kind}
            disabled={keyReadOnly}
            onChange={(event) =>
              changeKeyMode(event.currentTarget.value as 'index' | 'binding')
            }
          >
            <option value="index">Index</option>
            <option value="binding" disabled={keyCandidates.length === 0}>
              Symbol
            </option>
          </select>
        </InspectorField>
        {model.key.kind === 'binding' ? (
          <>
            <InspectorField label="Key symbol">
              <BindingCandidateSelect
                candidates={keyCandidates}
                value={keyCandidateId}
                disabled={keyReadOnly}
                unavailableLabel={model.key.label}
                onChange={(candidate) =>
                  onKeyChange({ kind: 'binding', value: candidate.binding })
                }
              />
            </InspectorField>
            {model.key.readOnlyReason ? (
              <p className="m-0 text-[9px] leading-4 text-(--text-muted)">
                {readonlyMessage(model.key.readOnlyReason)}
              </p>
            ) : null}
          </>
        ) : null}
        {model.semanticStatus.status === 'unavailable' ? (
          <p className="m-0 text-[9px] leading-4 text-(--text-muted)">
            Symbol choices are unavailable for the current semantic snapshot.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-(--border-default) p-2.5">
        <div className="text-[10px] font-medium">Symbols</div>
        {([model.symbols.item, model.symbols.index] as const).map((symbol) => (
          <InspectorField
            key={symbol.role}
            label={symbol.role === 'item' ? 'Item' : 'Index'}
          >
            <input
              className={controlClassName}
              value={symbol.name}
              disabled={disabled}
              onChange={(event) =>
                onSymbolNameChange(symbol.role, event.currentTarget.value)
              }
            />
          </InspectorField>
        ))}
        {model.symbols.error ? (
          <InspectorField label="Error">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5">
              <input
                className={controlClassName}
                value={model.symbols.error.name}
                disabled
                readOnly
              />
              <span
                className="max-w-24 truncate font-mono text-[9px] text-(--text-muted)"
                title={model.symbols.error.id}
              >
                {model.symbols.error.id}
              </span>
            </div>
          </InspectorField>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-(--border-default) p-2.5">
        <InspectorField label="Preview">
          <select
            className={controlClassName}
            value={preview.state}
            onChange={(event) =>
              changePreview(
                event.currentTarget.value as PIRCollectionPreviewState
              )
            }
          >
            {PIR_COLLECTION_PREVIEW_STATES.map((state) => (
              <option key={state} value={state}>
                {state === 'auto'
                  ? 'Auto'
                  : `${state[0]!.toUpperCase()}${state.slice(1)}`}
              </option>
            ))}
          </select>
        </InspectorField>

        <div className="grid grid-cols-2 gap-1.5">
          {Object.values(model.regions).map((region) => {
            const active = preview.state === region.name;
            return (
              <button
                key={region.name}
                type="button"
                className={`flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                  active
                    ? 'border-(--border-strong) bg-(--bg-raised)'
                    : 'border-(--border-default) hover:bg-(--bg-raised)'
                }`}
                onClick={() =>
                  onRegionNavigate({
                    documentId: model.location.documentId,
                    collectionNodeId: model.collection.id,
                    regionName: region.name,
                    nodeIds: region.nodeIds,
                  })
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[10px] font-medium capitalize">
                    {region.name}
                  </span>
                  <span className="block truncate text-[9px] text-(--text-muted)">
                    {region.count === 0
                      ? 'Empty region'
                      : `${region.count} ${region.count === 1 ? 'node' : 'nodes'}`}
                  </span>
                </span>
                <ChevronRight
                  size={12}
                  className="shrink-0 text-(--text-muted)"
                />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
