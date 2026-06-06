import './PdxRange.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';

export interface PdxRangeValue {
  min: number;
  max: number;
}

interface PdxRangeSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  min?: number;
  max?: number;
  step?: number;
  value?: PdxRangeValue;
  defaultValue?: PdxRangeValue;
  disabled?: boolean;
  showValue?: boolean;
  onChange?: (value: PdxRangeValue) => void;
}

export interface PdxRangeProps extends PdxComponent, PdxRangeSpecificProps {}

function PdxRange({
  label,
  description,
  message,
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue,
  disabled = false,
  showValue = true,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxRangeProps) {
  const [internalValue, setInternalValue] = useState<PdxRangeValue>(
    defaultValue || { min, max }
  );

  useEffect(() => {
    if (value) {
      setInternalValue(value);
    }
  }, [value?.min, value?.max]);

  const currentValue = value || internalValue;

  const updateValue = (nextValue: PdxRangeValue) => {
    if (!value) {
      setInternalValue(nextValue);
    }
    if (onChange) {
      onChange(nextValue);
    }
  };

  const handleMinChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextMin = Math.min(Number(event.target.value), currentValue.max);
    updateValue({ min: nextMin, max: currentValue.max });
  };

  const handleMaxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextMax = Math.max(Number(event.target.value), currentValue.min);
    updateValue({ min: currentValue.min, max: nextMax });
  };

  const trackStyle = useMemo(() => {
    const range = max - min || 1;
    const startPercent = ((currentValue.min - min) / range) * 100;
    const endPercent = ((currentValue.max - min) / range) * 100;
    return {
      '--range-start': `${startPercent}%`,
      '--range-end': `${endPercent}%`,
    } as React.CSSProperties;
  }, [currentValue.min, currentValue.max, min, max]);

  const fullClassName =
    `PdxRange ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();
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
          {showValue && (
            <span className="PdxRangeValue">
              {currentValue.min} - {currentValue.max}
            </span>
          )}
        </div>
      )}
      {description && <div className="PdxFieldDescription">{description}</div>}
      <div className="PdxRangeTrack" style={trackStyle}>
        <input
          className="PdxRangeInput"
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentValue.min}
          disabled={disabled}
          onChange={handleMinChange}
        />
        <input
          className="PdxRangeInput"
          type="range"
          min={min}
          max={max}
          step={step}
          value={currentValue.max}
          disabled={disabled}
          onChange={handleMaxChange}
        />
      </div>
      {message && <div className="PdxFieldMessage">{message}</div>}
    </div>
  );
}

export default PdxRange;
