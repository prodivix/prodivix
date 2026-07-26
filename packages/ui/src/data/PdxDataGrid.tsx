import './PdxDataGrid.scss';
import PdxEmpty from '../feedback/PdxEmpty';
import PdxSkeleton from '../feedback/PdxSkeleton';
import { type PdxComponent } from '@prodivix/shared';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type Key } from 'react';
import type React from 'react';
import { renderUnknownCellValue } from './renderUnknownCellValue';
import {
  ariaSortValue,
  buildRowEntries,
  nextSortValue,
  readCellValue,
  rowDensityAttribute,
  sortAnnouncement,
  sortRowEntries,
  useRowKeyboard,
  useRowSelection,
  type PdxRowKeyResolver,
  type PdxRowSelectionMode,
  type PdxRowSize,
  type PdxSortValue,
} from './rowSurface';

export interface PdxDataGridColumn<T = Record<string, unknown>> {
  align?: 'Left' | 'Center' | 'Right';
  dataIndex?: keyof T | string;
  key: string;
  render?: (value: unknown, record: T, index: number) => React.ReactNode;
  sortable?: boolean;
  sortValue?: (record: T) => unknown;
  title: string;
  width?: string | number;
}

interface PdxDataGridSpecificProps<T = Record<string, unknown>> {
  bordered?: boolean;
  columns: Array<PdxDataGridColumn<T>>;
  data: T[];
  defaultSelectedRowKeys?: Key[];
  defaultSort?: PdxSortValue;
  emptyText?: React.ReactNode;
  /** The caller already ordered `data`; the grid only tracks sort state. */
  externalSort?: boolean;
  hoverable?: boolean;
  loading?: boolean;
  loadingRows?: number;
  /** Bounds the scroll container so `stickyHeader` has something to stick to. */
  maxBodyHeight?: number | string;
  onSelectionChange?: (selectedRowKeys: Key[]) => void;
  onSortChange?: (sort: PdxSortValue) => void;
  rowKey?: PdxRowKeyResolver<T>;
  selectedRowKeys?: Key[];
  selectionMode?: PdxRowSelectionMode;
  showHeader?: boolean;
  size?: PdxRowSize;
  sort?: PdxSortValue;
  stickyHeader?: boolean;
  striped?: boolean;
}

export interface PdxDataGridProps<T = Record<string, unknown>>
  extends PdxComponent, PdxDataGridSpecificProps<T> {}

const sortIconFor = (sort: PdxSortValue, columnKey: string) => {
  if (!sort || sort.columnKey !== columnKey) return <ArrowUpDown size={13} />;
  return sort.direction === 'Ascending' ? (
    <ArrowUp size={13} />
  ) : (
    <ArrowDown size={13} />
  );
};

/**
 * The grid a table becomes once its rows are operable: rows carry
 * `aria-selected` and a roving tabindex so every one of them is reachable
 * without a pointer, and column headers sort through real buttons with
 * `aria-sort` beside them. Without row selection it stays a plain `table`,
 * because a `grid` whose rows do nothing is a promise the widget cannot keep.
 */
function PdxDataGrid<T extends Record<string, unknown>>({
  bordered = false,
  className,
  columns,
  data,
  dataAttributes = {},
  defaultSelectedRowKeys,
  defaultSort = null,
  emptyText = 'No data',
  externalSort = false,
  hoverable = false,
  id,
  loading = false,
  loadingRows = 3,
  maxBodyHeight,
  onSelectionChange,
  onSortChange,
  rowKey,
  selectedRowKeys,
  selectionMode = 'None',
  showHeader = true,
  size = 'Medium',
  sort,
  stickyHeader = false,
  striped = false,
  style,
}: PdxDataGridProps<T>) {
  const [sortValue, setSortValue] = useControllableState<PdxSortValue>({
    defaultValue: defaultSort,
    onChange: onSortChange,
    value: sort,
  });

  const columnTemplate = columns
    .map((column) =>
      typeof column.width === 'number'
        ? `${column.width}px`
        : column.width || '1fr'
    )
    .join(' ');

  const entries = useMemo(() => buildRowEntries(data, rowKey), [data, rowKey]);
  const rows = useMemo(
    () =>
      externalSort ? entries : sortRowEntries(entries, columns, sortValue),
    [columns, entries, externalSort, sortValue]
  );
  const rowKeys = useMemo(() => rows.map((entry) => entry.key), [rows]);

  const selection = useRowSelection({
    defaultSelectedRowKeys,
    onSelectionChange,
    selectedRowKeys,
    selectionMode,
  });
  const keyboard = useRowKeyboard(rowKeys, selection.selectedRowKeys[0]);

  const sortLabels = useMemo(
    () => new Map(columns.map((column) => [column.key, column.title])),
    [columns]
  );
  const announcedSort = useRef<PdxSortValue>(sortValue);
  const announcementReady = useRef(false);
  const [sortStatus, setSortStatus] = useState('');

  useEffect(() => {
    const previous = announcedSort.current;
    announcedSort.current = sortValue;

    if (!announcementReady.current) {
      announcementReady.current = true;
      return;
    }
    if (
      previous?.columnKey === sortValue?.columnKey &&
      previous?.direction === sortValue?.direction
    ) {
      return;
    }

    const columnKey = sortValue?.columnKey ?? previous?.columnKey;
    setSortStatus(
      sortAnnouncement(
        sortValue,
        (columnKey ? sortLabels.get(columnKey) : undefined) ??
          columnKey ??
          'Column'
      )
    );
  }, [sortLabels, sortValue]);

  const cellRole = selection.selectable ? 'gridcell' : 'cell';
  const showEmpty = !loading && rows.length === 0;

  return (
    <div
      {...(rowDensityAttribute(size)
        ? { 'data-pdx-density': rowDensityAttribute(size) }
        : {})}
      {...getDataAttributes(dataAttributes)}
      className={mergeClassNames('PdxDataGridRegion', className)}
      id={id}
      style={style as React.CSSProperties}
    >
      <div className="PdxDataGridStatus" role="status">
        {sortStatus}
      </div>
      <div
        aria-multiselectable={selectionMode === 'Multiple' || undefined}
        className={mergeClassNames(
          'PdxDataGrid',
          striped && 'Striped',
          bordered && 'Bordered',
          hoverable && 'Hoverable',
          selection.selectable && 'Selectable',
          stickyHeader && 'StickyHeader'
        )}
        role={selection.selectable ? 'grid' : 'table'}
        style={
          maxBodyHeight === undefined
            ? undefined
            : { maxBlockSize: maxBodyHeight }
        }
        tabIndex={0}
      >
        {showHeader && (
          <div
            className="PdxDataGridHeader"
            role="row"
            style={{ gridTemplateColumns: columnTemplate }}
          >
            {columns.map((column) => (
              <div
                aria-sort={
                  column.sortable
                    ? ariaSortValue(sortValue, column.key)
                    : undefined
                }
                className={mergeClassNames(
                  'PdxDataGridCell',
                  'PdxDataGridHeaderCell',
                  `Align${column.align ?? 'Left'}`
                )}
                key={column.key}
                role="columnheader"
              >
                {column.sortable ? (
                  <button
                    className="PdxDataGridSortButton"
                    onClick={() =>
                      setSortValue(nextSortValue(sortValue, column.key))
                    }
                    type="button"
                  >
                    <span className="PdxDataGridSortLabel">{column.title}</span>
                    <span
                      aria-hidden="true"
                      className={mergeClassNames(
                        'PdxDataGridSortIcon',
                        sortValue?.columnKey === column.key && 'Active'
                      )}
                    >
                      {sortIconFor(sortValue, column.key)}
                    </span>
                  </button>
                ) : (
                  column.title
                )}
              </div>
            ))}
          </div>
        )}
        {loading
          ? Array.from({ length: Math.max(1, loadingRows) }, (_, rowIndex) => (
              <div
                className="PdxDataGridRow"
                key={`loading-${rowIndex}`}
                role="row"
                style={{ gridTemplateColumns: columnTemplate }}
              >
                {columns.map((column) => (
                  <div
                    className="PdxDataGridCell"
                    key={column.key}
                    role={cellRole}
                  >
                    <PdxSkeleton width="min(100%, 160px)" />
                  </div>
                ))}
              </div>
            ))
          : null}
        {showEmpty && (
          <div className="PdxDataGridEmpty" role="row">
            <div aria-colspan={columns.length} role={cellRole}>
              <PdxEmpty title={emptyText} />
            </div>
          </div>
        )}
        {!loading
          ? rows.map((entry, displayIndex) => {
              const selected = selection.isSelected(entry.key);
              return (
                <div
                  aria-selected={selection.selectable ? selected : undefined}
                  className="PdxDataGridRow"
                  key={entry.key}
                  onClick={
                    selection.selectable
                      ? () => {
                          keyboard.setActiveRowKey(entry.key);
                          selection.toggle(entry.key);
                        }
                      : undefined
                  }
                  onKeyDown={
                    selection.selectable
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            keyboard.setActiveRowKey(entry.key);
                            selection.toggle(entry.key);
                            return;
                          }
                          if (keyboard.moveFocus(event.key, displayIndex)) {
                            event.preventDefault();
                          }
                        }
                      : undefined
                  }
                  ref={
                    selection.selectable
                      ? keyboard.registerRow(entry.key)
                      : undefined
                  }
                  role="row"
                  style={{ gridTemplateColumns: columnTemplate }}
                  tabIndex={
                    selection.selectable
                      ? keyboard.tabbableRowKey === entry.key
                        ? 0
                        : -1
                      : undefined
                  }
                >
                  {columns.map((column) => {
                    const value = readCellValue(entry.record, column.dataIndex);
                    return (
                      <div
                        className={mergeClassNames(
                          'PdxDataGridCell',
                          `Align${column.align ?? 'Left'}`
                        )}
                        key={column.key}
                        role={cellRole}
                      >
                        {column.render
                          ? column.render(value, entry.record, entry.index)
                          : renderUnknownCellValue(value)}
                      </div>
                    );
                  })}
                </div>
              );
            })
          : null}
      </div>
    </div>
  );
}

export default PdxDataGrid;
