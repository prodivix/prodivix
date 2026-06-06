import './PdxProgress.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxProgressSpecificProps {
  value: number;
  size?: 'Small' | 'Medium' | 'Large';
  status?: 'Default' | 'Success' | 'Warning' | 'Danger';
  showLabel?: boolean;
  label?: string;
}

export interface PdxProgressProps
  extends PdxComponent,
    PdxProgressSpecificProps {}

function PdxProgress({
  value,
  size = 'Medium',
  status = 'Default',
  showLabel = true,
  label,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const fullClassName =
    `PdxProgress ${size} ${status} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {(label || showLabel) && (
        <div className="PdxProgressHeader">
          {label && <span>{label}</span>}
          {showLabel && <span>{clampedValue}%</span>}
        </div>
      )}
      <div className="PdxProgressTrack">
        <div className="PdxProgressBar" style={{ width: `${clampedValue}%` }} />
      </div>
    </div>
  );
}

export default PdxProgress;
