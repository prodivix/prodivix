import './PdxVerificationCode.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useRef, useState } from 'react';
import type React from 'react';

interface PdxVerificationCodeSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  length?: number;
  value?: string;
  defaultValue?: string;
  size?: 'Small' | 'Medium' | 'Large';
  state?: 'Default' | 'Error' | 'Warning' | 'Success';
  disabled?: boolean;
  autoFocus?: boolean;
  masked?: boolean;
  separator?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
}

export interface PdxVerificationCodeProps
  extends PdxComponent,
    PdxVerificationCodeSpecificProps {}

function PdxVerificationCode({
  label,
  description,
  message,
  length = 6,
  value,
  defaultValue,
  size = 'Medium',
  state = 'Default',
  disabled = false,
  autoFocus = false,
  masked = false,
  separator,
  onChange,
  onComplete,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxVerificationCodeProps) {
  const [internalValue, setInternalValue] = useState(defaultValue || '');
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const currentValue = value !== undefined ? value : internalValue;
  const characters = Array.from(
    { length },
    (_, index) => currentValue[index] || ''
  );

  const updateValue = (nextChars: string[]) => {
    const nextValue = nextChars.join('');
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    if (onChange) {
      onChange(nextValue);
    }
    if (onComplete && nextChars.every((char) => char)) {
      onComplete(nextValue);
    }
  };

  const handleChange =
    (index: number) => (event: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = event.target.value.slice(-1);
      const nextChars = [...characters];
      nextChars[index] = inputValue;
      updateValue(nextChars);

      if (inputValue && index < length - 1) {
        inputsRef.current[index + 1]?.focus();
      }
    };

  const handleKeyDown =
    (index: number) => (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Backspace' && !characters[index] && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasteValue = event.clipboardData.getData('text').slice(0, length);
    if (!pasteValue) {
      return;
    }
    const nextChars = Array.from(
      { length },
      (_, index) => pasteValue[index] || ''
    );
    updateValue(nextChars);
    const nextIndex = Math.min(pasteValue.length, length - 1);
    inputsRef.current[nextIndex]?.focus();
    event.preventDefault();
  };

  const fullClassName =
    `PdxVerificationCode ${size} ${state} ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();
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
      <div className="PdxVerificationCodeInputs">
        {characters.map((char, index) => (
          <div key={index} className="PdxVerificationCodeItem">
            <input
              ref={(element) => {
                inputsRef.current[index] = element;
              }}
              className="PdxVerificationCodeInput"
              type={masked ? 'password' : 'text'}
              inputMode="numeric"
              maxLength={1}
              value={char}
              autoFocus={autoFocus && index === 0}
              disabled={disabled}
              onChange={handleChange(index)}
              onKeyDown={handleKeyDown(index)}
              onPaste={handlePaste}
            />
            {separator && index < length - 1 && (
              <span className="PdxVerificationCodeSeparator">{separator}</span>
            )}
          </div>
        ))}
      </div>
      {message && <div className={`PdxFieldMessage ${state}`}>{message}</div>}
    </div>
  );
}

export default PdxVerificationCode;
