import { Plus, Trash2 } from 'lucide-react';
import type {
  PIRComponentContract,
  PIRComponentEventContract,
  PIRComponentPropContract,
} from '@prodivix/pir';

export type ContractSectionProps = Readonly<{
  contract: PIRComponentContract;
  disabled: boolean;
  onChange: (contract: PIRComponentContract) => void;
}>;

const nextId = (
  prefix: string,
  members: Readonly<Record<string, unknown>>
): string => {
  let index = Object.keys(members).length + 1;
  while (Object.hasOwn(members, `${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
};

function SectionHeader({
  title,
  description,
  onAdd,
  disabled,
}: Readonly<{
  title: string;
  description: string;
  onAdd: () => void;
  disabled: boolean;
}>) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="m-0 text-xs font-semibold">{title}</h3>
        <p className="m-0 mt-1 text-[11px] text-(--text-muted)">
          {description}
        </p>
      </div>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md border border-(--border-subtle) bg-transparent px-2 py-1 text-[11px] hover:bg-(--bg-raised) disabled:opacity-40"
        disabled={disabled}
        onClick={onAdd}
      >
        <Plus size={11} /> Add
      </button>
    </div>
  );
}

export function ContractPropertySection({
  contract,
  disabled,
  onChange,
}: ContractSectionProps) {
  const props = Object.values(contract.propsById);
  const update = (
    memberId: string,
    patch: Partial<PIRComponentPropContract>
  ) => {
    const current = contract.propsById[memberId];
    if (!current) return;
    onChange({
      ...contract,
      propsById: {
        ...contract.propsById,
        [memberId]: { ...current, ...patch },
      },
    });
  };
  const remove = (memberId: string) => {
    const { [memberId]: _removed, ...propsById } = contract.propsById;
    onChange({ ...contract, propsById });
  };

  return (
    <section className="space-y-3 rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
      <SectionHeader
        title="Properties"
        description="Typed inputs exposed to every Component Instance."
        disabled={disabled}
        onAdd={() => {
          const id = nextId('prop', contract.propsById);
          onChange({
            ...contract,
            propsById: {
              ...contract.propsById,
              [id]: {
                id,
                name: `property${props.length + 1}`,
                typeRef: 'unknown',
              },
            },
          });
        }}
      />
      {props.length > 0 ? (
        <div className="space-y-2">
          {props.map((member) => (
            <div
              key={member.id}
              className="grid grid-cols-[minmax(120px,0.8fr)_minmax(130px,1fr)_auto_auto] items-end gap-2 rounded-lg bg-(--bg-canvas) p-2.5"
            >
              <label className="min-w-0 space-y-1">
                <span className="block text-[10px] text-(--text-muted)">
                  Name
                </span>
                <input
                  value={member.name}
                  className="w-full rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 py-1.5 text-xs outline-none focus:border-(--border-strong)"
                  disabled={disabled}
                  onChange={(event) =>
                    update(member.id, { name: event.target.value })
                  }
                />
                <code className="block truncate text-[9px] text-(--text-muted)">
                  {member.id}
                </code>
              </label>
              <label className="min-w-0 space-y-1">
                <span className="block text-[10px] text-(--text-muted)">
                  Type reference
                </span>
                <input
                  value={member.typeRef}
                  className="w-full rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 py-1.5 font-mono text-xs outline-none focus:border-(--border-strong)"
                  disabled={disabled}
                  onChange={(event) =>
                    update(member.id, { typeRef: event.target.value })
                  }
                />
              </label>
              <label className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] text-(--text-secondary)">
                <input
                  type="checkbox"
                  checked={Boolean(member.required)}
                  disabled={disabled}
                  onChange={(event) =>
                    update(member.id, { required: event.target.checked })
                  }
                />
                Required
              </label>
              <button
                type="button"
                aria-label={`Remove property ${member.name}`}
                className="mb-0.5 rounded-md border-0 bg-transparent p-1.5 text-(--text-muted) hover:bg-(--bg-raised) hover:text-(--text-primary) disabled:opacity-40"
                disabled={disabled}
                onClick={() => remove(member.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 rounded-lg bg-(--bg-canvas) px-3 py-4 text-center text-[11px] text-(--text-muted)">
          No exposed properties.
        </p>
      )}
    </section>
  );
}

export function ContractEventSection({
  contract,
  disabled,
  onChange,
}: ContractSectionProps) {
  const events = Object.values(contract.eventsById);
  const update = (
    memberId: string,
    patch: Partial<PIRComponentEventContract>
  ) => {
    const current = contract.eventsById[memberId];
    if (!current) return;
    const next = { ...current, ...patch };
    if (next.payloadTypeRef === '') delete next.payloadTypeRef;
    onChange({
      ...contract,
      eventsById: { ...contract.eventsById, [memberId]: next },
    });
  };
  const remove = (memberId: string) => {
    const { [memberId]: _removed, ...eventsById } = contract.eventsById;
    onChange({ ...contract, eventsById });
  };

  return (
    <section className="space-y-3 rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
      <SectionHeader
        title="Events"
        description="Typed outputs emitted by the Definition."
        disabled={disabled}
        onAdd={() => {
          const id = nextId('event', contract.eventsById);
          onChange({
            ...contract,
            eventsById: {
              ...contract.eventsById,
              [id]: { id, name: `event${events.length + 1}` },
            },
          });
        }}
      />
      {events.length > 0 ? (
        <div className="space-y-2">
          {events.map((member) => (
            <div
              key={member.id}
              className="grid grid-cols-[minmax(120px,0.8fr)_minmax(130px,1fr)_auto] items-end gap-2 rounded-lg bg-(--bg-canvas) p-2.5"
            >
              <label className="min-w-0 space-y-1">
                <span className="block text-[10px] text-(--text-muted)">
                  Name
                </span>
                <input
                  value={member.name}
                  className="w-full rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 py-1.5 text-xs outline-none focus:border-(--border-strong)"
                  disabled={disabled}
                  onChange={(event) =>
                    update(member.id, { name: event.target.value })
                  }
                />
                <code className="block truncate text-[9px] text-(--text-muted)">
                  {member.id}
                </code>
              </label>
              <label className="min-w-0 space-y-1">
                <span className="block text-[10px] text-(--text-muted)">
                  Payload type
                </span>
                <input
                  value={member.payloadTypeRef ?? ''}
                  placeholder="No payload"
                  className="w-full rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 py-1.5 font-mono text-xs outline-none focus:border-(--border-strong)"
                  disabled={disabled}
                  onChange={(event) =>
                    update(member.id, { payloadTypeRef: event.target.value })
                  }
                />
              </label>
              <button
                type="button"
                aria-label={`Remove event ${member.name}`}
                className="mb-0.5 rounded-md border-0 bg-transparent p-1.5 text-(--text-muted) hover:bg-(--bg-raised) hover:text-(--text-primary) disabled:opacity-40"
                disabled={disabled}
                onClick={() => remove(member.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 rounded-lg bg-(--bg-canvas) px-3 py-4 text-center text-[11px] text-(--text-muted)">
          No exposed events.
        </p>
      )}
    </section>
  );
}
