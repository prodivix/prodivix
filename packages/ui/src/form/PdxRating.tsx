import './PdxRating.scss';
import { type PdxComponent } from '@prodivix/shared';
import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import type React from 'react';

interface PdxRatingSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  value?: number;
  defaultValue?: number;
  max?: number;
  size?: 'Small' | 'Medium' | 'Large';
  readOnly?: boolean;
  disabled?: boolean;
  onChange?: (value: number) => void;
}

export interface PdxRatingProps extends PdxComponent, PdxRatingSpecificProps {}

function PdxRating({
  label,
  description,
  message,
  value,
  defaultValue = 0,
  max = 5,
  size = 'Medium',
  readOnly = false,
  disabled = false,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxRatingProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const currentValue = value !== undefined ? value : internalValue;
  const displayValue = hoverValue !== null ? hoverValue : currentValue;

  const handleSelect = (nextValue: number) => {
    if (readOnly || disabled) return;
    if (value === undefined) {
      setInternalValue(nextValue);
    }
    if (onChange) {
      onChange(nextValue);
    }
  };

  const fullClassName =
    `PdxRating ${size} ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();
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
      <div className="PdxRatingStars">
        {Array.from({ length: max }, (_, index) => {
          const ratingValue = index + 1;
          return (
            <button
              key={ratingValue}
              type="button"
              className={`PdxRatingStar ${displayValue >= ratingValue ? 'Active' : ''}`}
              onClick={() => handleSelect(ratingValue)}
              onMouseEnter={() => setHoverValue(ratingValue)}
              onMouseLeave={() => setHoverValue(null)}
              disabled={disabled}
            >
              <Star className="PdxRatingIcon" />
            </button>
          );
        })}
      </div>
      {message && <div className="PdxFieldMessage">{message}</div>}
    </div>
  );
}

export default PdxRating;
