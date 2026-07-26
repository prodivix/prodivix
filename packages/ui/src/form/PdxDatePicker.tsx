import './PdxDatePicker.scss';
import { CalendarDays } from 'lucide-react';
import { useRef, useState, type FocusEventHandler } from 'react';
import type React from 'react';
import { type PdxComponent } from '@prodivix/shared';
import {
  mergeClassNames,
  type PdxValidationState,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import PdxCalendarPanel, {
  clampIsoDate,
  formatCalendarDayLabel,
  todayIsoDate,
  type PdxCalendarPanelHandle,
} from './PdxDatePicker.calendar';
import PdxIsoDateField from './PdxDatePicker.field';
import PdxField, { usePdxFieldIds } from './PdxField';
import PdxPickerPopover, { PdxPickerPopoverToggle } from './PdxPickerPopover';

interface PdxDatePickerSpecificProps {
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
  /** Render the calendar toggle. Without it the field is typed-entry only. */
  showIcon?: boolean;
  size?: 'Small' | 'Medium' | 'Large';
  state?: PdxValidationState;
  value?: string;
}

export interface PdxDatePickerProps
  extends PdxComponent, PdxDatePickerSpecificProps {}

/**
 * A date field with a calendar panel, both reachable without a pointer.
 *
 * The text field accepts an ISO date and steps it with the arrow keys; the
 * toggle opens the shared month grid and hands focus to it. The two agree
 * because they share one value and one set of bounds, not two code paths.
 */
function PdxDatePicker({
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
  style,
  value,
}: PdxDatePickerProps) {
  const [currentValue, setCurrentValue] = useControllableState({
    value,
    defaultValue,
    onChange,
  });
  const [open, setOpen] = useState(false);
  const [focusedDate, setFocusedDate] = useState(
    () => currentValue || clampIsoDate(todayIsoDate(), min, max)
  );
  const calendarRef = useRef<PdxCalendarPanelHandle>(null);
  const fieldIds = usePdxFieldIds({ id, description, message });

  const applyValue = (nextValue: string) => {
    setCurrentValue(nextValue);
    if (nextValue) setFocusedDate(nextValue);
  };

  /* Focus lives inside the grid while the panel is open, so the panel may only
     open when there is a toggle to hand focus back to on close. */
  const canOpenCalendar = showIcon && !disabled && !readOnly;

  const openCalendar = () => {
    if (!canOpenCalendar) return;
    setFocusedDate(currentValue || clampIsoDate(todayIsoDate(), min, max));
    setOpen(true);
  };

  const selectedLabel = currentValue
    ? formatCalendarDayLabel(currentValue)
    : undefined;
  const panelLabel = label ? `${label} calendar` : 'Calendar';

  const control = (
    <div
      className="PdxPickerControl PdxDatePickerControl"
      data-disabled={disabled ? 'true' : undefined}
      data-readonly={readOnly ? 'true' : undefined}
    >
      <PdxIsoDateField
        autoFocus={autoFocus}
        aria-describedby={fieldIds.describedBy}
        disabled={disabled}
        id={fieldIds.controlId}
        invalid={state === 'Error'}
        max={max}
        min={min}
        name={name}
        onBlur={onBlur}
        onClick={onClick}
        onFocus={onFocus}
        onRequestPanel={openCalendar}
        onValueChange={applyValue}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        value={currentValue}
      />
      {showIcon && (
        <PdxPickerPopoverToggle asChild>
          <button
            aria-label={
              selectedLabel
                ? `Choose date, ${selectedLabel} selected`
                : 'Choose date'
            }
            className="PdxPickerToggle"
            disabled={disabled || readOnly}
            type="button"
          >
            <CalendarDays aria-hidden="true" size={15} />
          </button>
        </PdxPickerPopoverToggle>
      )}
    </div>
  );

  return (
    <PdxField
      className={mergeClassNames('PdxDatePicker', size, state, className)}
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
        className="PdxDatePickerPanel"
        control={control}
        label={panelLabel}
        onOpenChange={(nextOpen) => {
          if (nextOpen) openCalendar();
          else setOpen(false);
        }}
        onPanelOpenAutoFocus={(event) => {
          event.preventDefault();
          calendarRef.current?.focusActiveDay();
        }}
        open={open && canOpenCalendar}
      >
        <PdxCalendarPanel
          ref={calendarRef}
          focusedDate={focusedDate}
          max={max}
          min={min}
          onFocusedDateChange={setFocusedDate}
          onSelect={(isoDate) => {
            applyValue(isoDate);
            setOpen(false);
          }}
          rangeEnd={currentValue || undefined}
          rangeStart={currentValue || undefined}
        />
        <p className="PdxCalendarHint">
          Arrow keys move by day, PageUp and PageDown by month.
        </p>
      </PdxPickerPopover>
    </PdxField>
  );
}

export default PdxDatePicker;
