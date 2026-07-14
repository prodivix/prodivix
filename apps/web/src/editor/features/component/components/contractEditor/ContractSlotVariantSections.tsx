import { Plus, Trash2 } from 'lucide-react';
import type {
  PIRComponentContract,
  PIRComponentPropContract,
  PIRComponentSlotContract,
  PIRComponentVariantContract,
} from '@prodivix/pir';
import type { ContractSectionProps } from './ContractPropertyEventSections';

const nextId = (
  prefix: string,
  members: Readonly<Record<string, unknown>>
): string => {
  let index = Object.keys(members).length + 1;
  while (Object.hasOwn(members, `${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
};

function AddButton({
  label,
  disabled,
  onClick,
}: Readonly<{
  label: string;
  disabled: boolean;
  onClick: () => void;
}>) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-md border border-(--border-subtle) bg-transparent px-2 py-1 text-[11px] hover:bg-(--bg-raised) disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
    >
      <Plus size={11} /> {label}
    </button>
  );
}

const replaceSlot = (
  contract: PIRComponentContract,
  slot: PIRComponentSlotContract
): PIRComponentContract => ({
  ...contract,
  slotsById: { ...contract.slotsById, [slot.id]: slot },
});

export function ContractSlotSection({
  contract,
  disabled,
  onChange,
}: ContractSectionProps) {
  const slots = Object.values(contract.slotsById);
  const removeSlot = (memberId: string) => {
    const { [memberId]: _removed, ...slotsById } = contract.slotsById;
    onChange({ ...contract, slotsById });
  };
  const updateSlot = (
    slot: PIRComponentSlotContract,
    patch: Partial<PIRComponentSlotContract>
  ) => onChange(replaceSlot(contract, { ...slot, ...patch }));
  const setCardinality = (
    slot: PIRComponentSlotContract,
    key: 'minChildren' | 'maxChildren',
    value: string
  ) => {
    if (!value) {
      if (key === 'minChildren') {
        const { minChildren: _value, ...nextSlot } = slot;
        onChange(replaceSlot(contract, nextSlot));
      } else {
        const { maxChildren: _value, ...nextSlot } = slot;
        onChange(replaceSlot(contract, nextSlot));
      }
      return;
    }
    updateSlot(slot, { [key]: Number(value) });
  };
  const addSlotProp = (slot: PIRComponentSlotContract) => {
    const propsById = slot.propsById ?? {};
    const id = nextId('slot-prop', propsById);
    updateSlot(slot, {
      propsById: {
        ...propsById,
        [id]: {
          id,
          name: `slotProperty${Object.keys(propsById).length + 1}`,
          typeRef: 'unknown',
        },
      },
    });
  };
  const updateSlotProp = (
    slot: PIRComponentSlotContract,
    prop: PIRComponentPropContract,
    patch: Partial<PIRComponentPropContract>
  ) =>
    updateSlot(slot, {
      propsById: {
        ...(slot.propsById ?? {}),
        [prop.id]: { ...prop, ...patch },
      },
    });
  const removeSlotProp = (slot: PIRComponentSlotContract, propId: string) => {
    const { [propId]: _removed, ...propsById } = slot.propsById ?? {};
    updateSlot(slot, { propsById });
  };

  return (
    <section className="space-y-3 rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-xs font-semibold">Slots</h3>
          <p className="m-0 mt-1 text-[11px] text-(--text-muted)">
            Named child regions with explicit cardinality and slot properties.
          </p>
        </div>
        <AddButton
          label="Add"
          disabled={disabled}
          onClick={() => {
            const id = nextId('slot', contract.slotsById);
            onChange({
              ...contract,
              slotsById: {
                ...contract.slotsById,
                [id]: { id, name: `slot${slots.length + 1}` },
              },
            });
          }}
        />
      </div>

      {slots.length > 0 ? (
        <div className="space-y-3">
          {slots.map((slot) => {
            const slotProps = Object.values(slot.propsById ?? {});
            return (
              <div
                key={slot.id}
                className="space-y-3 rounded-lg bg-(--bg-canvas) p-3"
              >
                <div className="grid grid-cols-[minmax(120px,1fr)_88px_88px_auto] items-end gap-2">
                  <label className="min-w-0 space-y-1">
                    <span className="block text-[10px] text-(--text-muted)">
                      Slot name
                    </span>
                    <input
                      value={slot.name}
                      className="w-full rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 py-1.5 text-xs outline-none focus:border-(--border-strong)"
                      disabled={disabled}
                      onChange={(event) =>
                        updateSlot(slot, { name: event.target.value })
                      }
                    />
                    <code className="block truncate text-[9px] text-(--text-muted)">
                      {slot.id}
                    </code>
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] text-(--text-muted)">
                      Minimum
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={slot.minChildren ?? ''}
                      className="w-full rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 py-1.5 text-xs outline-none focus:border-(--border-strong)"
                      disabled={disabled}
                      onChange={(event) =>
                        setCardinality(slot, 'minChildren', event.target.value)
                      }
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] text-(--text-muted)">
                      Maximum
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={slot.maxChildren ?? ''}
                      className="w-full rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 py-1.5 text-xs outline-none focus:border-(--border-strong)"
                      disabled={disabled}
                      onChange={(event) =>
                        setCardinality(slot, 'maxChildren', event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove slot ${slot.name}`}
                    className="mb-0.5 rounded-md border-0 bg-transparent p-1.5 text-(--text-muted) hover:bg-(--bg-raised) hover:text-(--text-primary) disabled:opacity-40"
                    disabled={disabled}
                    onClick={() => removeSlot(slot.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="space-y-2 border-t border-(--border-subtle) pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold tracking-wide text-(--text-muted) uppercase">
                      Slot properties
                    </span>
                    <AddButton
                      label="Property"
                      disabled={disabled}
                      onClick={() => addSlotProp(slot)}
                    />
                  </div>
                  {slotProps.map((prop) => (
                    <div
                      key={prop.id}
                      className="grid grid-cols-[minmax(110px,0.8fr)_minmax(120px,1fr)_auto_auto] items-center gap-2"
                    >
                      <input
                        value={prop.name}
                        aria-label={`Name for ${prop.id}`}
                        className="min-w-0 rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 py-1.5 text-xs outline-none focus:border-(--border-strong)"
                        disabled={disabled}
                        onChange={(event) =>
                          updateSlotProp(slot, prop, {
                            name: event.target.value,
                          })
                        }
                      />
                      <input
                        value={prop.typeRef}
                        aria-label={`Type for ${prop.id}`}
                        className="min-w-0 rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 py-1.5 font-mono text-xs outline-none focus:border-(--border-strong)"
                        disabled={disabled}
                        onChange={(event) =>
                          updateSlotProp(slot, prop, {
                            typeRef: event.target.value,
                          })
                        }
                      />
                      <label className="inline-flex items-center gap-1 text-[10px] text-(--text-secondary)">
                        <input
                          type="checkbox"
                          checked={Boolean(prop.required)}
                          disabled={disabled}
                          onChange={(event) =>
                            updateSlotProp(slot, prop, {
                              required: event.target.checked,
                            })
                          }
                        />
                        Required
                      </label>
                      <button
                        type="button"
                        aria-label={`Remove slot property ${prop.name}`}
                        className="rounded-md border-0 bg-transparent p-1.5 text-(--text-muted) hover:bg-(--bg-raised) disabled:opacity-40"
                        disabled={disabled}
                        onClick={() => removeSlotProp(slot, prop.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  {slotProps.length === 0 && (
                    <p className="m-0 text-[10px] text-(--text-muted)">
                      No slot properties.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="m-0 rounded-lg bg-(--bg-canvas) px-3 py-4 text-center text-[11px] text-(--text-muted)">
          No exposed slots.
        </p>
      )}
    </section>
  );
}

const replaceVariant = (
  contract: PIRComponentContract,
  variant: PIRComponentVariantContract
): PIRComponentContract => ({
  ...contract,
  variantAxesById: {
    ...contract.variantAxesById,
    [variant.id]: variant,
  },
});

export function ContractVariantSection({
  contract,
  disabled,
  onChange,
}: ContractSectionProps) {
  const variants = Object.values(contract.variantAxesById);
  const updateVariant = (
    variant: PIRComponentVariantContract,
    patch: Partial<PIRComponentVariantContract>
  ) => onChange(replaceVariant(contract, { ...variant, ...patch }));
  const removeVariant = (memberId: string) => {
    const { [memberId]: _removed, ...variantAxesById } =
      contract.variantAxesById;
    onChange({ ...contract, variantAxesById });
  };
  const clearDefault = (variant: PIRComponentVariantContract) => {
    const { defaultOptionId: _default, ...nextVariant } = variant;
    onChange(replaceVariant(contract, nextVariant));
  };

  return (
    <section className="space-y-3 rounded-xl border border-(--border-subtle) bg-(--bg-panel) p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-xs font-semibold">Variants</h3>
          <p className="m-0 mt-1 text-[11px] text-(--text-muted)">
            Stable axes and options selectable by Component Instances.
          </p>
        </div>
        <AddButton
          label="Add"
          disabled={disabled}
          onClick={() => {
            const id = nextId('variant', contract.variantAxesById);
            const optionId = 'option-1';
            onChange({
              ...contract,
              variantAxesById: {
                ...contract.variantAxesById,
                [id]: {
                  id,
                  name: `variant${variants.length + 1}`,
                  defaultOptionId: optionId,
                  optionsById: {
                    [optionId]: { id: optionId, name: 'default' },
                  },
                },
              },
            });
          }}
        />
      </div>

      {variants.length > 0 ? (
        <div className="space-y-3">
          {variants.map((variant) => {
            const options = Object.values(variant.optionsById);
            return (
              <div
                key={variant.id}
                className="space-y-3 rounded-lg bg-(--bg-canvas) p-3"
              >
                <div className="grid grid-cols-[minmax(120px,1fr)_minmax(110px,0.8fr)_auto_auto] items-end gap-2">
                  <label className="min-w-0 space-y-1">
                    <span className="block text-[10px] text-(--text-muted)">
                      Axis name
                    </span>
                    <input
                      value={variant.name}
                      className="w-full rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 py-1.5 text-xs outline-none focus:border-(--border-strong)"
                      disabled={disabled}
                      onChange={(event) =>
                        updateVariant(variant, { name: event.target.value })
                      }
                    />
                    <code className="block truncate text-[9px] text-(--text-muted)">
                      {variant.id}
                    </code>
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] text-(--text-muted)">
                      Default option
                    </span>
                    <select
                      value={variant.defaultOptionId ?? ''}
                      className="w-full rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 py-1.5 text-xs outline-none focus:border-(--border-strong)"
                      disabled={disabled}
                      onChange={(event) => {
                        if (!event.target.value) clearDefault(variant);
                        else
                          updateVariant(variant, {
                            defaultOptionId: event.target.value,
                          });
                      }}
                    >
                      <option value="">None</option>
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mb-1.5 inline-flex items-center gap-1.5 text-[11px] text-(--text-secondary)">
                    <input
                      type="checkbox"
                      checked={Boolean(variant.required)}
                      disabled={disabled}
                      onChange={(event) =>
                        updateVariant(variant, {
                          required: event.target.checked,
                        })
                      }
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    aria-label={`Remove variant ${variant.name}`}
                    className="mb-0.5 rounded-md border-0 bg-transparent p-1.5 text-(--text-muted) hover:bg-(--bg-raised) hover:text-(--text-primary) disabled:opacity-40"
                    disabled={disabled}
                    onClick={() => removeVariant(variant.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                <div className="space-y-2 border-t border-(--border-subtle) pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold tracking-wide text-(--text-muted) uppercase">
                      Options
                    </span>
                    <AddButton
                      label="Option"
                      disabled={disabled}
                      onClick={() => {
                        const id = nextId('option', variant.optionsById);
                        updateVariant(variant, {
                          optionsById: {
                            ...variant.optionsById,
                            [id]: {
                              id,
                              name: `option${options.length + 1}`,
                            },
                          },
                        });
                      }}
                    />
                  </div>
                  {options.map((option) => (
                    <div
                      key={option.id}
                      className="grid grid-cols-[minmax(130px,1fr)_minmax(90px,0.6fr)_auto] items-center gap-2"
                    >
                      <input
                        value={option.name}
                        aria-label={`Name for ${option.id}`}
                        className="min-w-0 rounded-md border border-(--border-subtle) bg-(--bg-panel) px-2 py-1.5 text-xs outline-none focus:border-(--border-strong)"
                        disabled={disabled}
                        onChange={(event) =>
                          updateVariant(variant, {
                            optionsById: {
                              ...variant.optionsById,
                              [option.id]: {
                                ...option,
                                name: event.target.value,
                              },
                            },
                          })
                        }
                      />
                      <code className="truncate text-[9px] text-(--text-muted)">
                        {option.id}
                      </code>
                      <button
                        type="button"
                        aria-label={`Remove option ${option.name}`}
                        className="rounded-md border-0 bg-transparent p-1.5 text-(--text-muted) hover:bg-(--bg-raised) disabled:opacity-40"
                        disabled={disabled || options.length === 1}
                        onClick={() => {
                          const { [option.id]: _removed, ...optionsById } =
                            variant.optionsById;
                          const nextVariant = {
                            ...variant,
                            optionsById,
                          };
                          if (variant.defaultOptionId === option.id) {
                            const {
                              defaultOptionId: _default,
                              ...withoutDefault
                            } = nextVariant;
                            onChange(replaceVariant(contract, withoutDefault));
                          } else {
                            onChange(replaceVariant(contract, nextVariant));
                          }
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="m-0 rounded-lg bg-(--bg-canvas) px-3 py-4 text-center text-[11px] text-(--text-muted)">
          No exposed variants.
        </p>
      )}
    </section>
  );
}
