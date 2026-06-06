import './PdxCard.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxCardSpecificProps {
  children: React.ReactNode;
  size?: 'Small' | 'Medium' | 'Large';
  variant?: 'Default' | 'Bordered' | 'Elevated' | 'Flat';
  padding?: 'None' | 'Small' | 'Medium' | 'Large';
  hoverable?: boolean;
  clickable?: boolean;
}

export interface PdxCardProps extends PdxComponent, PdxCardSpecificProps {}

function PdxCard({
  children,
  size = 'Medium',
  variant = 'Default',
  padding = 'Medium',
  hoverable = false,
  clickable = false,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxCardProps) {
  const fullClassName =
    `PdxCard ${size} ${variant} Padding${padding} ${hoverable ? 'Hoverable' : ''} ${clickable ? 'Clickable' : ''} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties | undefined}
      id={id}
      onClick={onClick}
      {...dataProps}
    >
      {children}
    </div>
  );
}

export default PdxCard;
