import { useControllableState } from '../foundation/useControllableState';
import { useCallback, useRef, useState, type Key } from 'react';

/*
 * Row semantics shared by every surface in `data/` that renders records a user
 * points at: Table, DataGrid, List and CheckList. Each of them previously grew
 * its own key resolution, its own hover/selected vocabulary and — where it had
 * sorting or selection at all — its own state machine. This module is the one
 * owner for the behaviour; `_rowSurface.scss` is the one owner for the look.
 */

/** How a caller identifies a row across renders. */
export type PdxRowKeyResolver<T> =
  keyof T | ((record: T, index: number) => Key);

export type PdxRowSize = 'Small' | 'Medium' | 'Large';

export type PdxRowSelectionMode = 'None' | 'Single' | 'Multiple';

export type PdxSortDirection = 'Ascending' | 'Descending';

export interface PdxSortState {
  columnKey: string;
  direction: PdxSortDirection;
}

/** `null` is the unsorted third state of the header button cycle. */
export type PdxSortValue = PdxSortState | null;

/** The part of a column definition sorting needs, shared by Table and DataGrid. */
export interface PdxSortableColumn<T> {
  dataIndex?: keyof T | string;
  key: string;
  sortable?: boolean;
  sortValue?: (record: T) => unknown;
}

/**
 * `size` is the caller-facing knob; `data-pdx-density` is what
 * `control.density-scale` reads. Medium is the scale's own base, so it emits no
 * attribute and an ancestor's choice is left alone.
 */
export function rowDensityAttribute(
  size: PdxRowSize
): 'comfortable' | 'compact' | undefined {
  if (size === 'Small') return 'compact';
  if (size === 'Large') return 'comfortable';
  return undefined;
}

export function resolveRowKey<T extends object>(
  record: T,
  index: number,
  rowKey?: PdxRowKeyResolver<T>
): Key {
  if (typeof rowKey === 'function') return rowKey(record, index);
  if (rowKey !== undefined) {
    const value = record[rowKey];
    if (typeof value === 'string' || typeof value === 'number') return value;
  }
  return index;
}

export function readCellValue<T extends object>(
  record: T,
  dataIndex: keyof T | string | undefined
): unknown {
  if (dataIndex === undefined) return undefined;
  return record[dataIndex as keyof T];
}

const toComparable = (value: unknown): number | string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isNaN(value) ? null : value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? null : time;
  }
  if (typeof value === 'string') return value;
  if (typeof value === 'symbol') return value.description ?? '';
  try {
    return String(value);
  } catch {
    return null;
  }
};

/**
 * Ascending order. Blanks sort lowest, numbers numerically and everything else
 * by locale with numeric segments compared as numbers, so `item-2` precedes
 * `item-10`.
 */
export function compareCellValues(left: unknown, right: unknown): number {
  const first = toComparable(left);
  const second = toComparable(right);

  if (first === null && second === null) return 0;
  if (first === null) return -1;
  if (second === null) return 1;
  if (typeof first === 'number' && typeof second === 'number') {
    return first === second ? 0 : first < second ? -1 : 1;
  }

  return String(first).localeCompare(String(second), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * A record paired with the identity it keeps across renders. Rows are carried
 * as entries rather than bare records so reordering never reshuffles keys: the
 * key comes from the record's position in the caller's data, not its position
 * on screen.
 */
export interface PdxRowEntry<T> {
  index: number;
  key: Key;
  record: T;
}

export function buildRowEntries<T extends object>(
  records: readonly T[],
  rowKey?: PdxRowKeyResolver<T>
): Array<PdxRowEntry<T>> {
  return records.map((record, index) => ({
    index,
    key: resolveRowKey(record, index, rowKey),
    record,
  }));
}

/**
 * Ordering is derived, never stored: the surface keeps sort state and rebuilds
 * the display order from it. Ties keep their incoming order in both directions,
 * which a plain reverse would not.
 */
export function sortRowEntries<T extends object>(
  entries: ReadonlyArray<PdxRowEntry<T>>,
  columns: ReadonlyArray<PdxSortableColumn<T>>,
  sort: PdxSortValue
): ReadonlyArray<PdxRowEntry<T>> {
  if (!sort) return entries;

  const column = columns.find((candidate) => candidate.key === sort.columnKey);
  if (!column?.sortable) return entries;

  const direction = sort.direction === 'Ascending' ? 1 : -1;
  const read = (record: T): unknown =>
    column.sortValue
      ? column.sortValue(record)
      : readCellValue(record, column.dataIndex);

  return [...entries].sort((left, right) => {
    const result = compareCellValues(read(left.record), read(right.record));
    return result === 0 ? left.index - right.index : result * direction;
  });
}

/** Ascending, then descending, then back to the data's own order. */
export function nextSortValue(
  current: PdxSortValue,
  columnKey: string
): PdxSortValue {
  if (!current || current.columnKey !== columnKey) {
    return { columnKey, direction: 'Ascending' };
  }
  if (current.direction === 'Ascending') {
    return { columnKey, direction: 'Descending' };
  }
  return null;
}

export function ariaSortValue(
  sort: PdxSortValue,
  columnKey: string
): 'ascending' | 'descending' | 'none' {
  if (!sort || sort.columnKey !== columnKey) return 'none';
  return sort.direction === 'Ascending' ? 'ascending' : 'descending';
}

/** The sentence a live region reads out after the sort state changes. */
export function sortAnnouncement(
  sort: PdxSortValue,
  columnLabel: string
): string {
  if (!sort) return `${columnLabel} unsorted`;
  return sort.direction === 'Ascending'
    ? `Sorted by ${columnLabel} ascending`
    : `Sorted by ${columnLabel} descending`;
}

export function nextSelection(
  current: readonly Key[],
  rowKey: Key,
  mode: PdxRowSelectionMode
): Key[] {
  if (mode === 'None') return [...current];
  if (mode === 'Single') {
    return current.length === 1 && current[0] === rowKey ? [] : [rowKey];
  }
  return current.includes(rowKey)
    ? current.filter((candidate) => candidate !== rowKey)
    : [...current, rowKey];
}

/**
 * `null` means the key is not a row-navigation key, or the caret is already at
 * the end it asks for — in both cases the surface must leave the event alone so
 * the scroll container keeps its native behaviour.
 */
export function nextRowIndex(
  key: string,
  currentIndex: number,
  rowCount: number
): number | null {
  if (rowCount === 0) return null;

  switch (key) {
    case 'ArrowDown':
      return currentIndex + 1 < rowCount ? currentIndex + 1 : null;
    case 'ArrowUp':
      return currentIndex > 0 ? currentIndex - 1 : null;
    case 'Home':
      return currentIndex === 0 ? null : 0;
    case 'End':
      return currentIndex === rowCount - 1 ? null : rowCount - 1;
    default:
      return null;
  }
}

interface RowSelectionOptions {
  defaultSelectedRowKeys?: Key[];
  onSelectionChange?: (selectedRowKeys: Key[]) => void;
  selectedRowKeys?: Key[];
  selectionMode: PdxRowSelectionMode;
}

export interface RowSelection {
  isSelected: (rowKey: Key) => boolean;
  selectable: boolean;
  selectedRowKeys: readonly Key[];
  toggle: (rowKey: Key) => void;
}

export function useRowSelection({
  defaultSelectedRowKeys,
  onSelectionChange,
  selectedRowKeys,
  selectionMode,
}: RowSelectionOptions): RowSelection {
  const [current, setCurrent] = useControllableState<Key[]>({
    defaultValue: defaultSelectedRowKeys ?? [],
    onChange: onSelectionChange,
    value: selectedRowKeys,
  });

  const selectable = selectionMode !== 'None';

  return {
    isSelected: (rowKey: Key) => current.includes(rowKey),
    selectable,
    selectedRowKeys: current,
    toggle: (rowKey: Key) => {
      if (!selectable) return;
      setCurrent(nextSelection(current, rowKey, selectionMode));
    },
  };
}

export interface RowKeyboard {
  moveFocus: (key: string, currentIndex: number) => boolean;
  registerRow: (rowKey: Key) => (element: HTMLElement | null) => void;
  setActiveRowKey: (rowKey: Key) => void;
  tabbableRowKey: Key | undefined;
}

/**
 * Rows are a single tab stop with arrow-key movement inside it, the same
 * roving-tabindex contract `PdxTree` uses. Without it a caller can render a
 * hundred selectable rows that a keyboard can never reach.
 */
export function useRowKeyboard(
  rowKeys: readonly Key[],
  preferredRowKey?: Key
): RowKeyboard {
  const rowElements = useRef(new Map<Key, HTMLElement>());
  const [activeRowKey, setActiveRowKey] = useState<Key | undefined>(undefined);

  const registerRow = useCallback(
    (rowKey: Key) => (element: HTMLElement | null) => {
      if (element) rowElements.current.set(rowKey, element);
      else rowElements.current.delete(rowKey);
    },
    []
  );

  const tabbableRowKey =
    activeRowKey !== undefined && rowKeys.includes(activeRowKey)
      ? activeRowKey
      : preferredRowKey !== undefined && rowKeys.includes(preferredRowKey)
        ? preferredRowKey
        : rowKeys[0];

  const moveFocus = (key: string, currentIndex: number) => {
    const targetIndex = nextRowIndex(key, currentIndex, rowKeys.length);
    if (targetIndex === null) return false;

    const targetKey = rowKeys[targetIndex];
    if (targetKey === undefined) return false;

    setActiveRowKey(targetKey);
    rowElements.current.get(targetKey)?.focus();
    return true;
  };

  return { moveFocus, registerRow, setActiveRowKey, tabbableRowKey };
}
