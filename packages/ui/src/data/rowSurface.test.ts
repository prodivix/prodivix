import { describe, expect, it } from 'vitest';
import {
  ariaSortValue,
  buildRowEntries,
  compareCellValues,
  nextRowIndex,
  nextSelection,
  nextSortValue,
  readCellValue,
  rowDensityAttribute,
  sortAnnouncement,
  sortRowEntries,
  type PdxSortableColumn,
} from './rowSurface';

type Row = { label: string; score: number };

const columns: Array<PdxSortableColumn<Row>> = [
  { dataIndex: 'label', key: 'label', sortable: true },
  { dataIndex: 'score', key: 'score', sortable: true },
  { dataIndex: 'score', key: 'locked' },
];

const rows: Row[] = [
  { label: 'item-10', score: 2 },
  { label: 'item-2', score: 10 },
  { label: 'item-1', score: 2 },
];

const orderOf = (sortKey: string, direction: 'Ascending' | 'Descending') =>
  sortRowEntries(buildRowEntries(rows), columns, {
    columnKey: sortKey,
    direction,
  }).map((entry) => entry.record.label);

describe('row surface ordering', () => {
  it('compares numbers numerically and strings with numeric segments', () => {
    expect(compareCellValues(2, 10)).toBeLessThan(0);
    expect(compareCellValues('item-2', 'item-10')).toBeLessThan(0);
    expect(compareCellValues('b', 'a')).toBeGreaterThan(0);
    expect(compareCellValues(5, 5)).toBe(0);
  });

  it('treats missing values as the lowest value', () => {
    expect(compareCellValues(null, 0)).toBeLessThan(0);
    expect(compareCellValues(undefined, 'a')).toBeLessThan(0);
    expect(compareCellValues('', 'a')).toBeLessThan(0);
    expect(compareCellValues(null, undefined)).toBe(0);
  });

  it('orders by the sorted column in both directions', () => {
    expect(orderOf('score', 'Ascending')).toEqual([
      'item-10',
      'item-1',
      'item-2',
    ]);
    expect(orderOf('score', 'Descending')).toEqual([
      'item-2',
      'item-10',
      'item-1',
    ]);
  });

  it('keeps tied rows in their incoming order in both directions', () => {
    const ascendingTies = orderOf('score', 'Ascending').slice(0, 2);
    const descendingTies = orderOf('score', 'Descending').slice(1);

    expect(ascendingTies).toEqual(['item-10', 'item-1']);
    expect(descendingTies).toEqual(['item-10', 'item-1']);
  });

  it('leaves order alone for an unsorted state or a column that cannot sort', () => {
    const untouched = ['item-10', 'item-2', 'item-1'];

    expect(
      sortRowEntries(buildRowEntries(rows), columns, null).map(
        (entry) => entry.record.label
      )
    ).toEqual(untouched);
    expect(orderOf('locked', 'Ascending')).toEqual(untouched);
    expect(orderOf('missing', 'Ascending')).toEqual(untouched);
  });

  it('does not mutate the caller data', () => {
    const source = [...rows];
    orderOf('score', 'Descending');
    expect(source).toEqual(rows);
  });
});

describe('row surface identity', () => {
  it('keeps a row key bound to the record position in the caller data', () => {
    const entries = buildRowEntries(rows, 'label');
    const sorted = sortRowEntries(entries, columns, {
      columnKey: 'score',
      direction: 'Descending',
    });

    expect(sorted.map((entry) => entry.key)).toEqual([
      'item-2',
      'item-10',
      'item-1',
    ]);
    expect(sorted.map((entry) => entry.index)).toEqual([1, 0, 2]);
  });

  it('falls back to position when no usable key is available', () => {
    expect(buildRowEntries(rows).map((entry) => entry.key)).toEqual([0, 1, 2]);
  });

  it('reads a cell value only when the column declares one', () => {
    const first = rows[0] as Row;

    expect(readCellValue(first, 'score')).toBe(2);
    expect(readCellValue(first, undefined)).toBeUndefined();
  });
});

describe('row surface sort state', () => {
  it('cycles ascending, descending, unsorted', () => {
    const ascending = nextSortValue(null, 'label');
    expect(ascending).toEqual({ columnKey: 'label', direction: 'Ascending' });

    const descending = nextSortValue(ascending, 'label');
    expect(descending).toEqual({ columnKey: 'label', direction: 'Descending' });

    expect(nextSortValue(descending, 'label')).toBeNull();
  });

  it('restarts at ascending when a different column takes over', () => {
    expect(
      nextSortValue({ columnKey: 'label', direction: 'Descending' }, 'score')
    ).toEqual({ columnKey: 'score', direction: 'Ascending' });
  });

  it('reports the state for the sorted column only', () => {
    const sort = { columnKey: 'label', direction: 'Ascending' } as const;

    expect(ariaSortValue(sort, 'label')).toBe('ascending');
    expect(ariaSortValue(sort, 'score')).toBe('none');
    expect(ariaSortValue(null, 'label')).toBe('none');
  });

  it('phrases the change for a live region', () => {
    expect(
      sortAnnouncement({ columnKey: 'label', direction: 'Descending' }, 'Label')
    ).toBe('Sorted by Label descending');
    expect(sortAnnouncement(null, 'Label')).toBe('Label unsorted');
  });
});

describe('row surface selection and navigation', () => {
  it('replaces the selection in single mode and toggles it off on reselect', () => {
    expect(nextSelection(['a'], 'b', 'Single')).toEqual(['b']);
    expect(nextSelection(['a'], 'a', 'Single')).toEqual([]);
  });

  it('adds and removes in multiple mode', () => {
    expect(nextSelection(['a'], 'b', 'Multiple')).toEqual(['a', 'b']);
    expect(nextSelection(['a', 'b'], 'a', 'Multiple')).toEqual(['b']);
  });

  it('changes nothing when selection is off', () => {
    expect(nextSelection(['a'], 'b', 'None')).toEqual(['a']);
  });

  it('moves within bounds and yields the key back at the ends', () => {
    expect(nextRowIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextRowIndex('ArrowDown', 2, 3)).toBeNull();
    expect(nextRowIndex('ArrowUp', 0, 3)).toBeNull();
    expect(nextRowIndex('Home', 2, 3)).toBe(0);
    expect(nextRowIndex('End', 0, 3)).toBe(2);
    expect(nextRowIndex('End', 2, 3)).toBeNull();
    expect(nextRowIndex('PageDown', 0, 3)).toBeNull();
    expect(nextRowIndex('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('row density', () => {
  it('maps the caller size onto the shared density scale', () => {
    expect(rowDensityAttribute('Small')).toBe('compact');
    expect(rowDensityAttribute('Medium')).toBeUndefined();
    expect(rowDensityAttribute('Large')).toBe('comfortable');
  });
});
