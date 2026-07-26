import './PdxList.scss';
import PdxEmpty from '../feedback/PdxEmpty';
import PdxSkeleton from '../feedback/PdxSkeleton';
import { type PdxComponent } from '@prodivix/shared';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import { useMemo, type Key, type ReactNode } from 'react';
import type React from 'react';
import {
  buildRowEntries,
  rowDensityAttribute,
  useRowKeyboard,
  useRowSelection,
  type PdxRowKeyResolver,
  type PdxRowSelectionMode,
  type PdxRowSize,
} from './rowSurface';

export interface PdxListItem {
  description?: string;
  disabled?: boolean;
  extra?: React.ReactNode;
  id?: React.Key;
  title: string;
}

interface PdxListSpecificProps {
  'aria-label'?: string;
  'aria-labelledby'?: string;
  bordered?: boolean;
  defaultSelectedKeys?: Key[];
  emptyState?: ReactNode;
  emptyText?: ReactNode;
  items: Array<PdxListItem>;
  loading?: boolean;
  loadingRows?: number;
  onSelectionChange?: (selectedKeys: Key[]) => void;
  renderItem?: (item: PdxListItem, index: number) => React.ReactNode;
  rowKey?: PdxRowKeyResolver<PdxListItem>;
  selectedKeys?: Key[];
  selectionMode?: PdxRowSelectionMode;
  size?: PdxRowSize;
  split?: boolean;
}

export interface PdxListProps extends PdxComponent, PdxListSpecificProps {}

const itemRowKey: PdxRowKeyResolver<PdxListItem> = (item, index) =>
  item.id ?? index;

/**
 * Two lists in one component, and the difference is whether the rows do
 * anything. A read-only list stays plain `ul`/`li` so rows may hold their own
 * controls; a selectable one becomes a `listbox` of `option`s with a roving
 * tabindex, which is the only shape where `aria-selected` and keyboard reach
 * are both true.
 */
function PdxList({
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  bordered = false,
  className,
  dataAttributes = {},
  defaultSelectedKeys,
  emptyState,
  emptyText = 'Nothing here yet',
  id,
  items,
  loading = false,
  loadingRows = 3,
  onSelectionChange,
  renderItem,
  rowKey = itemRowKey,
  selectedKeys,
  selectionMode = 'None',
  size = 'Medium',
  split = true,
  style,
}: PdxListProps) {
  const entries = useMemo(
    () => buildRowEntries(items, rowKey),
    [items, rowKey]
  );
  const rowKeys = useMemo(() => entries.map((entry) => entry.key), [entries]);

  const selection = useRowSelection({
    defaultSelectedRowKeys: defaultSelectedKeys,
    onSelectionChange,
    selectedRowKeys: selectedKeys,
    selectionMode,
  });
  const keyboard = useRowKeyboard(rowKeys, selection.selectedRowKeys[0]);

  const renderBody = () => {
    if (loading) {
      return (
        <div className="PdxListLoading">
          {Array.from({ length: Math.max(1, loadingRows) }, (_, index) => (
            <div className="PdxListLoadingRow" key={`loading-${index}`}>
              <PdxSkeleton lines={2} />
            </div>
          ))}
        </div>
      );
    }

    if (entries.length === 0) {
      return emptyState ?? <PdxEmpty title={emptyText} />;
    }

    return (
      <ul
        aria-label={
          selection.selectable && !ariaLabelledBy
            ? (ariaLabel ?? 'List')
            : ariaLabel
        }
        aria-labelledby={ariaLabelledBy}
        aria-multiselectable={selectionMode === 'Multiple' ? true : undefined}
        className={mergeClassNames(
          'PdxList',
          size,
          bordered && 'Bordered',
          split && 'Split',
          selection.selectable && 'Selectable'
        )}
        role={selection.selectable ? 'listbox' : undefined}
      >
        {entries.map((entry, displayIndex) => {
          const item = entry.record;
          const interactive = selection.selectable && !item.disabled;

          return (
            <li
              aria-disabled={
                selection.selectable && item.disabled ? true : undefined
              }
              aria-selected={
                selection.selectable
                  ? selection.isSelected(entry.key)
                  : undefined
              }
              className="PdxListItem"
              key={entry.key}
              onClick={
                interactive
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
                        if (!interactive) return;
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
              role={selection.selectable ? 'option' : undefined}
              tabIndex={
                selection.selectable
                  ? keyboard.tabbableRowKey === entry.key
                    ? 0
                    : -1
                  : undefined
              }
            >
              {renderItem ? (
                renderItem(item, entry.index)
              ) : (
                <>
                  <div className="PdxListContent">
                    <div className="PdxListTitle">{item.title}</div>
                    {item.description && (
                      <div className="PdxListDescription">
                        {item.description}
                      </div>
                    )}
                  </div>
                  {item.extra && (
                    <div className="PdxListExtra">{item.extra}</div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div
      {...(rowDensityAttribute(size)
        ? { 'data-pdx-density': rowDensityAttribute(size) }
        : {})}
      {...getDataAttributes(dataAttributes)}
      aria-busy={loading || undefined}
      className={mergeClassNames('PdxListRegion', className)}
      id={id}
      style={style as React.CSSProperties}
    >
      {renderBody()}
    </div>
  );
}

export default PdxList;
