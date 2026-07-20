import './PdxSelect.scss';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';
import {
  mergeClassNames,
  type PdxControlSize,
  type PdxDataAttributeProps,
  type PdxValidationState,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import PdxField, { usePdxFieldIds } from './PdxField';

export interface PdxSelectOption {
  disabled?: boolean;
  label: string;
  value: string;
}

export interface PdxSelectOwnProps extends PdxDataAttributeProps {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling';
  'aria-label'?: string;
  className?: string;
  contentClassName?: string;
  controlClassName?: string;
  defaultValue?: string;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  label?: ReactNode;
  message?: ReactNode;
  name?: string;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  onValueChange?: (value: string, option?: PdxSelectOption) => void;
  options: PdxSelectOption[];
  placeholder?: string;
  required?: boolean;
  size?: PdxControlSize;
  state?: PdxValidationState;
  style?: React.CSSProperties;
  title?: string;
  value?: string;
}

export type PdxSelectProps = PdxSelectOwnProps;

const PdxSelect = forwardRef<HTMLButtonElement, PdxSelectProps>(
  function PdxSelect(
    {
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      'aria-label': ariaLabel,
      className,
      contentClassName,
      controlClassName,
      dataAttributes,
      defaultValue = '',
      description,
      disabled = false,
      id,
      label,
      message,
      name,
      onBlur,
      onFocus,
      onValueChange,
      options,
      placeholder = 'Select item',
      required = false,
      size = 'Medium',
      state = 'Default',
      style,
      title,
      value,
    },
    ref
  ) {
    const [currentValue, setCurrentValue] = useControllableState({
      value,
      defaultValue,
    });
    const fieldIds = usePdxFieldIds({
      id,
      description,
      message,
      describedBy: ariaDescribedBy,
    });

    return (
      <PdxField
        className={mergeClassNames('PdxSelect', size, className)}
        controlId={fieldIds.controlId}
        dataAttributes={dataAttributes}
        description={description}
        descriptionId={fieldIds.descriptionId}
        label={label}
        message={message}
        messageId={fieldIds.messageId}
        required={required}
        state={state}
        style={style}
      >
        <SelectPrimitive.Root
          disabled={disabled}
          name={name}
          onValueChange={(nextValue) => {
            const option = options.find((item) => item.value === nextValue);
            setCurrentValue(nextValue);
            onValueChange?.(nextValue, option);
          }}
          required={required}
          value={currentValue}
        >
          <SelectPrimitive.Trigger
            ref={ref}
            id={fieldIds.controlId}
            className={mergeClassNames(
              'PdxSelectControl',
              state !== 'Default' && state,
              controlClassName
            )}
            aria-describedby={fieldIds.describedBy}
            aria-invalid={ariaInvalid ?? (state === 'Error' || undefined)}
            aria-label={ariaLabel}
            onBlur={onBlur}
            onFocus={onFocus}
            title={title}
          >
            <SelectPrimitive.Value placeholder={placeholder} />
            <SelectPrimitive.Icon asChild>
              <ChevronDown
                className="PdxSelectIndicator"
                aria-hidden="true"
                size={14}
              />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>

          <SelectPrimitive.Portal>
            <SelectPrimitive.Content
              className={mergeClassNames('PdxSelectContent', contentClassName)}
              collisionPadding={8}
              position="popper"
              sideOffset={6}
            >
              <SelectPrimitive.ScrollUpButton className="PdxSelectScrollButton">
                <ChevronUp size={13} aria-hidden="true" />
              </SelectPrimitive.ScrollUpButton>
              <SelectPrimitive.Viewport className="PdxSelectViewport">
                {options.map((option) => (
                  <SelectPrimitive.Item
                    key={option.value}
                    className="PdxSelectItem"
                    disabled={option.disabled}
                    value={option.value}
                  >
                    <SelectPrimitive.ItemText>
                      {option.label}
                    </SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator className="PdxSelectItemIndicator">
                      <Check size={13} aria-hidden="true" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.Viewport>
              <SelectPrimitive.ScrollDownButton className="PdxSelectScrollButton">
                <ChevronDown size={13} aria-hidden="true" />
              </SelectPrimitive.ScrollDownButton>
            </SelectPrimitive.Content>
          </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
      </PdxField>
    );
  }
);

export default PdxSelect;
