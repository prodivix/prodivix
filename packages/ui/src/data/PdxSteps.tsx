import './PdxSteps.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

export interface PdxStepItem {
  title: string;
  description?: string;
}

interface PdxStepsSpecificProps {
  items: PdxStepItem[];
  current?: number;
  direction?: 'Horizontal' | 'Vertical';
}

export interface PdxStepsProps extends PdxComponent, PdxStepsSpecificProps {}

function PdxSteps({
  items,
  current = 0,
  direction = 'Horizontal',
  className,
  style,
  id,
  dataAttributes = {},
}: PdxStepsProps) {
  const fullClassName = `PdxSteps ${direction} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {items.map((item, index) => {
        const status =
          index < current
            ? 'Completed'
            : index === current
              ? 'Active'
              : 'Pending';
        return (
          <div key={item.title} className={`PdxStep ${status}`}>
            <div className="PdxStepIndicator">{index + 1}</div>
            <div className="PdxStepContent">
              <div className="PdxStepTitle">{item.title}</div>
              {item.description && (
                <div className="PdxStepDescription">{item.description}</div>
              )}
            </div>
            {index < items.length - 1 && <div className="PdxStepConnector" />}
          </div>
        );
      })}
    </div>
  );
}

export default PdxSteps;
