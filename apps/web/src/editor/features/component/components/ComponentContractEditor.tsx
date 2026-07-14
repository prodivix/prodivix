import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import type { PIRComponentContract } from '@prodivix/pir';
import type { WorkspaceComponentDefinitionSummary } from '@/editor/features/component/model/workspaceComponentAuthoringModel';
import {
  ContractEventSection,
  ContractPropertySection,
} from './contractEditor/ContractPropertyEventSections';
import {
  ContractSlotSection,
  ContractVariantSection,
} from './contractEditor/ContractSlotVariantSections';

export type ComponentContractEditorProps = Readonly<{
  definition: WorkspaceComponentDefinitionSummary;
  readonly: boolean;
  saving: boolean;
  onSave: (contract: PIRComponentContract) => Promise<boolean>;
}>;

const firstDraftIssue = (contract: PIRComponentContract): string | null => {
  for (const member of Object.values(contract.propsById)) {
    if (!member.name.trim()) return `Property ${member.id} needs a name.`;
    if (!member.typeRef.trim())
      return `Property ${member.name} needs a type reference.`;
  }
  for (const member of Object.values(contract.eventsById)) {
    if (!member.name.trim()) return `Event ${member.id} needs a name.`;
    if (member.payloadTypeRef !== undefined && !member.payloadTypeRef.trim())
      return `Event ${member.name} has an empty payload type.`;
  }
  for (const slot of Object.values(contract.slotsById)) {
    if (!slot.name.trim()) return `Slot ${slot.id} needs a name.`;
    if (
      slot.minChildren !== undefined &&
      slot.maxChildren !== undefined &&
      slot.minChildren > slot.maxChildren
    ) {
      return `Slot ${slot.name} has a maximum below its minimum.`;
    }
    for (const prop of Object.values(slot.propsById ?? {})) {
      if (!prop.name.trim()) return `Slot property ${prop.id} needs a name.`;
      if (!prop.typeRef.trim())
        return `Slot property ${prop.name} needs a type reference.`;
    }
  }
  for (const variant of Object.values(contract.variantAxesById)) {
    if (!variant.name.trim()) return `Variant ${variant.id} needs a name.`;
    if (Object.keys(variant.optionsById).length === 0)
      return `Variant ${variant.name} needs at least one option.`;
    for (const option of Object.values(variant.optionsById)) {
      if (!option.name.trim())
        return `Variant option ${option.id} needs a name.`;
    }
  }
  return null;
};

export function ComponentContractEditor({
  definition,
  readonly,
  saving,
  onSave,
}: ComponentContractEditorProps) {
  const [draft, setDraft] = useState(definition.contract);

  useEffect(() => {
    setDraft(definition.contract);
  }, [definition.contract, definition.documentId]);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(definition.contract),
    [definition.contract, draft]
  );
  const draftIssue = useMemo(() => firstDraftIssue(draft), [draft]);
  const advancedCount =
    Object.keys(draft.partsById ?? {}).length +
    (draft.tokenBindings?.length ?? 0) +
    (draft.accessibility ? 1 : 0);
  const disabled = readonly || saving;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="m-0 text-base font-semibold">Public Contract</h2>
            <span className="rounded-full border border-(--border-subtle) px-2 py-0.5 font-mono text-[10px] text-(--text-muted)">
              canonical contract
            </span>
          </div>
          <p className="m-0 mt-1 max-w-2xl text-xs leading-5 text-(--text-muted)">
            Edit stable, typed members. Member IDs remain immutable while
            display names and contract semantics evolve.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-(--border-subtle) bg-transparent px-3 py-2 text-xs hover:bg-(--bg-raised) disabled:cursor-not-allowed disabled:opacity-40"
            disabled={disabled || !dirty}
            onClick={() => setDraft(definition.contract)}
          >
            <RotateCcw size={13} /> Revert
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-(--border-strong) bg-(--text-primary) px-3 py-2 text-xs font-medium text-(--bg-canvas) disabled:cursor-not-allowed disabled:opacity-40"
            disabled={disabled || !dirty || Boolean(draftIssue)}
            onClick={() => void onSave(draft)}
          >
            <Save size={13} /> {saving ? 'Saving' : 'Save contract'}
          </button>
        </div>
      </div>

      {draftIssue && (
        <p className="m-0 rounded-lg border border-(--border-subtle) bg-(--bg-panel) px-3 py-2 text-xs text-(--text-secondary)">
          {draftIssue}
        </p>
      )}
      {readonly && (
        <p className="m-0 rounded-lg border border-(--border-subtle) bg-(--bg-panel) px-3 py-2 text-xs text-(--text-muted)">
          This Workspace is read-only. Contract fields are available for
          inspection only.
        </p>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <ContractPropertySection
          contract={draft}
          disabled={disabled}
          onChange={setDraft}
        />
        <ContractEventSection
          contract={draft}
          disabled={disabled}
          onChange={setDraft}
        />
        <ContractSlotSection
          contract={draft}
          disabled={disabled}
          onChange={setDraft}
        />
        <ContractVariantSection
          contract={draft}
          disabled={disabled}
          onChange={setDraft}
        />
      </div>

      {advancedCount > 0 && (
        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-panel) px-4 py-3 text-[11px] text-(--text-muted)">
          {advancedCount} advanced contract entr
          {advancedCount === 1 ? 'y is' : 'ies are'} retained: parts, token
          bindings, and accessibility policy remain owned by their structured
          authoring surfaces.
        </div>
      )}
    </section>
  );
}
