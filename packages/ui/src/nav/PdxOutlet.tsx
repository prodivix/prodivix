import type React from 'react';
import { type PdxComponent } from '@prodivix/shared';
import './PdxOutlet.scss';

interface PdxOutletSpecificProps {
  emptyText?: string;
  children?: React.ReactNode;
}

export interface PdxOutletProps extends PdxComponent, PdxOutletSpecificProps {}

function PdxOutlet({
  children,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxOutletProps) {
  return (
    <div
      className={`PdxOutlet ${className ?? ''}`.trim()}
      style={style as React.CSSProperties | undefined}
      id={id}
      {...dataAttributes}
    >
      {children}
    </div>
  );
}

export default PdxOutlet;
