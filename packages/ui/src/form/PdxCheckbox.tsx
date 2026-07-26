import './PdxCheckbox.scss';
import {
  assignRef,
  getDataAttributes,
  mergeClassNames,
  type PdxControlSize,
  type PdxNativeProps,
  type PdxValidationState,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import { usePdxFieldIds } from './PdxField';
import { Check, Minus } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
  type ReactNode,
} from 'react';

export interface PdxCheckboxOwnProps {
  checked?: boolean;
  defaultChecked?: boolean;
  description?: ReactNode;
  indeterminate?: boolean;
  label?: ReactNode;
  message?: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
  size?: PdxControlSize;
  state?: PdxValidationState;
}

export type PdxCheckboxProps = Omit<
  PdxNativeProps<'input'>,
  'checked' | 'defaultChecked' | 'type'
> &
  PdxCheckboxOwnProps;

/**
 * A single checkbox. `PdxCheckList` owns multi-value selection; this owns the
 * one-box case that a form, a table header or an inspector row needs.
 *
 * `indeterminate` has no HTML attribute, so it is written to the DOM property.
 * Activation clears that property per the HTML activation behaviour, which is
 * why the change handler re-applies the prop: the caller stays the owner of
 * mixed state, not the browser.
 */
const PdxCheckbox = forwardRef<HTMLInputElement, PdxCheckboxProps>(
  function PdxCheckbox(
    {
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      checked,
      className,
      dataAttributes,
      defaultChecked = false,
      description,
      disabled = false,
      id,
      indeterminate = false,
      label,
      message,
      onChange,
      onCheckedChange,
      required = false,
      size = 'Medium',
      state = 'Default',
      ...rest
    },
    ref
  ) {
    const [isChecked, setIsChecked] = useControllableState({
      value: checked,
      defaultValue: defaultChecked,
      onChange: onCheckedChange,
    });
    const fieldIds = usePdxFieldIds({
      id,
      description,
      message,
      describedBy: ariaDescribedBy,
    });
    const inputRef = useRef<HTMLInputElement | null>(null);
    const setInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        assignRef(ref, node);
      },
      [ref]
    );

    useEffect(() => {
      if (inputRef.current) {
        inputRef.current.indeterminate = indeterminate;
      }
    });

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
      const nextChecked = event.currentTarget.checked;
      event.currentTarget.indeterminate = indeterminate;
      onChange?.(event);
      setIsChecked(nextChecked);
    };

    const hasFieldChrome = Boolean(label || description || message);
    const control = (
      <span
        className={mergeClassNames(
          'PdxCheckbox',
          size,
          state !== 'Default' && state,
          disabled && 'Disabled',
          !hasFieldChrome && className
        )}
      >
        <input
          {...rest}
          {...getDataAttributes(dataAttributes)}
          aria-describedby={fieldIds.describedBy}
          aria-invalid={ariaInvalid ?? (state === 'Error' || undefined)}
          checked={isChecked}
          className="PdxCheckboxInput"
          disabled={disabled}
          id={fieldIds.controlId}
          onChange={handleChange}
          ref={setInputRef}
          required={required}
          type="checkbox"
        />
        <span aria-hidden="true" className="PdxCheckboxBox">
          {indeterminate ? (
            <Minus className="PdxCheckboxGlyph" />
          ) : (
            isChecked && <Check className="PdxCheckboxGlyph" />
          )}
        </span>
      </span>
    );

    if (!hasFieldChrome) return control;

    // The description and the message sit outside the `<label>`: everything a
    // label contains becomes part of the control's accessible name, and a name
    // that swallows its own help text is unusable.
    return (
      <div
        className={mergeClassNames(
          'PdxField',
          'PdxCheckboxField',
          size,
          state !== 'Default' && state,
          className
        )}
      >
        <label
          className={mergeClassNames(
            'PdxCheckboxLabel',
            disabled && 'Disabled'
          )}
          htmlFor={fieldIds.controlId}
        >
          {control}
          {label && (
            <span className="PdxCheckboxTitle">
              {label}
              {required && (
                <span aria-hidden="true" className="PdxFieldRequired">
                  *
                </span>
              )}
            </span>
          )}
        </label>
        {description && (
          <div className="PdxCheckboxDescription" id={fieldIds.descriptionId}>
            {description}
          </div>
        )}
        {message && (
          <div
            className="PdxCheckboxMessage PdxFieldMessage"
            data-state={state}
            id={fieldIds.messageId}
            role={state === 'Error' ? 'alert' : 'status'}
          >
            {message}
          </div>
        )}
      </div>
    );
  }
);

export default PdxCheckbox;
