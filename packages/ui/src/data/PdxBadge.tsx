import './PdxBadge.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxBadgeSpecificProps {
  count?: number;
  max?: number;
  dot?: boolean;
  showZero?: boolean;
  color?: string;
  children?: React.ReactNode;
}

export interface PdxBadgeProps extends PdxComponent, PdxBadgeSpecificProps {}

function PdxBadge({
  count = 0,
  max = 99,
  dot = false,
  showZero = false,
  color,
  children,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxBadgeProps) {
  const displayCount = count > max ? `${max}+` : count;
  const showBadge = dot || count > 0 || showZero;

  const fullClassName = `PdxBadge ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <span
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {children}
      {showBadge && (
        <span
          className={`PdxBadgeCount ${dot ? 'Dot' : ''}`}
          style={color ? { backgroundColor: color } : undefined}
        >
          {!dot && displayCount}
        </span>
      )}
    </span>
  );
}

export default PdxBadge;
