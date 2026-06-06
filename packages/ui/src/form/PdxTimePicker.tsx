import './PdxTimePicker.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxTimePickerSpecificProps {
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

export interface PdxTimePickerProps
  extends PdxComponent,
    PdxTimePickerSpecificProps {}

function PdxTimePicker({
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
}: PdxTimePickerProps) {
  const fullClassName =
    `PdxTimePicker ${size} ${state} ${disabled ? 'Disabled' : ''} ${readOnly ? 'ReadOnly' : ''} ${className || ''}`.trim();
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
      <div className="PdxTimePickerControl">
        <input
          className="PdxTimePickerInput"
          id={id}
          type="time"
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
          <span className="PdxTimePickerIcon">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v6l4 2" />
            </svg>
          </span>
        )}
      </div>
      {message && <div className={`PdxFieldMessage ${state}`}>{message}</div>}
    </div>
  );
}

export default PdxTimePicker;
