import './PdxDateRangePicker.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxDateRangePickerSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  startValue?: string;
  endValue?: string;
  startPlaceholder?: string;
  endPlaceholder?: string;
  size?: 'Small' | 'Medium' | 'Large';
  state?: 'Default' | 'Error' | 'Warning' | 'Success';
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  name?: string;
  onChange?: (range: { start: string; end: string }) => void;
  onStartChange?: (value: string) => void;
  onEndChange?: (value: string) => void;
}

export interface PdxDateRangePickerProps
  extends PdxComponent,
    PdxDateRangePickerSpecificProps {}

function PdxDateRangePicker({
  label,
  description,
  message,
  startValue,
  endValue,
  startPlaceholder,
  endPlaceholder,
  size = 'Medium',
  state = 'Default',
  disabled = false,
  readOnly = false,
  required = false,
  min,
  max,
  name,
  onChange,
  onStartChange,
  onEndChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxDateRangePickerProps) {
  const fullClassName =
    `PdxDateRangePicker ${size} ${state} ${disabled ? 'Disabled' : ''} ${readOnly ? 'ReadOnly' : ''} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (onStartChange) {
      onStartChange(next);
    }
    if (onChange) {
      onChange({ start: next, end: endValue || '' });
    }
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (onEndChange) {
      onEndChange(next);
    }
    if (onChange) {
      onChange({ start: startValue || '', end: next });
    }
  };

  return (
    <div
      className={`PdxField ${fullClassName}`}
      style={style as React.CSSProperties}
      {...dataProps}
    >
      {label && (
        <div className="PdxFieldHeader">
          <label className="PdxFieldLabel" htmlFor={id}>
            {label}
          </label>
          {required && <span className="PdxFieldRequired">*</span>}
        </div>
      )}
      {description && <div className="PdxFieldDescription">{description}</div>}
      <div className="PdxDateRangePickerControls">
        <input
          className="PdxDateRangePickerInput"
          id={id}
          type="date"
          placeholder={startPlaceholder}
          value={startValue}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          min={min}
          max={max}
          name={name}
          onChange={handleStartChange}
        />
        <span className="PdxDateRangePickerSeparator">to</span>
        <input
          className="PdxDateRangePickerInput"
          type="date"
          placeholder={endPlaceholder}
          value={endValue}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          min={min}
          max={max}
          name={name}
          onChange={handleEndChange}
        />
      </div>
      {message && <div className={`PdxFieldMessage ${state}`}>{message}</div>}
    </div>
  );
}

export default PdxDateRangePicker;
