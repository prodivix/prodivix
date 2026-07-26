import './PdxVirtualList.scss';
import {
  assignRef,
  getDataAttributes,
  mergeClassNames,
  type PdxNativeProps,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import {
  forwardRef,
  useCallback,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type UIEvent,
} from 'react';

export interface PdxVirtualListItem {
  /** Stable identity of the row. */
  key: string;
  content: ReactNode;
  disabled?: boolean;
}

export interface PdxVirtualListOwnProps {
  items: PdxVirtualListItem[];
  /** Fixed pixel height of every row. */
  rowHeight?: number;
  /** Pixel height of the scrolling viewport; the list owns its own height. */
  height?: number;
  /** Rows kept rendered on each side of the viewport. */
  overscan?: number;
  activeKey?: string;
  defaultActiveKey?: string;
  onActiveKeyChange?: (key: string) => void;
  selectedKey?: string;
  defaultSelectedKey?: string;
  onSelectedKeyChange?: (key: string) => void;
}

export type PdxVirtualListProps = Omit<PdxNativeProps<'div'>, 'children'> &
  PdxVirtualListOwnProps;

const DEFAULT_ROW_HEIGHT = 32;
const DEFAULT_HEIGHT = 320;
const DEFAULT_OVERSCAN = 4;

/**
 * A windowed list that stays a list for assistive technology.
 *
 * Only a window of rows exists in the DOM, so every option carries
 * `aria-setsize`/`aria-posinset` describing the whole collection rather than
 * the window. Scroll position lives in React state and the DOM scroll offset is
 * its projection, which is what lets the keyboard walk the full logical list:
 * moving the active row moves the window with it instead of stopping at the
 * edge of what happens to be rendered.
 */
const PdxVirtualList = forwardRef<HTMLDivElement, PdxVirtualListProps>(
  function PdxVirtualList(
    {
      'aria-label': ariaLabel = 'List',
      activeKey,
      className,
      dataAttributes,
      defaultActiveKey,
      defaultSelectedKey,
      height = DEFAULT_HEIGHT,
      items,
      onActiveKeyChange,
      onKeyDown,
      onScroll,
      onSelectedKeyChange,
      overscan = DEFAULT_OVERSCAN,
      rowHeight = DEFAULT_ROW_HEIGHT,
      selectedKey,
      ...rest
    },
    ref
  ) {
    const baseId = useId().replaceAll(':', '');
    const viewportRef = useRef<HTMLDivElement | null>(null);
    const [scrollTop, setScrollTop] = useState(0);

    const emitActiveKey = useCallback(
      (next: string | undefined) => {
        if (next !== undefined) onActiveKeyChange?.(next);
      },
      [onActiveKeyChange]
    );
    const emitSelectedKey = useCallback(
      (next: string | undefined) => {
        if (next !== undefined) onSelectedKeyChange?.(next);
      },
      [onSelectedKeyChange]
    );

    const [requestedActiveKey, setRequestedActiveKey] = useControllableState<
      string | undefined
    >({
      value: activeKey,
      defaultValue: defaultActiveKey,
      onChange: emitActiveKey,
    });
    const [currentSelectedKey, setSelectedKey] = useControllableState<
      string | undefined
    >({
      value: selectedKey,
      defaultValue: defaultSelectedKey,
      onChange: emitSelectedKey,
    });

    const requestedIndex = items.findIndex(
      (item) => item.key === requestedActiveKey && !item.disabled
    );
    const activeIndex =
      requestedIndex >= 0
        ? requestedIndex
        : items.findIndex((item) => !item.disabled);

    const totalHeight = items.length * rowHeight;
    const rowsPerViewport = Math.max(1, Math.ceil(height / rowHeight));
    const firstVisible = Math.max(0, Math.floor(scrollTop / rowHeight));
    const windowStart = Math.max(0, firstVisible - overscan);
    const windowEnd = Math.min(
      items.length,
      firstVisible + rowsPerViewport + overscan
    );

    const renderedIndices: number[] = [];
    for (let index = windowStart; index < windowEnd; index += 1) {
      renderedIndices.push(index);
    }
    // The active row stays mounted even when scrolled out of the window, so
    // `aria-activedescendant` never points at an id that left the DOM.
    if (
      activeIndex >= 0 &&
      (activeIndex < windowStart || activeIndex >= windowEnd)
    ) {
      renderedIndices.push(activeIndex);
    }

    const optionId = (index: number) => `${baseId}-option-${index}`;

    const scrollIndexIntoView = (index: number) => {
      const top = index * rowHeight;
      const bottom = top + rowHeight;
      const nextScrollTop =
        top < scrollTop
          ? top
          : bottom > scrollTop + height
            ? bottom - height
            : scrollTop;

      if (nextScrollTop === scrollTop) return;
      setScrollTop(nextScrollTop);
      if (viewportRef.current) viewportRef.current.scrollTop = nextScrollTop;
    };

    const moveActive = (index: number) => {
      const item = items[index];
      if (!item || item.disabled) return;

      setRequestedActiveKey(item.key);
      scrollIndexIntoView(index);
    };

    const findEnabled = (from: number, direction: 1 | -1) => {
      for (
        let index = from;
        index >= 0 && index < items.length;
        index += direction
      ) {
        if (!items[index]?.disabled) return index;
      }
      return -1;
    };

    const handleScroll = (event: UIEvent<HTMLDivElement>) => {
      setScrollTop(event.currentTarget.scrollTop);
      onScroll?.(event);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || items.length === 0) return;

      const from = activeIndex >= 0 ? activeIndex : 0;
      let next = -1;

      switch (event.key) {
        case 'ArrowDown':
          next = findEnabled(from + 1, 1);
          break;
        case 'ArrowUp':
          next = findEnabled(from - 1, -1);
          break;
        case 'Home':
          next = findEnabled(0, 1);
          break;
        case 'End':
          next = findEnabled(items.length - 1, -1);
          break;
        case 'PageDown': {
          const target = Math.min(items.length - 1, from + rowsPerViewport);
          next = findEnabled(target, 1);
          if (next < 0) next = findEnabled(target, -1);
          break;
        }
        case 'PageUp': {
          const target = Math.max(0, from - rowsPerViewport);
          next = findEnabled(target, -1);
          if (next < 0) next = findEnabled(target, 1);
          break;
        }
        case 'Enter':
        case ' ': {
          const active = activeIndex >= 0 ? items[activeIndex] : undefined;
          if (!active) return;
          event.preventDefault();
          setSelectedKey(active.key);
          return;
        }
        default:
          return;
      }

      if (next < 0) return;
      event.preventDefault();
      moveActive(next);
    };

    const activeDescendant =
      activeIndex >= 0 ? optionId(activeIndex) : undefined;

    return (
      <div
        {...rest}
        {...getDataAttributes(dataAttributes)}
        aria-activedescendant={activeDescendant}
        aria-label={ariaLabel}
        className={mergeClassNames('PdxVirtualList', className)}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        ref={(node) => {
          viewportRef.current = node;
          assignRef(ref, node);
        }}
        role="listbox"
        style={{ height: `${height}px` } satisfies CSSProperties}
        tabIndex={0}
      >
        <div
          aria-hidden="true"
          className="PdxVirtualListSpacer"
          style={{ height: `${totalHeight}px` }}
        />
        {renderedIndices.map((index) => {
          const item = items[index];
          if (!item) return null;

          return (
            <div
              aria-disabled={item.disabled || undefined}
              aria-posinset={index + 1}
              aria-selected={item.key === currentSelectedKey}
              aria-setsize={items.length}
              className="PdxVirtualListRow"
              data-pdx-active={index === activeIndex ? 'true' : undefined}
              id={optionId(index)}
              key={item.key}
              onClick={() => {
                if (item.disabled) return;
                setRequestedActiveKey(item.key);
                setSelectedKey(item.key);
              }}
              role="option"
              style={
                {
                  height: `${rowHeight}px`,
                  transform: `translateY(${index * rowHeight}px)`,
                } satisfies CSSProperties
              }
            >
              {item.content}
            </div>
          );
        })}
      </div>
    );
  }
);

export default PdxVirtualList;
