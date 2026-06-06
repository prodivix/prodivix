import './PdxTable.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

export interface PdxTableColumn<T = Record<string, unknown>> {
  key: string;
  title: string;
  dataIndex?: keyof T | string;
  align?: 'Left' | 'Center' | 'Right';
  width?: string | number;
  render?: (value: unknown, record: T, index: number) => React.ReactNode;
}

interface PdxTableSpecificProps<T = Record<string, unknown>> {
  data: T[];
  columns: Array<PdxTableColumn<T>>;
  size?: 'Small' | 'Medium' | 'Large';
  bordered?: boolean;
  striped?: boolean;
  hoverable?: boolean;
  title?: string;
  caption?: string;
  emptyText?: string;
}

export interface PdxTableProps<T = Record<string, unknown>>
  extends PdxComponent,
    PdxTableSpecificProps<T> {}

function PdxTable<T extends Record<string, unknown>>({
  data,
  columns,
  size = 'Medium',
  bordered = false,
  striped = false,
  hoverable = false,
  title,
  caption,
  emptyText = 'No data',
  className,
  style,
  id,
  dataAttributes = {},
}: PdxTableProps<T>) {
  const fullClassName =
    `PdxTable ${size} ${bordered ? 'Bordered' : ''} ${striped ? 'Striped' : ''} ${hoverable ? 'Hoverable' : ''} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className="PdxTableWrapper"
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {title && <div className="PdxTableTitle">{title}</div>}
      <table className={fullClassName}>
        {caption && <caption>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{ width: column.width }}
                className={`Align${column.align || 'Left'}`}
              >
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 && (
            <tr>
              <td className="PdxTableEmpty" colSpan={columns.length}>
                {emptyText}
              </td>
            </tr>
          )}
          {data.map((record, index) => (
            <tr key={index}>
              {columns.map((column) => {
                const value = column.dataIndex
                  ? (record as Record<string, unknown>)[
                      column.dataIndex as string
                    ]
                  : undefined;
                return (
                  <td
                    key={column.key}
                    className={`Align${column.align || 'Left'}`}
                  >
                    {column.render
                      ? column.render(value, record, index)
                      : (value as React.ReactNode)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default PdxTable;
