import './PdxEmpty.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxEmptySpecificProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export interface PdxEmptyProps extends PdxComponent, PdxEmptySpecificProps {}

function PdxEmpty({
  title = 'No data',
  description,
  icon,
  action,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxEmptyProps) {
  const fullClassName = `PdxEmpty ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {icon && <div className="PdxEmptyIcon">{icon}</div>}
      <div className="PdxEmptyTitle">{title}</div>
      {description && <div className="PdxEmptyDescription">{description}</div>}
      {action && <div className="PdxEmptyAction">{action}</div>}
    </div>
  );
}

export default PdxEmpty;
