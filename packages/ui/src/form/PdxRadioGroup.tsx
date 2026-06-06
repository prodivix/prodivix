import './PdxRadioGroup.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useId, useState } from 'react';
import type React from 'react';

export interface PdxRadioOption {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

interface PdxRadioGroupSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  options: PdxRadioOption[];
  value?: string;
  defaultValue?: string;
  name?: string;
  layout?: 'Vertical' | 'Horizontal';
  disabled?: boolean;
  onChange?: (value: string) => void;
}

export interface PdxRadioGroupProps
  extends PdxComponent,
    PdxRadioGroupSpecificProps {}

function PdxRadioGroup({
  label,
  description,
  message,
  options,
  value,
  defaultValue,
  name,
  layout = 'Vertical',
  disabled = false,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxRadioGroupProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const fallbackName = useId();

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const currentValue = value !== undefined ? value : internalValue;
  const groupName = name || `prodivix-radio-${fallbackName}`;

  const handleChange = (nextValue: string) => {
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    if (onChange) {
      onChange(nextValue);
    }
  };

  const fullClassName =
    `PdxRadioGroup ${layout} ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();
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
      <ul className="PdxRadioGroupList">
        {options.map((option) => {
          const isDisabled = disabled || option.disabled;
          return (
            <li key={option.value} className="PdxRadioGroupItem">
              <label
                className={`PdxRadioGroupLabel ${isDisabled ? 'Disabled' : ''}`}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={option.value}
                  checked={currentValue === option.value}
                  disabled={isDisabled}
                  onChange={() => handleChange(option.value)}
                />
                <span className="PdxRadioGroupText">
                  <span>{option.label}</span>
                  {option.description && (
                    <span className="PdxRadioGroupDescription">
                      {option.description}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {message && <div className="PdxFieldMessage">{message}</div>}
    </div>
  );
}

export default PdxRadioGroup;
