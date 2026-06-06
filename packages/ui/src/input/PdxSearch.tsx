import React from 'react';
import './PdxSearch.scss';
import { type PdxComponent } from '@prodivix/shared';

interface PdxSearchSpecificProps {
  placeholder?: string;
  value?: string;
  size?: 'Small' | 'Medium' | 'Large';
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  autoFocus?: boolean;
  autoComplete?: string;
  name?: string;
  onChange?: (value: string) => void;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onKeyUp?: React.KeyboardEventHandler<HTMLInputElement>;
  onClear?: () => void;
  onSearch?: (value: string) => void;
}

export interface PdxSearchProps extends PdxComponent, PdxSearchSpecificProps {}

function PdxSearch({
  size = 'Medium',
  placeholder = 'Search...',
  value = '',
  disabled = false,
  onClear,
  onSearch,
  className,
  style,
  id,
  dataAttributes = {},
  onChange,
  onKeyDown,
  ...rest
}: PdxSearchProps) {
  const fullClassName =
    `PdxSearch ${size} ${disabled ? 'Disabled' : ''} ${value ? 'HasValue' : ''} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };

  const handleClear = () => {
    if (onClear) {
      onClear();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onSearch) {
      onSearch(value);
    }
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      <span className="PdxSearchIcon">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
      </span>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        {...rest}
      />
      {value && !disabled && (
        <button
          type="button"
          className="PdxSearchClear"
          onClick={handleClear}
          aria-label="Clear search"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default PdxSearch;
