import type React from 'react';
import { type PdxComponent } from '@prodivix/shared';
import './PdxOutlet.scss';

interface PdxOutletSpecificProps {
  emptyText?: string;
  children?: React.ReactNode;
}

export interface PdxOutletProps extends PdxComponent, PdxOutletSpecificProps {}

function PdxOutlet({
  emptyText = 'Outlet is empty.',
  children,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxOutletProps) {
  const hasContent = children !== undefined && children !== null;

  return (
    <div
      className={`PdxOutlet ${className ?? ''}`.trim()}
      style={style as React.CSSProperties | undefined}
      id={id}
      {...dataAttributes}
    >
      {hasContent ? (
        children
      ) : (
        <div className="PdxOutletEmpty">{emptyText}</div>
      )}
    </div>
  );
}

export default PdxOutlet;
