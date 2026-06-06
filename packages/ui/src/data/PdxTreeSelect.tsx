import './PdxTreeSelect.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useMemo, useState } from 'react';
import type React from 'react';

export interface PdxTreeSelectOption {
  id: string;
  label: string;
  children?: PdxTreeSelectOption[];
}

interface PdxTreeSelectSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  options: PdxTreeSelectOption[];
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange?: (value: string, option?: PdxTreeSelectOption) => void;
}

export interface PdxTreeSelectProps
  extends PdxComponent,
    PdxTreeSelectSpecificProps {}

const flattenOptions = (
  options: PdxTreeSelectOption[],
  depth = 0
): Array<{ option: PdxTreeSelectOption; depth: number }> => {
  return options.flatMap((option) => [
    { option, depth },
    ...(option.children ? flattenOptions(option.children, depth + 1) : []),
  ]);
};

function PdxTreeSelect({
  label,
  description,
  message,
  options,
  value,
  defaultValue,
  placeholder = 'Select item',
  disabled = false,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxTreeSelectProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || '');

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const currentValue = value !== undefined ? value : internalValue;
  const flatOptions = useMemo(() => flattenOptions(options), [options]);

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value;
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    const selected = flatOptions.find(
      (item) => item.option.id === nextValue
    )?.option;
    if (onChange) {
      onChange(nextValue, selected);
    }
  };

  const fullClassName =
    `PdxTreeSelect ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();
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
        className="PdxTreeSelectControl"
        disabled={disabled}
        value={currentValue}
        onChange={handleChange}
      >
        {/* Keep empty value selectable state without showing it in the dropdown list. */}
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {flatOptions.map(({ option, depth }) => {
          const prefix = depth > 0 ? `${'-'.repeat(depth)} ` : '';
          return (
            <option key={option.id} value={option.id}>
              {`${prefix}${option.label}`}
            </option>
          );
        })}
      </select>
      {message && <div className="PdxFieldMessage">{message}</div>}
    </div>
  );
}

export default PdxTreeSelect;
