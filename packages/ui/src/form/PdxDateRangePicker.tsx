import './PdxDateRangePicker.scss';
import { CalendarRange } from 'lucide-react';
import { useRef, useState } from 'react';
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

interface PdxDateRangePickerSpecificProps {
  description?: string;
  disabled?: boolean;
  endPlaceholder?: string;
  endValue?: string;
  label?: string;
  max?: string;
  message?: string;
  min?: string;
  name?: string;
  onChange?: (range: { start: string; end: string }) => void;
  onEndChange?: (value: string) => void;
  onStartChange?: (value: string) => void;
  readOnly?: boolean;
  required?: boolean;
  size?: 'Small' | 'Medium' | 'Large';
  startPlaceholder?: string;
  startValue?: string;
  state?: PdxValidationState;
}

export interface PdxDateRangePickerProps
  extends PdxComponent, PdxDateRangePickerSpecificProps {}

/**
 * Either field may receive either end of the range; the control keeps them in
 * order rather than rejecting the entry, so an edit is never silently lost.
 */
const orderRange = (first: string, second: string) =>
  first && second && second < first
    ? { end: first, start: second }
    : { end: second, start: first };

/**
 * A date range built from the same month grid and the same typed date field as
 * `PdxDatePicker`.
 *
 * The only behaviour it adds is the two-step selection: the first day in the
 * panel opens a range, the second closes it, and picking them out of order
 * still produces an ordered range.
 */
function PdxDateRangePicker({
  className,
  dataAttributes = {},
  description,
  disabled = false,
  endPlaceholder,
  endValue,
  id,
  label,
  max,
  message,
  min,
  name,
  onChange,
  onEndChange,
  onStartChange,
  readOnly = false,
  required = false,
  size = 'Medium',
  startPlaceholder,
  startValue,
  state = 'Default',
  style,
}: PdxDateRangePickerProps) {
  const [start, setStart] = useControllableState({
    value: startValue,
    defaultValue: '',
  });
  const [end, setEnd] = useControllableState({
    value: endValue,
    defaultValue: '',
  });
  const [open, setOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<string | undefined>(
    undefined
  );
  const [focusedDate, setFocusedDate] = useState(
    () => start || clampIsoDate(todayIsoDate(), min, max)
  );
  const calendarRef = useRef<PdxCalendarPanelHandle>(null);
  const fieldIds = usePdxFieldIds({ id, description, message });

  const applyRange = (nextStart: string, nextEnd: string) => {
    if (nextStart !== start) {
      setStart(nextStart);
      onStartChange?.(nextStart);
    }
    if (nextEnd !== end) {
      setEnd(nextEnd);
      onEndChange?.(nextEnd);
    }
    onChange?.({ start: nextStart, end: nextEnd });
    if (nextStart) setFocusedDate(nextStart);
  };

  const handleStartChange = (nextStart: string) => {
    const ordered = orderRange(nextStart, end);
    applyRange(ordered.start, ordered.end);
  };

  const handleEndChange = (nextEnd: string) => {
    const ordered = orderRange(start, nextEnd);
    applyRange(ordered.start, ordered.end);
  };

  const handleCalendarSelect = (isoDate: string) => {
    if (!pendingStart) {
      setPendingStart(isoDate);
      applyRange(isoDate, '');
      return;
    }

    const ordered = orderRange(pendingStart, isoDate);

    setPendingStart(undefined);
    applyRange(ordered.start, ordered.end);
    setOpen(false);
  };

  const openCalendar = () => {
    setPendingStart(undefined);
    setFocusedDate(start || clampIsoDate(todayIsoDate(), min, max));
    setOpen(true);
  };

  const rangeSummary = () => {
    if (pendingStart) return 'Select the end date';
    if (start && end) {
      return `${formatCalendarDayLabel(start)} to ${formatCalendarDayLabel(end)}`;
    }
    if (start) return `${formatCalendarDayLabel(start)} selected`;

    return 'Select the start date';
  };

  const panelLabel = label ? `${label} calendar` : 'Date range calendar';
  const startLabel = label ? `${label} start date` : 'Start date';
  const endLabel = label ? `${label} end date` : 'End date';

  const control = (
    <div
      className="PdxPickerControl PdxDateRangePickerControl"
      data-disabled={disabled ? 'true' : undefined}
      data-readonly={readOnly ? 'true' : undefined}
    >
      <PdxIsoDateField
        aria-describedby={fieldIds.describedBy}
        aria-label={startLabel}
        disabled={disabled}
        id={fieldIds.controlId}
        invalid={state === 'Error'}
        max={max}
        min={min}
        name={name}
        onRequestPanel={openCalendar}
        onValueChange={handleStartChange}
        placeholder={startPlaceholder}
        readOnly={readOnly}
        required={required}
        value={start}
      />
      <span aria-hidden="true" className="PdxDateRangePickerSeparator">
        to
      </span>
      <PdxIsoDateField
        aria-describedby={fieldIds.describedBy}
        aria-label={endLabel}
        disabled={disabled}
        invalid={state === 'Error'}
        max={max}
        min={min}
        onRequestPanel={openCalendar}
        onValueChange={handleEndChange}
        placeholder={endPlaceholder}
        readOnly={readOnly}
        required={required}
        value={end}
      />
      <PdxPickerPopoverToggle asChild>
        <button
          aria-label={`Choose date range, ${rangeSummary()}`}
          className="PdxPickerToggle"
          disabled={disabled || readOnly}
          type="button"
        >
          <CalendarRange aria-hidden="true" size={15} />
        </button>
      </PdxPickerPopoverToggle>
    </div>
  );

  return (
    <PdxField
      className={mergeClassNames('PdxDateRangePicker', size, state, className)}
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
        className="PdxDateRangePickerPanel"
        control={control}
        label={panelLabel}
        onOpenChange={(nextOpen) => {
          if (nextOpen) openCalendar();
          else {
            setPendingStart(undefined);
            setOpen(false);
          }
        }}
        onPanelOpenAutoFocus={(event) => {
          event.preventDefault();
          calendarRef.current?.focusActiveDay();
        }}
        open={open && !disabled && !readOnly}
      >
        <PdxCalendarPanel
          ref={calendarRef}
          focusedDate={focusedDate}
          max={max}
          min={min}
          onFocusedDateChange={setFocusedDate}
          onSelect={handleCalendarSelect}
          rangeEnd={end || undefined}
          rangeStart={start || undefined}
        />
        <p className="PdxCalendarHint" role="status">
          {rangeSummary()}
        </p>
      </PdxPickerPopover>
    </PdxField>
  );
}

export default PdxDateRangePicker;
