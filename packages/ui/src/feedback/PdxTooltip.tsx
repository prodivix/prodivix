import './PdxTooltip.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxTooltipSpecificProps {
  content: React.ReactNode;
  placement?: 'Top' | 'Right' | 'Bottom' | 'Left';
  children: React.ReactNode;
}

export interface PdxTooltipProps
  extends PdxComponent,
    PdxTooltipSpecificProps {}

function PdxTooltip({
  content,
  placement = 'Top',
  children,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxTooltipProps) {
  const fullClassName = `PdxTooltip ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <span
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {children}
      <span className={`PdxTooltipContent ${placement}`}>{content}</span>
    </span>
  );
}

export default PdxTooltip;
