import {
  useEffect,
  useState,
  type FocusEventHandler,
  type KeyboardEvent,
  type MouseEventHandler,
} from 'react';
import {
  addCalendarDays,
  addCalendarMonths,
  clampIsoDate,
  formatIsoDate,
  parseIsoDate,
  todayIsoDate,
} from './PdxDatePicker.calendar';

const ISO_PLACEHOLDER = 'YYYY-MM-DD';

export interface PdxIsoDateFieldProps {
  'aria-describedby'?: string;
  'aria-label'?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  max?: string;
  min?: string;
  name?: string;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onClick?: MouseEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  /** Alt+ArrowDown, the combobox convention for revealing the panel. */
  onRequestPanel?: () => void;
  onValueChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  required?: boolean;
  value: string;
}

/**
 * The typed half of every date control: an ISO date the user can also step with
 * the keyboard.
 *
 * A range needs two of these and a single date needs one, so the draft/commit
 * rules, the bounds clamp and the stepping keys are decided here rather than
 * drifting apart between the two pickers.
 */
function PdxIsoDateField({
  'aria-describedby': ariaDescribedBy,
  'aria-label': ariaLabel,
  autoFocus = false,
  disabled = false,
  id,
  invalid = false,
  max,
  min,
  name,
  onBlur,
  onClick,
  onFocus,
  onRequestPanel,
  onValueChange,
  placeholder,
  readOnly = false,
  required = false,
  value,
}: PdxIsoDateFieldProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const publish = (nextValue: string) => {
    setDraft(nextValue);
    onValueChange(nextValue);
  };

  const commitDraft = () => {
    const trimmed = draft.trim();

    if (!trimmed) {
      publish('');
      return;
    }

    const parsed = parseIsoDate(trimmed);

    if (!parsed) {
      setDraft(value);
      return;
    }

    publish(clampIsoDate(formatIsoDate(parsed), min, max));
  };

  const stepValue = (amount: number, unit: 'day' | 'month' | 'year') => {
    if (disabled || readOnly) return;

    const base = parseIsoDate(draft)
      ? draft
      : value || clampIsoDate(todayIsoDate(), min, max);
    const stepped =
      unit === 'day'
        ? addCalendarDays(base, amount)
        : addCalendarMonths(base, unit === 'month' ? amount : amount * 12);

    publish(clampIsoDate(stepped, min, max));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && event.altKey) {
      event.preventDefault();
      if (!disabled && !readOnly) onRequestPanel?.();
      return;
    }

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        stepValue(1, 'day');
        return;
      case 'ArrowDown':
        event.preventDefault();
        stepValue(-1, 'day');
        return;
      case 'PageUp':
        event.preventDefault();
        stepValue(1, event.shiftKey ? 'year' : 'month');
        return;
      case 'PageDown':
        event.preventDefault();
        stepValue(-1, event.shiftKey ? 'year' : 'month');
        return;
      case 'Enter':
        event.preventDefault();
        commitDraft();
        return;
      case 'Escape':
        if (draft === value) return;
        event.preventDefault();
        setDraft(value);
        return;
      default:
        break;
    }
  };

  return (
    <input
      autoFocus={autoFocus}
      aria-describedby={ariaDescribedBy}
      aria-invalid={invalid || undefined}
      aria-label={ariaLabel}
      className="PdxPickerControlInput"
      disabled={disabled}
      id={id}
      inputMode="numeric"
      name={name}
      onBlur={(event) => {
        commitDraft();
        onBlur?.(event);
      }}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onClick={onClick}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      placeholder={placeholder ?? ISO_PLACEHOLDER}
      readOnly={readOnly}
      required={required}
      spellCheck={false}
      type="text"
      value={draft}
    />
  );
}

export default PdxIsoDateField;
