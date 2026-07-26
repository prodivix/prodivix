import './PdxRegionPicker.scss';
import { useState } from 'react';
import type React from 'react';
import { type PdxComponent } from '@prodivix/shared';
import {
  mergeClassNames,
  type PdxValidationState,
} from '../foundation/component';
import PdxField, { usePdxFieldIds } from './PdxField';
import PdxSelect, { type PdxSelectOption } from './PdxSelect';

export interface PdxRegionOption {
  children?: PdxRegionOption[];
  label: string;
  value: string;
}

export interface PdxRegionValue {
  city?: string;
  district?: string;
  province?: string;
}

interface PdxRegionPickerSpecificProps {
  defaultValue?: PdxRegionValue;
  description?: string;
  disabled?: boolean;
  label?: string;
  message?: string;
  onChange?: (value: PdxRegionValue, labels: PdxRegionValue) => void;
  options: PdxRegionOption[];
  placeholder?: {
    city?: string;
    district?: string;
    province?: string;
  };
  required?: boolean;
  size?: 'Small' | 'Medium' | 'Large';
  state?: PdxValidationState;
  value?: PdxRegionValue;
}

export interface PdxRegionPickerProps
  extends PdxComponent, PdxRegionPickerSpecificProps {}

const toSelectOptions = (
  options: PdxRegionOption[],
  placeholder: string
): PdxSelectOption[] => [
  { label: placeholder, value: '' },
  ...options.map((option) => ({ label: option.label, value: option.value })),
];

/**
 * Three dependent selects rather than a private cascade widget.
 *
 * Region is a chain of choices, and `PdxSelect` already answers what a choice
 * has to do — typeahead, roving keyboard, an announced current value. Building
 * a second option list here would only mean two places to keep correct.
 */
function PdxRegionPicker({
  className,
  dataAttributes = {},
  defaultValue,
  description,
  disabled = false,
  id,
  label,
  message,
  onChange,
  options,
  placeholder,
  required = false,
  size = 'Medium',
  state = 'Default',
  style,
  value,
}: PdxRegionPickerProps) {
  const [internalValue, setInternalValue] = useState<PdxRegionValue>(
    defaultValue ?? {}
  );
  const fieldIds = usePdxFieldIds({ id, description, message });
  const currentValue = value ?? internalValue;

  const selectedProvince = options.find(
    (option) => option.value === currentValue.province
  );
  const cities = selectedProvince?.children ?? [];
  const selectedCity = cities.find(
    (option) => option.value === currentValue.city
  );
  const districts = selectedCity?.children ?? [];

  const resolveLabels = (next: PdxRegionValue): PdxRegionValue => {
    const province = options.find((option) => option.value === next.province);
    const city = province?.children?.find(
      (option) => option.value === next.city
    );
    const district = city?.children?.find(
      (option) => option.value === next.district
    );

    return {
      city: city?.label,
      district: district?.label,
      province: province?.label,
    };
  };

  const emitChange = (next: PdxRegionValue) => {
    if (value === undefined) setInternalValue(next);
    onChange?.(next, resolveLabels(next));
  };

  const groupLabel = label ?? 'Region';
  const provincePlaceholder = placeholder?.province ?? 'Province';
  const cityPlaceholder = placeholder?.city ?? 'City';
  const districtPlaceholder = placeholder?.district ?? 'District';

  return (
    <PdxField
      className={mergeClassNames('PdxRegionPicker', size, state, className)}
      controlId={fieldIds.controlId}
      dataAttributes={dataAttributes}
      description={description}
      descriptionId={fieldIds.descriptionId}
      label={label}
      message={message}
      messageId={fieldIds.messageId}
      required={required}
      state={state}
      style={style as React.CSSProperties}
    >
      <div className="PdxRegionPickerControls">
        <PdxSelect
          aria-describedby={fieldIds.describedBy}
          aria-label={`${groupLabel} province`}
          disabled={disabled}
          id={fieldIds.controlId}
          onValueChange={(province) => {
            emitChange({
              city: undefined,
              district: undefined,
              province: province || undefined,
            });
          }}
          options={toSelectOptions(options, provincePlaceholder)}
          placeholder={provincePlaceholder}
          size={size}
          state={state}
          value={currentValue.province ?? ''}
        />
        <PdxSelect
          aria-label={`${groupLabel} city`}
          disabled={disabled || !currentValue.province}
          onValueChange={(city) => {
            emitChange({
              city: city || undefined,
              district: undefined,
              province: currentValue.province,
            });
          }}
          options={toSelectOptions(cities, cityPlaceholder)}
          placeholder={cityPlaceholder}
          size={size}
          state={state}
          value={currentValue.city ?? ''}
        />
        <PdxSelect
          aria-label={`${groupLabel} district`}
          disabled={disabled || !currentValue.city}
          onValueChange={(district) => {
            emitChange({
              city: currentValue.city,
              district: district || undefined,
              province: currentValue.province,
            });
          }}
          options={toSelectOptions(districts, districtPlaceholder)}
          placeholder={districtPlaceholder}
          size={size}
          state={state}
          value={currentValue.district ?? ''}
        />
      </div>
    </PdxField>
  );
}

export default PdxRegionPicker;
