import './PdxCheckList.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useState } from 'react';
import type React from 'react';

export interface PdxCheckListItem {
  label: string;
  value: string;
  checked?: boolean;
  disabled?: boolean;
}

interface PdxCheckListSpecificProps {
  items: PdxCheckListItem[];
  value?: string[];
  defaultValue?: string[];
  onChange?: (values: string[]) => void;
}

export interface PdxCheckListProps
  extends PdxComponent,
    PdxCheckListSpecificProps {}

function PdxCheckList({
  items,
  value,
  defaultValue,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxCheckListProps) {
  const [internalValue, setInternalValue] = useState<string[]>(
    defaultValue || []
  );

  useEffect(() => {
    if (value) {
      setInternalValue(value);
    }
  }, [value]);

  const selectedValues = value || internalValue;

  const toggleValue = (itemValue: string) => {
    const exists = selectedValues.includes(itemValue);
    const nextValues = exists
      ? selectedValues.filter((val) => val !== itemValue)
      : [...selectedValues, itemValue];

    if (!value) {
      setInternalValue(nextValues);
    }
    if (onChange) {
      onChange(nextValues);
    }
  };

  const fullClassName = `PdxCheckList ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <ul
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {items.map((item) => {
        const checked = selectedValues.includes(item.value) || item.checked;
        return (
          <li key={item.value} className="PdxCheckListItem">
            <label
              className={`PdxCheckListLabel ${item.disabled ? 'Disabled' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={item.disabled}
                onChange={() => toggleValue(item.value)}
              />
              <span>{item.label}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export default PdxCheckList;
