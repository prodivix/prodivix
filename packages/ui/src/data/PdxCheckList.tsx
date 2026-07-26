import './PdxCheckList.scss';
import PdxEmpty from '../feedback/PdxEmpty';
import {
  getDataAttributes,
  mergeClassNames,
  type PdxValidationState,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import { type PdxComponent } from '@prodivix/shared';
import { useId, type ReactNode } from 'react';
import type React from 'react';
import { rowDensityAttribute, type PdxRowSize } from './rowSurface';

export interface PdxCheckListItem {
  checked?: boolean;
  disabled?: boolean;
  label: string;
  value: string;
}

interface PdxCheckListSpecificProps {
  defaultValue?: string[];
  description?: React.ReactNode;
  disabled?: boolean;
  emptyState?: ReactNode;
  emptyText?: ReactNode;
  items: PdxCheckListItem[];
  label?: React.ReactNode;
  message?: React.ReactNode;
  onChange?: (values: string[]) => void;
  orientation?: 'Vertical' | 'Horizontal';
  required?: boolean;
  size?: PdxRowSize;
  state?: PdxValidationState;
  value?: string[];
}

export interface PdxCheckListProps
  extends PdxComponent, PdxCheckListSpecificProps {}

/**
 * A group of checkboxes is still a list of rows a user points at, so it shares
 * the row treatment with Table, DataGrid and List. The keyboard contract is the
 * native one — every checkbox is its own tab stop, toggled with Space — because
 * a roving tabindex would take reachability away rather than add it.
 */
function PdxCheckList({
  className,
  dataAttributes = {},
  defaultValue,
  description,
  disabled = false,
  emptyState,
  emptyText = 'No options',
  id,
  items,
  label,
  message,
  onChange,
  orientation = 'Vertical',
  required = false,
  size = 'Medium',
  state = 'Default',
  style,
  value,
}: PdxCheckListProps) {
  const generatedId = useId().replaceAll(':', '');
  const fieldId = id ?? `pdx-check-list-${generatedId}`;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const messageId = message ? `${fieldId}-message` : undefined;
  const initialValue =
    defaultValue ??
    items.filter((item) => item.checked).map((item) => item.value);
  const [selectedValues, setSelectedValues] = useControllableState({
    value,
    defaultValue: initialValue,
    onChange,
  });

  const toggleValue = (item: PdxCheckListItem) => {
    if (disabled || item.disabled) return;
    const itemValue = item.value;
    const exists = selectedValues.includes(itemValue);
    const nextValues = exists
      ? selectedValues.filter((val) => val !== itemValue)
      : [...selectedValues, itemValue];

    setSelectedValues(nextValues);
  };

  const describedBy =
    [descriptionId, messageId].filter(Boolean).join(' ') || undefined;
  const fullClassName = mergeClassNames(
    'PdxField',
    'PdxCheckList',
    orientation,
    state,
    disabled && 'Disabled',
    className
  );

  return (
    <fieldset
      {...(rowDensityAttribute(size)
        ? { 'data-pdx-density': rowDensityAttribute(size) }
        : {})}
      {...getDataAttributes(dataAttributes)}
      aria-describedby={describedBy}
      className={fullClassName}
      disabled={disabled}
      id={fieldId}
      style={style as React.CSSProperties}
    >
      {label && (
        <legend className="PdxCheckListLegend">
          <span className="PdxFieldLabel">{label}</span>
          {required && (
            <span className="PdxFieldRequired" aria-hidden="true">
              *
            </span>
          )}
        </legend>
      )}
      {description && (
        <div className="PdxFieldDescription" id={descriptionId}>
          {description}
        </div>
      )}
      {items.length === 0 ? (
        (emptyState ?? <PdxEmpty size="Small" title={emptyText} />)
      ) : (
        <ul className="PdxCheckListItems">
          {items.map((item) => {
            const checked = selectedValues.includes(item.value);
            return (
              <li key={item.value} className="PdxCheckListItem">
                <label className="PdxCheckListLabel">
                  <input
                    aria-invalid={state === 'Error' || undefined}
                    checked={checked}
                    disabled={item.disabled}
                    name={fieldId}
                    onChange={() => toggleValue(item)}
                    type="checkbox"
                    value={item.value}
                  />
                  <span>{item.label}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {message && (
        <div
          className="PdxFieldMessage"
          data-state={state}
          id={messageId}
          role={state === 'Error' ? 'alert' : 'status'}
        >
          {message}
        </div>
      )}
    </fieldset>
  );
}

export default PdxCheckList;
