import './PdxSkeleton.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxSkeletonSpecificProps {
  variant?: 'Text' | 'Circle' | 'Rect';
  width?: number | string;
  height?: number | string;
  lines?: number;
}

export interface PdxSkeletonProps
  extends PdxComponent,
    PdxSkeletonSpecificProps {}

function PdxSkeleton({
  variant = 'Text',
  width,
  height,
  lines = 1,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxSkeletonProps) {
  const fullClassName = `PdxSkeleton ${variant} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  const baseStyle: React.CSSProperties = {
    width,
    height,
    ...(style as React.CSSProperties),
  };

  if (variant === 'Text' && lines > 1) {
    return (
      <div className="PdxSkeletonGroup" id={id} {...dataProps}>
        {Array.from({ length: lines }).map((_, index) => (
          <div key={index} className={fullClassName} style={baseStyle} />
        ))}
      </div>
    );
  }

  return (
    <div className={fullClassName} style={baseStyle} id={id} {...dataProps} />
  );
}

export default PdxSkeleton;
