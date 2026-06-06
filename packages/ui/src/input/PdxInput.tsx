import './PdxInput.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxInputSpecificProps {
  type?:
    | 'Text'
    | 'Password'
    | 'Email'
    | 'Number'
    | 'Tel'
    | 'Url'
    | 'Search'
    | 'Date'
    | 'Time';
  placeholder?: string;
  value?: string;
  size?: 'Small' | 'Medium' | 'Large';
  state?: 'Default' | 'Error' | 'Warning' | 'Success';
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  pattern?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  name?: string;
  id?: string;
  icon?: React.ReactNode;
  iconPosition?: 'Left' | 'Right';
  onChange?: (value: string) => void;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onKeyUp?: React.KeyboardEventHandler<HTMLInputElement>;
}

export interface PdxInputProps extends PdxComponent, PdxInputSpecificProps {}

function PdxInput({
  type = 'Text',
  size = 'Medium',
  placeholder,
  value,
  state,
  disabled = false,
  readOnly = false,
  required = false,
  minLength,
  maxLength,
  min,
  max,
  step,
  pattern,
  autoFocus = false,
  autoComplete,
  name,
  icon,
  iconPosition = 'Left',
  onChange,
  onFocus,
  onBlur,
  onKeyDown,
  onKeyUp,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxInputProps) {
  const fullClassName =
    `PdxInput ${size} ${state ? state : ''} ${disabled ? 'Disabled' : ''} ${readOnly ? 'ReadOnly' : ''} ${icon ? 'WithIcon' : ''} ${iconPosition} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  const inputElement = (
    <input
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      type={type.toLowerCase() as React.HTMLInputTypeAttribute}
      placeholder={placeholder}
      value={value}
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      minLength={minLength}
      maxLength={maxLength}
      min={min}
      max={max}
      step={step}
      pattern={pattern}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      name={name}
      onChange={handleChange}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onClick={onClick}
      {...dataProps}
    />
  );

  if (icon) {
    return (
      <div className="PdxInput-wrapper">
        {iconPosition === 'Left' && (
          <span className="PdxInput-icon">{icon}</span>
        )}
        {inputElement}
        {iconPosition === 'Right' && (
          <span className="PdxInput-icon">{icon}</span>
        )}
      </div>
    );
  }

  return inputElement;
}

export default PdxInput;
