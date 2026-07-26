import './PdxStack.scss';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

/**
 * The layout spacing vocabulary shared by every container primitive. It maps
 * one-to-one onto the `--spacing-*` tokens so a layout can never introduce a
 * gap the theme does not own.
 */
export type PdxSpacingScale =
  | 'None'
  | 'ExtraSmall'
  | 'Small'
  | 'Medium'
  | 'Large'
  | 'ExtraLarge'
  | 'ExtraExtraLarge';

export type PdxStackDirection =
  'Row' | 'Column' | 'RowReverse' | 'ColumnReverse';

export type PdxStackAlign = 'Start' | 'Center' | 'End' | 'Stretch' | 'Baseline';

export type PdxStackJustify =
  'Start' | 'Center' | 'End' | 'SpaceBetween' | 'SpaceAround' | 'SpaceEvenly';

interface PdxStackSpecificProps {
  children: React.ReactNode;
  align?: PdxStackAlign;
  direction?: PdxStackDirection;
  gap?: PdxSpacingScale;
  inline?: boolean;
  justify?: PdxStackJustify;
  wrap?: boolean;
}

export interface PdxStackProps extends PdxComponent, PdxStackSpecificProps {}

function PdxStack({
  children,
  align = 'Stretch',
  direction = 'Column',
  gap = 'Small',
  inline = false,
  justify = 'Start',
  wrap = false,
  as,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxStackProps) {
  const Component = as ?? 'div';

  return (
    <Component
      className={mergeClassNames(
        'PdxStack',
        direction,
        `Gap${gap}`,
        `Align${align}`,
        `Justify${justify}`,
        wrap && 'Wrap',
        inline && 'Inline',
        className
      )}
      id={id}
      onClick={onClick}
      style={style}
      {...getDataAttributes(dataAttributes)}
    >
      {children}
    </Component>
  );
}

export default PdxStack;
