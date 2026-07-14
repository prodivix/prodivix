import { useEffect, useState, type ReactNode } from 'react';
import { Boxes, Code2, ExternalLink, Search } from 'lucide-react';
import type { PIRJsonValue } from '@prodivix/pir';
import {
  clearComponentInstancePropBinding,
  setComponentInstanceLiteralPropBinding,
  setComponentInstanceVariantBinding,
  type ComponentInstanceBindingsUpdate,
  type ComponentInstanceInspectorDiagnostic,
  type ComponentInstanceInspectorProjection,
  type ComponentInstanceInspectorProp,
  type ComponentInstanceInspectorReadyModel,
} from '@/editor/features/blueprint/editor/inspector/domain/componentInstanceInspectorModel';

export type ComponentInstanceInspectorPanelProps = Readonly<{
  model: ComponentInstanceInspectorProjection;
  disabled?: boolean;
  onUpdateBindings: (
    update: ComponentInstanceBindingsUpdate
  ) => void | Promise<void>;
  onOpenDefinition: (documentId: string) => void | Promise<void>;
  onFindReferences: (documentId: string) => void | Promise<void>;
  onOpenCodeArtifact: (artifactId: string) => void | Promise<void>;
  onOpenCodeSlotDefinition: (slotId: string) => void | Promise<void>;
}>;

const actionClassName =
  'inline-flex h-7 items-center gap-1 rounded-md border border-(--border-subtle) bg-transparent px-2 text-[10px] text-(--text-secondary) hover:bg-(--bg-raised) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-40';
const fieldClassName =
  'min-h-7 w-full rounded-md border border-(--border-default) bg-(--bg-canvas) px-2 py-1 text-[11px] text-(--text-primary) outline-none focus:border-(--border-strong) disabled:cursor-not-allowed disabled:opacity-50';

const isPirJsonValue = (value: unknown): value is PIRJsonValue => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPirJsonValue);
  if (typeof value !== 'object') return false;
  return Object.values(value).every(isPirJsonValue);
};

const defaultLiteralValue = (
  member: ComponentInstanceInspectorProp
): PIRJsonValue => {
  if (member.defaultValue !== undefined) return member.defaultValue;
  const typeRef = member.typeRef.toLowerCase();
  if (typeRef.includes('boolean') || typeRef === 'bool') return false;
  if (
    typeRef.includes('number') ||
    typeRef.includes('integer') ||
    typeRef.includes('float')
  ) {
    return 0;
  }
  if (typeRef.includes('array') || typeRef.endsWith('[]')) return [];
  if (typeRef.includes('object') || typeRef.includes('record')) return {};
  if (typeRef === 'null') return null;
  return '';
};

function Diagnostics({
  diagnostics,
  compact = false,
}: Readonly<{
  diagnostics: readonly ComponentInstanceInspectorDiagnostic[];
  compact?: boolean;
}>) {
  if (diagnostics.length === 0) return null;
  return (
    <div
      role={compact ? undefined : 'alert'}
      className={
        compact
          ? 'grid gap-0.5 text-[9px] text-(--text-muted)'
          : 'grid gap-1 border-b border-(--border-default) bg-(--bg-raised) px-3 py-2 text-[10px] text-(--text-secondary)'
      }
    >
      {diagnostics.map((diagnostic) => (
        <p key={`${diagnostic.code}:${diagnostic.path}`} className="m-0">
          <span className="mr-1 font-medium">[{diagnostic.code}]</span>
          {diagnostic.message}
        </p>
      ))}
    </div>
  );
}

function PanelSection({
  title,
  count,
  children,
}: Readonly<{ title: string; count: number; children: ReactNode }>) {
  return (
    <section className="border-b border-(--border-subtle) px-3 py-3 last:border-b-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="m-0 text-[11px] font-medium text-(--text-primary)">
          {title}
        </h4>
        <span className="rounded bg-(--bg-raised) px-1.5 py-0.5 text-[9px] text-(--text-muted)">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function JsonLiteralEditor({
  value,
  disabled,
  onCommit,
}: Readonly<{
  value: PIRJsonValue;
  disabled: boolean;
  onCommit: (value: PIRJsonValue) => void;
}>) {
  const serialized = JSON.stringify(value, null, 2);
  const [draft, setDraft] = useState(serialized);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(serialized);
    setError('');
  }, [serialized]);

  const commit = () => {
    try {
      const parsed: unknown = JSON.parse(draft);
      if (!isPirJsonValue(parsed)) throw new Error('Unsupported JSON value.');
      setError('');
      onCommit(parsed);
    } catch {
      setError('Enter a valid JSON value.');
    }
  };

  return (
    <div className="grid gap-1">
      <textarea
        value={draft}
        rows={3}
        disabled={disabled}
        className={`${fieldClassName} resize-y font-mono`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
      />
      {error ? (
        <span role="alert" className="text-[9px] text-red-600">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function LiteralPropEditor({
  model,
  member,
  disabled,
  onUpdateBindings,
  onOpenCodeArtifact,
}: Readonly<{
  model: ComponentInstanceInspectorReadyModel;
  member: ComponentInstanceInspectorProp;
  disabled: boolean;
  onUpdateBindings: ComponentInstanceInspectorPanelProps['onUpdateBindings'];
  onOpenCodeArtifact: ComponentInstanceInspectorPanelProps['onOpenCodeArtifact'];
}>) {
  const publishLiteral = (value: PIRJsonValue) => {
    const update = setComponentInstanceLiteralPropBinding(
      model,
      member.id,
      value
    );
    if (update) void onUpdateBindings(update);
  };
  const clearLiteral = () => {
    const update = clearComponentInstancePropBinding(model, member.id);
    if (update) void onUpdateBindings(update);
  };

  if (member.bindingKind === 'reference') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md bg-(--bg-raised) px-2 py-1.5">
        <span className="min-w-0 truncate text-[10px] text-(--text-secondary)">
          {member.bindingSummary}
        </span>
        {member.codeArtifactId ? (
          <button
            type="button"
            className={actionClassName}
            onClick={() => void onOpenCodeArtifact(member.codeArtifactId!)}
          >
            <Code2 size={11} /> Open Code
          </button>
        ) : null}
      </div>
    );
  }

  if (member.bindingKind === 'unbound' || member.binding?.kind !== 'literal') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md bg-(--bg-raised) px-2 py-1.5">
        <span className="text-[10px] text-(--text-muted)">
          {member.defaultValue !== undefined
            ? `Default · ${JSON.stringify(member.defaultValue)}`
            : 'Not bound'}
        </span>
        <button
          type="button"
          className={actionClassName}
          disabled={disabled}
          onClick={() => publishLiteral(defaultLiteralValue(member))}
        >
          Set literal
        </button>
      </div>
    );
  }

  const value = member.binding.value;
  let editor: ReactNode;
  if (typeof value === 'boolean') {
    editor = (
      <select
        value={String(value)}
        disabled={disabled}
        className={fieldClassName}
        onChange={(event) => publishLiteral(event.target.value === 'true')}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  } else if (typeof value === 'number') {
    editor = (
      <input
        type="number"
        value={value}
        disabled={disabled}
        className={fieldClassName}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) publishLiteral(next);
        }}
      />
    );
  } else if (typeof value === 'string') {
    editor = (
      <input
        type="text"
        value={value}
        disabled={disabled}
        className={fieldClassName}
        onChange={(event) => publishLiteral(event.target.value)}
      />
    );
  } else {
    editor = (
      <JsonLiteralEditor
        value={value}
        disabled={disabled}
        onCommit={publishLiteral}
      />
    );
  }

  return (
    <div className="grid gap-1">
      {editor}
      <div className="flex justify-end">
        <button
          type="button"
          className="border-0 bg-transparent px-1 text-[9px] text-(--text-muted) hover:text-(--text-primary) disabled:opacity-40"
          disabled={disabled}
          onClick={clearLiteral}
        >
          Clear binding
        </button>
      </div>
    </div>
  );
}

function ReadyInspector({
  model,
  disabled,
  onUpdateBindings,
  onOpenDefinition,
  onFindReferences,
  onOpenCodeArtifact,
  onOpenCodeSlotDefinition,
}: Readonly<
  Omit<ComponentInstanceInspectorPanelProps, 'model'> & {
    model: ComponentInstanceInspectorReadyModel;
    disabled: boolean;
  }
>) {
  return (
    <div className="min-h-0 overflow-y-auto">
      <div className="border-b border-(--border-subtle) px-3 py-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-(--bg-raised) text-(--text-secondary)">
            <Boxes size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[11px] font-medium text-(--text-primary)">
              {model.definition.name}
            </p>
            <p className="m-0 mt-0.5 truncate font-mono text-[9px] text-(--text-muted)">
              {model.definition.path}
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className={actionClassName}
            onClick={() => void onOpenDefinition(model.definition.documentId)}
          >
            <ExternalLink size={11} /> Open Definition
          </button>
          <button
            type="button"
            className={actionClassName}
            onClick={() => void onFindReferences(model.definition.documentId)}
          >
            <Search size={11} /> References
          </button>
        </div>
      </div>

      <Diagnostics diagnostics={model.diagnostics} />

      <PanelSection title="Properties" count={model.props.length}>
        <div className="grid gap-2">
          {model.props.map((member) => (
            <div
              key={member.id}
              className="grid gap-1.5 rounded-md border border-(--border-subtle) bg-(--bg-panel) p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="m-0 truncate text-[10px] font-medium text-(--text-primary)">
                    {member.name}
                    {member.required ? (
                      <span className="ml-1 text-[8px] text-(--text-muted)">
                        required
                      </span>
                    ) : null}
                  </p>
                  <p className="m-0 truncate font-mono text-[9px] text-(--text-muted)">
                    {member.id} · {member.typeRef}
                  </p>
                </div>
              </div>
              <LiteralPropEditor
                model={model}
                member={member}
                disabled={disabled}
                onUpdateBindings={onUpdateBindings}
                onOpenCodeArtifact={onOpenCodeArtifact}
              />
              <Diagnostics diagnostics={member.diagnostics} compact />
            </div>
          ))}
          {model.props.length === 0 ? (
            <p className="m-0 text-[10px] text-(--text-muted)">
              The Public Contract exposes no properties.
            </p>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection title="Variants" count={model.variants.length}>
        <div className="grid gap-2">
          {model.variants.map((axis) => (
            <label
              key={axis.id}
              className="grid gap-1 rounded-md border border-(--border-subtle) bg-(--bg-panel) p-2"
            >
              <span className="text-[10px] font-medium text-(--text-primary)">
                {axis.name}
                {axis.required ? (
                  <span className="ml-1 text-[8px] text-(--text-muted)">
                    required
                  </span>
                ) : null}
              </span>
              <select
                value={axis.selectedOptionId ?? ''}
                disabled={disabled}
                className={fieldClassName}
                onChange={(event) => {
                  const update = setComponentInstanceVariantBinding(
                    model,
                    axis.id,
                    event.target.value || undefined
                  );
                  if (update) void onUpdateBindings(update);
                }}
              >
                <option value="">
                  {axis.defaultOptionId
                    ? `Use default (${axis.defaultOptionId})`
                    : 'Not bound'}
                </option>
                {axis.options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <Diagnostics diagnostics={axis.diagnostics} compact />
            </label>
          ))}
          {model.variants.length === 0 ? (
            <p className="m-0 text-[10px] text-(--text-muted)">
              The Public Contract exposes no variants.
            </p>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection title="Events" count={model.events.length}>
        <div className="grid gap-2">
          {model.events.map((event) => (
            <div
              key={event.id}
              className="grid gap-1 rounded-md border border-(--border-subtle) bg-(--bg-panel) p-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="m-0 truncate text-[10px] font-medium text-(--text-primary)">
                    {event.name}
                  </p>
                  <p className="m-0 truncate font-mono text-[9px] text-(--text-muted)">
                    {event.id}
                    {event.payloadTypeRef ? ` · ${event.payloadTypeRef}` : ''}
                  </p>
                </div>
                {event.codeArtifactId ? (
                  <button
                    type="button"
                    className={actionClassName}
                    onClick={() =>
                      event.codeSlotId
                        ? void onOpenCodeSlotDefinition(event.codeSlotId)
                        : void onOpenCodeArtifact(event.codeArtifactId!)
                    }
                  >
                    <Code2 size={11} /> Open Code
                  </button>
                ) : null}
              </div>
              <p className="m-0 truncate text-[10px] text-(--text-secondary)">
                {event.bindingSummary}
              </p>
              <Diagnostics diagnostics={event.diagnostics} compact />
            </div>
          ))}
          {model.events.length === 0 ? (
            <p className="m-0 text-[10px] text-(--text-muted)">
              The Public Contract exposes no events.
            </p>
          ) : null}
        </div>
      </PanelSection>

      <PanelSection title="Slots" count={model.slots.length}>
        <div className="grid gap-2">
          {model.slots.map((slot) => (
            <div
              key={slot.id}
              className="grid gap-1 rounded-md border border-(--border-subtle) bg-(--bg-panel) p-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="m-0 truncate text-[10px] font-medium text-(--text-primary)">
                    {slot.name}
                    {slot.required ? (
                      <span className="ml-1 text-[8px] text-(--text-muted)">
                        required
                      </span>
                    ) : null}
                  </p>
                  <p className="m-0 truncate font-mono text-[9px] text-(--text-muted)">
                    {slot.id}
                  </p>
                </div>
                <span className="text-[10px] text-(--text-secondary)">
                  {slot.childCount}
                  {slot.minChildren !== undefined ||
                  slot.maxChildren !== undefined
                    ? ` · ${slot.minChildren ?? 0}–${slot.maxChildren ?? '∞'}`
                    : ''}
                </span>
              </div>
              {slot.missingChildCount > 0 ? (
                <p className="m-0 text-[9px] text-(--text-muted)">
                  Missing {slot.missingChildCount} required child
                  {slot.missingChildCount === 1 ? '' : 'ren'}.
                </p>
              ) : null}
              <Diagnostics diagnostics={slot.diagnostics} compact />
            </div>
          ))}
          {model.slots.length === 0 ? (
            <p className="m-0 text-[10px] text-(--text-muted)">
              The Public Contract exposes no slots.
            </p>
          ) : null}
        </div>
      </PanelSection>
    </div>
  );
}

/** Controlled, store-free Component Instance Inspector surface. */
export function ComponentInstanceInspectorPanel({
  model,
  disabled = false,
  onUpdateBindings,
  onOpenDefinition,
  onFindReferences,
  onOpenCodeArtifact,
  onOpenCodeSlotDefinition,
}: ComponentInstanceInspectorPanelProps) {
  if (model.status === 'hidden') return null;
  if (model.status === 'blocked') {
    return (
      <section className="border-b border-(--border-subtle) bg-(--bg-panel)">
        <div className="flex items-start justify-between gap-2 px-3 py-3">
          <div>
            <p className="m-0 text-[11px] font-medium text-(--text-primary)">
              Component Instance unavailable
            </p>
            <p className="m-0 mt-1 text-[10px] text-(--text-muted)">
              The canonical Definition or Public Contract could not be
              projected.
            </p>
          </div>
          {model.definitionDocumentId ? (
            <button
              type="button"
              className={actionClassName}
              onClick={() => void onOpenDefinition(model.definitionDocumentId!)}
            >
              <ExternalLink size={11} /> Open
            </button>
          ) : null}
        </div>
        <Diagnostics diagnostics={model.diagnostics} />
      </section>
    );
  }
  return (
    <ReadyInspector
      model={model}
      disabled={disabled}
      onUpdateBindings={onUpdateBindings}
      onOpenDefinition={onOpenDefinition}
      onFindReferences={onFindReferences}
      onOpenCodeArtifact={onOpenCodeArtifact}
      onOpenCodeSlotDefinition={onOpenCodeSlotDefinition}
    />
  );
}
