import './PdxDatePicker.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxDatePickerSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  value?: string;
  placeholder?: string;
  size?: 'Small' | 'Medium' | 'Large';
  state?: 'Default' | 'Error' | 'Warning' | 'Success';
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  name?: string;
  autoFocus?: boolean;
  showIcon?: boolean;
  onChange?: (value: string) => void;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

export interface PdxDatePickerProps
  extends PdxComponent,
    PdxDatePickerSpecificProps {}

function PdxDatePicker({
  label,
  description,
  message,
  value,
  placeholder,
  size = 'Medium',
  state = 'Default',
  disabled = false,
  readOnly = false,
  required = false,
  min,
  max,
  name,
  autoFocus = false,
  showIcon = true,
  onChange,
  onFocus,
  onBlur,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxDatePickerProps) {
  const fullClassName =
    `PdxDatePicker ${size} ${state} ${disabled ? 'Disabled' : ''} ${readOnly ? 'ReadOnly' : ''} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e.target.value);
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
      <div className="PdxDatePickerControl">
        <input
          className="PdxDatePickerInput"
          id={id}
          type="date"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          min={min}
          max={max}
          name={name}
          autoFocus={autoFocus}
          onChange={handleChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onClick={onClick}
        />
        {showIcon && (
          <span className="PdxDatePickerIcon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
          </span>
        )}
      </div>
      {message && <div className={`PdxFieldMessage ${state}`}>{message}</div>}
    </div>
  );
}

export default PdxDatePicker;
