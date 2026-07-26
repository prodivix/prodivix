import './PdxTimePicker.scss';
import { Clock } from 'lucide-react';
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type FocusEventHandler,
  type KeyboardEvent,
} from 'react';
import type React from 'react';
import { type PdxComponent } from '@prodivix/shared';
import {
  mergeClassNames,
  type PdxValidationState,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import PdxField, { usePdxFieldIds } from './PdxField';
import PdxPickerListbox, {
  edgeSelectableIndex,
  moveSelectableIndex,
  pickerOptionElementId,
  type PdxPickerOption,
} from './PdxPickerListbox';
import PdxPickerPopover, { PdxPickerPopoverToggle } from './PdxPickerPopover';
import {
  addMinutesToTime,
  buildTimeOptions,
  clampTimeValue,
  formatTimeLabel,
  formatTimeValue,
  nearestTimeOptionIndex,
  parseTimeValue,
} from './PdxTimePicker.clock';

interface PdxTimePickerSpecificProps {
  autoFocus?: boolean;
  defaultValue?: string;
  description?: string;
  disabled?: boolean;
  label?: string;
  max?: string;
  message?: string;
  min?: string;
  name?: string;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onChange?: (value: string) => void;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  /** Render the time-list toggle. Without it the field is typed-entry only. */
  showIcon?: boolean;
  size?: 'Small' | 'Medium' | 'Large';
  state?: PdxValidationState;
  /** Minutes between the offered times. */
  step?: number;
  value?: string;
}

export interface PdxTimePickerProps
  extends PdxComponent, PdxTimePickerSpecificProps {}

const TIME_PLACEHOLDER = 'HH:MM';

/**
 * A time field that is an editable combobox over a stepped list of times.
 *
 * Focus stays in the input: arrows step the value while the list is closed and
 * move the active option while it is open, and what the user types narrows the
 * list. The list is a convenience, never the only way in.
 */
function PdxTimePicker({
  autoFocus = false,
  className,
  dataAttributes = {},
  defaultValue = '',
  description,
  disabled = false,
  id,
  label,
  max,
  message,
  min,
  name,
  onBlur,
  onChange,
  onClick,
  onFocus,
  placeholder,
  readOnly = false,
  required = false,
  showIcon = true,
  size = 'Medium',
  state = 'Default',
  step = 30,
  style,
  value,
}: PdxTimePickerProps) {
  const [currentValue, setCurrentValue] = useControllableState({
    value,
    defaultValue,
    onChange,
  });
  const [draft, setDraft] = useState(currentValue);
  const [open, setOpen] = useState(false);
  const [activeValue, setActiveValue] = useState<string | undefined>(undefined);
  const fieldIds = usePdxFieldIds({ id, description, message });
  const listboxId = `${useId().replaceAll(':', '')}-listbox`;

  useEffect(() => {
    setDraft(currentValue);
  }, [currentValue]);

  const options = useMemo(
    () => buildTimeOptions({ max, min, step }),
    [max, min, step]
  );

  const visibleOptions = useMemo(() => {
    const needle = draft.trim();
    if (!needle || parseTimeValue(needle)) return options;

    return options.filter(
      (option) =>
        option.value.startsWith(needle) || option.label.startsWith(needle)
    );
  }, [draft, options]);

  /**
   * `-1` until the user commits to an option, so `aria-activedescendant` only
   * ever names something Enter would actually pick.
   */
  const activeIndex = useMemo(
    () =>
      activeValue === undefined
        ? -1
        : visibleOptions.findIndex((option) => option.value === activeValue),
    [activeValue, visibleOptions]
  );

  const applyValue = (nextValue: string) => {
    setDraft(nextValue);
    setCurrentValue(nextValue);
  };

  const commitDraft = () => {
    const trimmed = draft.trim();

    if (!trimmed) {
      applyValue('');
      return;
    }

    const parsed = parseTimeValue(trimmed);

    if (!parsed) {
      setDraft(currentValue);
      return;
    }

    applyValue(clampTimeValue(formatTimeValue(parsed), min, max));
  };

  const stepValue = (amount: number) => {
    if (disabled || readOnly) return;

    const base = parseTimeValue(draft)
      ? draft
      : currentValue || clampTimeValue('00:00', min, max);

    applyValue(addMinutesToTime(base, amount, min, max));
  };

  const selectOption = (option: PdxPickerOption) => {
    applyValue(option.value);
    setActiveValue(undefined);
    setOpen(false);
  };

  const canOpenList = showIcon && !disabled && !readOnly;

  const openList = () => {
    if (!canOpenList) return;
    const nearest = nearestTimeOptionIndex(options, currentValue || draft);
    setActiveValue(
      currentValue || options[nearest >= 0 ? nearest : 0]?.value || undefined
    );
    setOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled || readOnly) return;

    if (event.key === 'ArrowDown' && event.altKey) {
      event.preventDefault();
      openList();
      return;
    }

    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown': {
        event.preventDefault();
        if (!open) {
          stepValue(event.key === 'ArrowUp' ? step : -step);
          return;
        }
        const next = moveSelectableIndex(
          visibleOptions,
          activeIndex,
          event.key === 'ArrowDown' ? 1 : -1
        );
        setActiveValue(visibleOptions[next]?.value);
        return;
      }
      case 'Home':
      case 'End':
        if (!open) return;
        event.preventDefault();
        setActiveValue(
          visibleOptions[
            edgeSelectableIndex(
              visibleOptions,
              event.key === 'Home' ? 'first' : 'last'
            )
          ]?.value
        );
        return;
      case 'Enter': {
        event.preventDefault();
        // Typing clears the active option, so a typed time always wins over
        // whatever the list happens to be showing.
        const option =
          open && activeValue !== undefined
            ? visibleOptions[activeIndex]
            : undefined;
        if (option) {
          selectOption(option);
          return;
        }
        commitDraft();
        setOpen(false);
        return;
      }
      case 'Escape':
        if (open) return;
        if (draft === currentValue) return;
        event.preventDefault();
        setDraft(currentValue);
        return;
      default:
        break;
    }
  };

  const selectedLabel = currentValue
    ? formatTimeLabel(currentValue)
    : undefined;
  const panelLabel = label ? `${label} times` : 'Times';

  const control = (
    <div
      className="PdxPickerControl PdxTimePickerControl"
      data-disabled={disabled ? 'true' : undefined}
      data-readonly={readOnly ? 'true' : undefined}
    >
      <input
        autoFocus={autoFocus}
        aria-activedescendant={
          open && activeIndex >= 0
            ? pickerOptionElementId(listboxId, activeIndex)
            : undefined
        }
        aria-autocomplete="list"
        aria-controls={open ? listboxId : undefined}
        aria-describedby={fieldIds.describedBy}
        aria-expanded={open}
        aria-invalid={state === 'Error' || undefined}
        autoComplete="off"
        className="PdxPickerControlInput"
        disabled={disabled}
        id={fieldIds.controlId}
        inputMode="numeric"
        name={name}
        onBlur={(event) => {
          commitDraft();
          onBlur?.(event);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setActiveValue(undefined);
          if (!open && canOpenList) setOpen(true);
        }}
        onClick={onClick}
        onFocus={onFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? TIME_PLACEHOLDER}
        readOnly={readOnly}
        required={required}
        role="combobox"
        spellCheck={false}
        type="text"
        value={draft}
      />
      {showIcon && (
        <PdxPickerPopoverToggle asChild>
          <button
            aria-label={
              selectedLabel
                ? `Choose time, ${selectedLabel} selected`
                : 'Choose time'
            }
            className="PdxPickerToggle"
            disabled={disabled || readOnly}
            type="button"
          >
            <Clock aria-hidden="true" size={15} />
          </button>
        </PdxPickerPopoverToggle>
      )}
    </div>
  );

  return (
    <PdxField
      className={mergeClassNames('PdxTimePicker', size, state, className)}
      controlId={fieldIds.controlId}
      dataAttributes={dataAttributes}
      description={description}
      descriptionId={fieldIds.descriptionId}
      label={label}
      message={message}
      messageId={fieldIds.messageId}
      required={required}
      state={state}
      style={style as React.CSSProperties}
    >
      <PdxPickerPopover
        className="PdxTimePickerPanel"
        control={control}
        label={panelLabel}
        onOpenChange={(nextOpen) => {
          if (nextOpen) openList();
          else {
            setActiveValue(undefined);
            setOpen(false);
          }
        }}
        onPanelOpenAutoFocus={(event) => event.preventDefault()}
        open={open && canOpenList}
      >
        <PdxPickerListbox
          activeIndex={activeIndex}
          emptyLabel="No matching times"
          id={listboxId}
          label={panelLabel}
          onSelect={selectOption}
          options={visibleOptions}
          selectedValue={currentValue || undefined}
        />
        <span className="PdxPickerPanelStatus" role="status">
          {visibleOptions.length === 0
            ? 'No matching times'
            : `${String(visibleOptions.length)} times available`}
        </span>
      </PdxPickerPopover>
    </PdxField>
  );
}

export default PdxTimePicker;
