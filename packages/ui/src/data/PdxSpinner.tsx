import './PdxSpinner.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxSpinnerSpecificProps {
  size?: 'Small' | 'Medium' | 'Large';
  label?: string;
  color?: string;
}

export interface PdxSpinnerProps
  extends PdxComponent,
    PdxSpinnerSpecificProps {}

function PdxSpinner({
  size = 'Medium',
  label,
  color,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxSpinnerProps) {
  const fullClassName = `PdxSpinner ${size} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      <span
        className="PdxSpinnerCircle"
        style={color ? { borderTopColor: color } : undefined}
      />
      {label && <span className="PdxSpinnerLabel">{label}</span>}
    </div>
  );
}

export default PdxSpinner;
