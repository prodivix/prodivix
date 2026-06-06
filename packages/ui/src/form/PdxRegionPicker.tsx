import './PdxRegionPicker.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useState } from 'react';
import type React from 'react';

export interface PdxRegionOption {
  label: string;
  value: string;
  children?: PdxRegionOption[];
}

export interface PdxRegionValue {
  province?: string;
  city?: string;
  district?: string;
}

interface PdxRegionPickerSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  size?: 'Small' | 'Medium' | 'Large';
  state?: 'Default' | 'Error' | 'Warning' | 'Success';
  disabled?: boolean;
  required?: boolean;
  options: PdxRegionOption[];
  value?: PdxRegionValue;
  defaultValue?: PdxRegionValue;
  placeholder?: {
    province?: string;
    city?: string;
    district?: string;
  };
  onChange?: (value: PdxRegionValue, labels: PdxRegionValue) => void;
}

export interface PdxRegionPickerProps
  extends PdxComponent,
    PdxRegionPickerSpecificProps {}

const findLabel = (options: PdxRegionOption[], value?: string) => {
  if (!value) return undefined;
  return options.find((option) => option.value === value)?.label;
};

function PdxRegionPicker({
  label,
  description,
  message,
  size = 'Medium',
  state = 'Default',
  disabled = false,
  required = false,
  options,
  value,
  defaultValue,
  placeholder,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxRegionPickerProps) {
  const [internalValue, setInternalValue] = useState<PdxRegionValue>(
    defaultValue || {}
  );

  useEffect(() => {
    if (value) {
      setInternalValue(value);
    }
  }, [value?.province, value?.city, value?.district]);

  const currentValue = value || internalValue;

  const provinces = options;
  const selectedProvince = provinces.find(
    (item) => item.value === currentValue.province
  );
  const cities = selectedProvince?.children || [];
  const selectedCity = cities.find((item) => item.value === currentValue.city);
  const districts = selectedCity?.children || [];

  const emitChange = (nextValue: PdxRegionValue) => {
    const labels: PdxRegionValue = {
      province: findLabel(provinces, nextValue.province),
      city: findLabel(cities, nextValue.city),
      district: findLabel(districts, nextValue.district),
    };

    if (!value) {
      setInternalValue(nextValue);
    }
    if (onChange) {
      onChange(nextValue, labels);
    }
  };

  const handleProvinceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const province = e.target.value || undefined;
    emitChange({ province, city: undefined, district: undefined });
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const city = e.target.value || undefined;
    emitChange({
      province: currentValue.province,
      city,
      district: undefined,
    });
  };

  const handleDistrictChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const district = e.target.value || undefined;
    emitChange({
      province: currentValue.province,
      city: currentValue.city,
      district,
    });
  };

  const fullClassName =
    `PdxRegionPicker ${size} ${state} ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();
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
          {required && <span className="PdxFieldRequired">*</span>}
        </div>
      )}
      {description && <div className="PdxFieldDescription">{description}</div>}
      <div className="PdxRegionPickerControls">
        <select
          className="PdxRegionPickerSelect"
          disabled={disabled}
          value={currentValue.province || ''}
          onChange={handleProvinceChange}
        >
          <option value="">{placeholder?.province || 'Province'}</option>
          {provinces.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="PdxRegionPickerSelect"
          disabled={disabled || !currentValue.province}
          value={currentValue.city || ''}
          onChange={handleCityChange}
        >
          <option value="">{placeholder?.city || 'City'}</option>
          {cities.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="PdxRegionPickerSelect"
          disabled={disabled || !currentValue.city}
          value={currentValue.district || ''}
          onChange={handleDistrictChange}
        >
          <option value="">{placeholder?.district || 'District'}</option>
          {districts.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {message && <div className={`PdxFieldMessage ${state}`}>{message}</div>}
    </div>
  );
}

export default PdxRegionPicker;
