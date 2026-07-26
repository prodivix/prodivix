import './PdxPickerListbox.scss';
import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { mergeClassNames } from '../foundation/component';

export interface PdxPickerOption {
  disabled?: boolean;
  label: string;
  value: string;
}

/** Stable element id for one option, so a field can point `aria-activedescendant` at it. */
export const pickerOptionElementId = (listboxId: string, index: number) =>
  `${listboxId}-option-${index}`;

/** First or last option a user is allowed to land on. `-1` when there is none. */
export const edgeSelectableIndex = (
  options: readonly PdxPickerOption[],
  edge: 'first' | 'last'
) => {
  if (edge === 'first') {
    return options.findIndex((option) => !option.disabled);
  }

  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index]?.disabled) return index;
  }

  return -1;
};

/**
 * Next selectable option in `step` direction, skipping disabled entries and
 * stopping at the ends rather than wrapping, which is what a listbox that also
 * reports position through `aria-activedescendant` should do.
 */
export const moveSelectableIndex = (
  options: readonly PdxPickerOption[],
  from: number,
  step: 1 | -1
) => {
  const start = from < 0 ? (step === 1 ? -1 : options.length) : from;

  for (
    let index = start + step;
    index >= 0 && index < options.length;
    index += step
  ) {
    if (!options[index]?.disabled) return index;
  }

  return from;
};

export interface PdxPickerListboxProps {
  /** Option the field currently points `aria-activedescendant` at. */
  activeIndex: number;
  className?: string;
  emptyLabel?: string;
  id: string;
  label: string;
  onSelect: (option: PdxPickerOption, index: number) => void;
  options: readonly PdxPickerOption[];
  selectedValue?: string;
}

/**
 * The option list shared by every picker that offers a set of values.
 *
 * It owns no keyboard state on purpose: focus stays on the field, which moves
 * `activeIndex` and announces the active option through `aria-activedescendant`.
 * That is the only model in which typing into the field and steering the list
 * with the arrow keys can be the same interaction.
 */
function PdxPickerListbox({
  activeIndex,
  className,
  emptyLabel = 'No matching options',
  id,
  label,
  onSelect,
  options,
  selectedValue,
}: PdxPickerListboxProps) {
  const optionRefs = useRef(new Map<number, HTMLLIElement | null>());

  useEffect(() => {
    optionRefs.current.get(activeIndex)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <ul
      aria-label={label}
      className={mergeClassNames('PdxPickerListbox', className)}
      id={id}
      /* Pointer input must not pull focus off the field that owns the keyboard. */
      onMouseDown={(event) => event.preventDefault()}
      role="listbox"
    >
      {options.length === 0 ? (
        <li aria-disabled="true" className="PdxPickerOptionEmpty" role="option">
          {emptyLabel}
        </li>
      ) : (
        options.map((option, index) => (
          <li
            key={option.value}
            ref={(element) => {
              optionRefs.current.set(index, element);
            }}
            aria-disabled={option.disabled || undefined}
            aria-selected={option.value === selectedValue}
            className="PdxPickerOption"
            data-active={index === activeIndex ? 'true' : undefined}
            id={pickerOptionElementId(id, index)}
            onClick={() => {
              if (!option.disabled) onSelect(option, index);
            }}
            role="option"
          >
            <span className="PdxPickerOptionLabel">{option.label}</span>
            {option.value === selectedValue && (
              <Check
                aria-hidden="true"
                className="PdxPickerOptionCheck"
                size={13}
              />
            )}
          </li>
        ))
      )}
    </ul>
  );
}

export default PdxPickerListbox;
