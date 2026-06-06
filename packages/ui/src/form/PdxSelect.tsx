import './PdxSelect.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useState } from 'react';
import type React from 'react';

export interface PdxSelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

interface PdxSelectSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  options: PdxSelectOption[];
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  size?: 'Small' | 'Medium' | 'Large';
  disabled?: boolean;
  onChange?: (value: string, option?: PdxSelectOption) => void;
}

export interface PdxSelectProps extends PdxComponent, PdxSelectSpecificProps {}

function PdxSelect({
  label,
  description,
  message,
  options,
  value,
  defaultValue,
  placeholder = 'Select item',
  size = 'Medium',
  disabled = false,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxSelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || '');

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const currentValue = value !== undefined ? value : internalValue;

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    const selected = options.find((option) => option.value === nextValue);
    if (onChange) {
      onChange(nextValue, selected);
    }
  };

  const fullClassName =
    `PdxSelect ${size} ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={`PdxField ${fullClassName}`}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {label && (
        <div className="PdxFieldHeader">
          <label className="PdxFieldLabel">{label}</label>
        </div>
      )}
      {description && <div className="PdxFieldDescription">{description}</div>}
      <select
        className="PdxSelectControl"
        disabled={disabled}
        value={currentValue}
        onChange={handleChange}
      >
        {/* Keep empty value selectable state without showing it in the dropdown list. */}
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
      {message && <div className="PdxFieldMessage">{message}</div>}
    </div>
  );
}

export default PdxSelect;
