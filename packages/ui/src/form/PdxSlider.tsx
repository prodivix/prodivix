import './PdxSlider.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useState } from 'react';
import type React from 'react';

interface PdxSliderSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: number;
  defaultValue?: number;
  size?: 'Small' | 'Medium' | 'Large';
  disabled?: boolean;
  showValue?: boolean;
  onChange?: (value: number) => void;
}

export interface PdxSliderProps extends PdxComponent, PdxSliderSpecificProps {}

function PdxSlider({
  label,
  description,
  message,
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue,
  size = 'Medium',
  disabled = false,
  showValue = true,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxSliderProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? min);

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const currentValue = value !== undefined ? value : internalValue;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number(event.target.value);
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    if (onChange) {
      onChange(nextValue);
    }
  };

  const fullClassName =
    `PdxSlider ${size} ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();
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
          {showValue && <span className="PdxSliderValue">{currentValue}</span>}
        </div>
      )}
      {description && <div className="PdxFieldDescription">{description}</div>}
      <input
        className="PdxSliderInput"
        type="range"
        min={min}
        max={max}
        step={step}
        value={currentValue}
        disabled={disabled}
        onChange={handleChange}
      />
      {message && <div className="PdxFieldMessage">{message}</div>}
    </div>
  );
}

export default PdxSlider;
