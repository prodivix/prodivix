import './PdxGrid.scss';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import { type PdxSpacingScale } from './PdxStack';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

export type PdxGridAlign = 'Start' | 'Center' | 'End' | 'Stretch';

/**
 * The column count is unbounded, so it travels as a custom property rather
 * than as a generated class. Declaring it here keeps the style object typed
 * without a cast.
 */
interface PdxGridStyle extends React.CSSProperties {
  '--pdx-grid-columns'?: number;
  '--pdx-grid-columns-medium'?: number;
  '--pdx-grid-columns-large'?: number;
}

interface PdxGridSpecificProps {
  children: React.ReactNode;
  align?: PdxGridAlign;
  columns?: number;
  columnsLarge?: number;
  columnsMedium?: number;
  gap?: PdxSpacingScale;
  justify?: PdxGridAlign;
  rowGap?: PdxSpacingScale;
}

export interface PdxGridProps extends PdxComponent, PdxGridSpecificProps {}

function toColumnCount(columns: number) {
  return Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 1;
}

function PdxGrid({
  children,
  align = 'Stretch',
  columns = 2,
  columnsLarge,
  columnsMedium,
  gap = 'Medium',
  justify = 'Stretch',
  rowGap,
  as,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxGridProps) {
  const Component = as ?? 'div';
  const gridStyle: PdxGridStyle = {
    ...style,
    '--pdx-grid-columns': toColumnCount(columns),
    ...(columnsMedium !== undefined && {
      '--pdx-grid-columns-medium': toColumnCount(columnsMedium),
    }),
    ...(columnsLarge !== undefined && {
      '--pdx-grid-columns-large': toColumnCount(columnsLarge),
    }),
  };

  return (
    <Component
      className={mergeClassNames(
        'PdxGrid',
        `Gap${gap}`,
        rowGap && `RowGap${rowGap}`,
        `Align${align}`,
        `Justify${justify}`,
        className
      )}
      id={id}
      onClick={onClick}
      style={gridStyle}
      {...getDataAttributes(dataAttributes)}
    >
      {children}
    </Component>
  );
}

export default PdxGrid;
