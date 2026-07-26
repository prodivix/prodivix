import './PdxTable.scss';
import PdxEmpty from '../feedback/PdxEmpty';
import PdxSkeleton from '../feedback/PdxSkeleton';
import {
  getDataAttributes,
  mergeClassNames,
  type PdxNativeProps,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type Key,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
} from 'react';
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

export interface PdxTableColumn<T = Record<string, unknown>> {
  align?: 'Left' | 'Center' | 'Right';
  dataIndex?: keyof T | string;
  key: string;
  render?: (value: unknown, record: T, index: number) => ReactNode;
  sortable?: boolean;
  /** Spoken name for the column when `title` is not plain text. */
  sortLabel?: string;
  sortValue?: (record: T) => unknown;
  title: ReactNode;
  width?: string | number;
}

export interface PdxTableOwnProps<T = Record<string, unknown>> {
  bordered?: boolean;
  caption?: ReactNode;
  columns: Array<PdxTableColumn<T>>;
  data: T[];
  defaultSelectedRowKeys?: Key[];
  defaultSort?: PdxSortValue;
  emptyState?: ReactNode;
  emptyText?: ReactNode;
  /** The caller already ordered `data`; the table only tracks sort state. */
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
  size?: PdxRowSize;
  sort?: PdxSortValue;
  stickyHeader?: boolean;
  striped?: boolean;
  title?: ReactNode;
}

export type PdxTableProps<T = Record<string, unknown>> = Omit<
  PdxNativeProps<'div'>,
  'children' | 'title'
> &
  PdxTableOwnProps<T>;

const columnSortLabel = <T,>(column: PdxTableColumn<T>): string =>
  column.sortLabel ??
  (typeof column.title === 'string' ? column.title : column.key);

const sortIconFor = (sort: PdxSortValue, columnKey: string) => {
  if (!sort || sort.columnKey !== columnKey) return <ArrowUpDown size={13} />;
  return sort.direction === 'Ascending' ? (
    <ArrowUp size={13} />
  ) : (
    <ArrowDown size={13} />
  );
};

/**
 * A table is read far more often than it is operated, so the operable parts —
 * sorting and row selection — are built as real controls rather than drawn on:
 * a header button carrying the shared focus ring with `aria-sort` beside it,
 * and a roving tabindex over rows so a keyboard can reach every one of them.
 * Ordering is derived from sort state on every render; the caller's `data` is
 * never mutated.
 */
function PdxTableInner<T extends Record<string, unknown>>(
  {
    'aria-label': ariaLabel,
    bordered = false,
    caption,
    className,
    columns,
    data,
    dataAttributes,
    defaultSelectedRowKeys,
    defaultSort = null,
    emptyState,
    emptyText = 'No data',
    externalSort = false,
    hoverable = false,
    loading = false,
    loadingRows = 3,
    maxBodyHeight,
    onSelectionChange,
    onSortChange,
    rowKey,
    selectedRowKeys,
    selectionMode = 'None',
    size = 'Medium',
    sort,
    stickyHeader = false,
    striped = false,
    title,
    ...rest
  }: PdxTableProps<T>,
  ref: ForwardedRef<HTMLDivElement>
) {
  const titleId = useId();
  const [sortValue, setSortValue] = useControllableState<PdxSortValue>({
    defaultValue: defaultSort,
    onChange: onSortChange,
    value: sort,
  });

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
    () =>
      new Map(columns.map((column) => [column.key, columnSortLabel(column)])),
    [columns]
  );
  const announcedSort = useRef<PdxSortValue>(sortValue);
  const announcementReady = useRef(false);
  const [sortStatus, setSortStatus] = useState('');

  // Announced from the effective sort value rather than from the click, so a
  // controlled caller that rejects a change never has a lie read out.
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

  const showEmpty = !loading && rows.length === 0;

  return (
    <div
      {...rest}
      {...(rowDensityAttribute(size)
        ? { 'data-pdx-density': rowDensityAttribute(size) }
        : {})}
      {...getDataAttributes(dataAttributes)}
      aria-label={title ? undefined : (ariaLabel ?? 'Data table')}
      aria-labelledby={title ? titleId : undefined}
      className={mergeClassNames('PdxTableRegion', className)}
      ref={ref}
      role="region"
    >
      {title ? (
        <div className="PdxTableTitle" id={titleId}>
          {title}
        </div>
      ) : null}
      <div className="PdxTableStatus" role="status">
        {sortStatus}
      </div>
      <div
        className="PdxTableScroll"
        style={
          maxBodyHeight === undefined
            ? undefined
            : { maxBlockSize: maxBodyHeight }
        }
        tabIndex={0}
      >
        <table
          aria-busy={loading || undefined}
          aria-multiselectable={selectionMode === 'Multiple' || undefined}
          className={mergeClassNames(
            'PdxTable',
            size,
            bordered && 'Bordered',
            striped && 'Striped',
            hoverable && 'Hoverable',
            selection.selectable && 'Selectable',
            stickyHeader && 'StickyHeader'
          )}
          role={selection.selectable ? 'grid' : undefined}
        >
          {caption ? <caption>{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  aria-sort={
                    column.sortable
                      ? ariaSortValue(sortValue, column.key)
                      : undefined
                  }
                  className={mergeClassNames(
                    'PdxTableHeaderCell',
                    `Align${column.align ?? 'Left'}`
                  )}
                  key={column.key}
                  scope="col"
                  style={{ width: column.width }}
                >
                  {column.sortable ? (
                    <button
                      className="PdxTableSortButton"
                      onClick={() =>
                        setSortValue(nextSortValue(sortValue, column.key))
                      }
                      type="button"
                    >
                      <span className="PdxTableSortLabel">{column.title}</span>
                      <span
                        aria-hidden="true"
                        className={mergeClassNames(
                          'PdxTableSortIcon',
                          sortValue?.columnKey === column.key && 'Active'
                        )}
                      >
                        {sortIconFor(sortValue, column.key)}
                      </span>
                    </button>
                  ) : (
                    column.title
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from(
                  { length: Math.max(1, loadingRows) },
                  (_, rowIndex) => (
                    <tr key={`loading-${rowIndex}`}>
                      {columns.map((column) => (
                        <td className="PdxTableCell" key={column.key}>
                          <PdxSkeleton width="min(100%, 160px)" />
                        </td>
                      ))}
                    </tr>
                  )
                )
              : null}
            {showEmpty ? (
              <tr>
                <td
                  className="PdxTableEmptyCell"
                  colSpan={Math.max(1, columns.length)}
                >
                  {emptyState ?? <PdxEmpty title={emptyText} />}
                </td>
              </tr>
            ) : null}
            {!loading
              ? rows.map((entry, displayIndex) => {
                  const selected = selection.isSelected(entry.key);
                  return (
                    <tr
                      aria-selected={
                        selection.selectable ? selected : undefined
                      }
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
                      tabIndex={
                        selection.selectable
                          ? keyboard.tabbableRowKey === entry.key
                            ? 0
                            : -1
                          : undefined
                      }
                    >
                      {columns.map((column) => {
                        const value = readCellValue(
                          entry.record,
                          column.dataIndex
                        );
                        return (
                          <td
                            className={mergeClassNames(
                              'PdxTableCell',
                              `Align${column.align ?? 'Left'}`
                            )}
                            key={column.key}
                          >
                            {column.render
                              ? column.render(value, entry.record, entry.index)
                              : renderUnknownCellValue(value)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PdxTable = forwardRef(PdxTableInner) as <
  T extends Record<string, unknown>,
>(
  props: PdxTableProps<T> & RefAttributes<HTMLDivElement>
) => ReactElement | null;

export default PdxTable;
