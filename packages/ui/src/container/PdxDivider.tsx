import './PdxDivider.scss';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import { type PdxSpacingScale } from './PdxStack';
import { type PdxComponent } from '@prodivix/shared';
import { useId } from 'react';
import type React from 'react';

export type PdxDividerOrientation = 'Horizontal' | 'Vertical';

interface PdxDividerSpecificProps {
  label?: React.ReactNode;
  labelPosition?: 'Start' | 'Center' | 'End';
  orientation?: PdxDividerOrientation;
  spacing?: PdxSpacingScale;
  variant?: 'Solid' | 'Dashed';
}

export interface PdxDividerProps
  extends PdxComponent, PdxDividerSpecificProps {}

/**
 * `separator` takes presentational children, so a label placed inside it would
 * never reach assistive technology on its own. The label is therefore named
 * through `aria-labelledby`, which reads the referenced text regardless.
 */
function PdxDivider({
  label,
  labelPosition = 'Center',
  orientation = 'Horizontal',
  spacing = 'Medium',
  variant = 'Solid',
  as,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxDividerProps) {
  const Component = as ?? 'div';
  const generatedId = useId().replaceAll(':', '');
  const labelId = `${id ?? `pdx-divider-${generatedId}`}-label`;
  const hasLabel = Boolean(label);

  return (
    <Component
      aria-labelledby={hasLabel ? labelId : undefined}
      aria-orientation={orientation === 'Vertical' ? 'vertical' : 'horizontal'}
      className={mergeClassNames(
        'PdxDivider',
        orientation,
        variant,
        `Spacing${spacing}`,
        hasLabel && 'WithLabel',
        hasLabel && `Label${labelPosition}`,
        className
      )}
      id={id}
      onClick={onClick}
      role="separator"
      style={style}
      {...getDataAttributes(dataAttributes)}
    >
      {hasLabel && (
        <>
          <span aria-hidden="true" className="PdxDividerLine Leading" />
          <span className="PdxDividerLabel" id={labelId}>
            {label}
          </span>
          <span aria-hidden="true" className="PdxDividerLine Trailing" />
        </>
      )}
    </Component>
  );
}

export default PdxDivider;
