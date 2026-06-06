import './PdxDataGrid.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

export interface PdxDataGridColumn<T = Record<string, unknown>> {
  key: string;
  title: string;
  dataIndex?: keyof T | string;
  width?: string | number;
  align?: 'Left' | 'Center' | 'Right';
  render?: (value: unknown, record: T, index: number) => React.ReactNode;
}

interface PdxDataGridSpecificProps<T = Record<string, unknown>> {
  data: T[];
  columns: Array<PdxDataGridColumn<T>>;
  showHeader?: boolean;
  striped?: boolean;
  bordered?: boolean;
  hoverable?: boolean;
  rowKey?: keyof T | ((record: T) => string);
  emptyText?: string;
}

export interface PdxDataGridProps<T = Record<string, unknown>>
  extends PdxComponent,
    PdxDataGridSpecificProps<T> {}

function PdxDataGrid<T extends Record<string, unknown>>({
  data,
  columns,
  showHeader = true,
  striped = false,
  bordered = false,
  hoverable = false,
  rowKey,
  emptyText = 'No data',
  className,
  style,
  id,
  dataAttributes = {},
}: PdxDataGridProps<T>) {
  const columnTemplate = columns
    .map((column) =>
      typeof column.width === 'number'
        ? `${column.width}px`
        : column.width || '1fr'
    )
    .join(' ');

  const fullClassName =
    `PdxDataGrid ${striped ? 'Striped' : ''} ${bordered ? 'Bordered' : ''} ${hoverable ? 'Hoverable' : ''} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  const getRowKey = (record: T, index: number) => {
    if (typeof rowKey === 'function') {
      return rowKey(record);
    }
    if (typeof rowKey === 'string') {
      return String((record as Record<string, unknown>)[rowKey as string]);
    }
    return String(index);
  };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {showHeader && (
        <div
          className="PdxDataGridHeader"
          style={{ gridTemplateColumns: columnTemplate }}
        >
          {columns.map((column) => (
            <div
              key={column.key}
              className={`PdxDataGridCell Align${column.align || 'Left'}`}
            >
              {column.title}
            </div>
          ))}
        </div>
      )}
      {data.length === 0 && <div className="PdxDataGridEmpty">{emptyText}</div>}
      {data.map((record, index) => (
        <div
          key={getRowKey(record, index)}
          className="PdxDataGridRow"
          style={{ gridTemplateColumns: columnTemplate }}
        >
          {columns.map((column) => {
            const value = column.dataIndex
              ? (record as Record<string, unknown>)[column.dataIndex as string]
              : undefined;
            return (
              <div
                key={column.key}
                className={`PdxDataGridCell Align${column.align || 'Left'}`}
              >
                {column.render
                  ? column.render(value, record, index)
                  : (value as React.ReactNode)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default PdxDataGrid;
