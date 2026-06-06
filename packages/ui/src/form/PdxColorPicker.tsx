import './PdxColorPicker.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useState } from 'react';
import type React from 'react';

interface PdxColorPickerSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  value?: string;
  defaultValue?: string;
  size?: 'Small' | 'Medium' | 'Large';
  disabled?: boolean;
  showTextInput?: boolean;
  onChange?: (value: string) => void;
}

export interface PdxColorPickerProps
  extends PdxComponent,
    PdxColorPickerSpecificProps {}

const normalizeColor = (value: string) => {
  if (!value) return '#000000';
  return value.startsWith('#') ? value : `#${value}`;
};

function PdxColorPicker({
  label,
  description,
  message,
  value,
  defaultValue = '#3f3f3f',
  size = 'Medium',
  disabled = false,
  showTextInput = true,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxColorPickerProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const currentValue = value !== undefined ? value : internalValue;

  const handleChange = (nextValue: string) => {
    const normalized = normalizeColor(nextValue);
    if (value === undefined) {
      setInternalValue(normalized);
    }
    if (onChange) {
      onChange(normalized);
    }
  };

  const fullClassName =
    `PdxColorPicker ${size} ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();
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
      <div className="PdxColorPickerControls">
        <input
          className="PdxColorPickerInput"
          type="color"
          value={normalizeColor(currentValue)}
          disabled={disabled}
          onChange={(event) => handleChange(event.target.value)}
        />
        {showTextInput && (
          <input
            className="PdxColorPickerText"
            type="text"
            value={normalizeColor(currentValue)}
            disabled={disabled}
            onChange={(event) => handleChange(event.target.value)}
          />
        )}
        <span
          className="PdxColorPickerSwatch"
          style={{ backgroundColor: normalizeColor(currentValue) }}
        />
      </div>
      {message && <div className="PdxFieldMessage">{message}</div>}
    </div>
  );
}

export default PdxColorPicker;
