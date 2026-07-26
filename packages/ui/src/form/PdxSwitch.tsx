import './PdxSwitch.scss';
import {
  getDataAttributes,
  mergeClassNames,
  type PdxControlSize,
  type PdxNativeProps,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import { usePdxFieldIds } from './PdxField';
import { forwardRef, type MouseEvent, type ReactNode } from 'react';

export interface PdxSwitchOwnProps {
  checked?: boolean;
  defaultChecked?: boolean;
  description?: ReactNode;
  label?: ReactNode;
  labelPosition?: 'Start' | 'End';
  onCheckedChange?: (checked: boolean) => void;
  size?: PdxControlSize;
}

export type PdxSwitchProps = Omit<
  PdxNativeProps<'button'>,
  'aria-checked' | 'defaultChecked' | 'role' | 'type' | 'value'
> &
  PdxSwitchOwnProps;

/**
 * An immediate on/off control. It renders a real `<button role="switch">`, so
 * Space and Enter toggle it without a hand-written key handler and focus order
 * stays native.
 *
 * The on and off states are carried by three independent signals — thumb
 * position, the bar/ring marks on the track, and surface inversion — because a
 * switch that only changes colour is unreadable to a large share of users.
 */
const PdxSwitch = forwardRef<HTMLButtonElement, PdxSwitchProps>(
  function PdxSwitch(
    {
      'aria-describedby': ariaDescribedBy,
      checked,
      className,
      dataAttributes,
      defaultChecked = false,
      description,
      disabled = false,
      id,
      label,
      labelPosition = 'End',
      onClick,
      onCheckedChange,
      size = 'Medium',
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
      describedBy: ariaDescribedBy,
    });

    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      setIsChecked(!isChecked);
    };

    const control = (
      <button
        {...rest}
        {...getDataAttributes(dataAttributes)}
        aria-checked={isChecked}
        aria-describedby={fieldIds.describedBy}
        className={mergeClassNames(
          'PdxSwitch',
          size,
          `Label${labelPosition}`,
          isChecked && 'Checked',
          !description && className
        )}
        disabled={disabled}
        id={fieldIds.controlId}
        onClick={handleClick}
        ref={ref}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className="PdxSwitchTrack">
          <span className="PdxSwitchMark On" />
          <span className="PdxSwitchMark Off" />
          <span className="PdxSwitchThumb" />
        </span>
        {label && <span className="PdxSwitchLabel">{label}</span>}
      </button>
    );

    if (!description) return control;

    return (
      <div className={mergeClassNames('PdxField', 'PdxSwitchField', className)}>
        {control}
        <span className="PdxSwitchDescription" id={fieldIds.descriptionId}>
          {description}
        </span>
      </div>
    );
  }
);

export default PdxSwitch;
