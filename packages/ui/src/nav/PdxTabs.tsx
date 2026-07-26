import './PdxTabs.scss';
import {
  getDataAttributes,
  mergeClassNames,
  type PdxNativeProps,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import {
  forwardRef,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

export interface PdxTabItem {
  content: ReactNode;
  disabled?: boolean;
  key: string;
  label: ReactNode;
}

export type PdxTabsOrientation = 'Horizontal' | 'Vertical';
export type PdxTabsVariant = 'Underline' | 'Pills';

export interface PdxTabsOwnProps {
  activeKey?: string;
  activationMode?: 'Automatic' | 'Manual';
  defaultActiveKey?: string;
  items: PdxTabItem[];
  onActiveKeyChange?: (key: string) => void;
  orientation?: PdxTabsOrientation;
  size?: 'Small' | 'Medium';
  variant?: PdxTabsVariant;
}

export type PdxTabsProps = Omit<PdxNativeProps<'div'>, 'children'> &
  PdxTabsOwnProps;

/**
 * The full ARIA tabs pattern: one tab in the tab order at a time, arrow keys
 * (following `orientation`) plus Home/End to move between them, and every tab
 * bound to its panel in both directions. `Manual` activation moves focus
 * without selecting; selection then comes from the button's own activation, so
 * Enter and Space need no special handling.
 */
const PdxTabs = forwardRef<HTMLDivElement, PdxTabsProps>(function PdxTabs(
  {
    'aria-label': ariaLabel = 'Tabs',
    activeKey,
    activationMode = 'Automatic',
    className,
    dataAttributes,
    defaultActiveKey,
    items,
    onActiveKeyChange,
    orientation = 'Horizontal',
    size = 'Medium',
    variant = 'Underline',
    ...rest
  },
  ref
) {
  const baseId = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const firstEnabledKey = items.find((item) => !item.disabled)?.key ?? '';
  const [requestedKey, setRequestedKey] = useControllableState({
    value: activeKey,
    defaultValue: defaultActiveKey ?? firstEnabledKey,
    onChange: onActiveKeyChange,
  });
  const requestedIndex = items.findIndex(
    (item) => item.key === requestedKey && !item.disabled
  );
  const fallbackIndex = items.findIndex((item) => !item.disabled);
  const selectedIndex = requestedIndex >= 0 ? requestedIndex : fallbackIndex;
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : undefined;
  const selectedKey = selectedItem?.key ?? '';

  const focusTab = (key: string) => {
    tabRefs.current.get(key)?.focus();
    if (activationMode === 'Automatic') setRequestedKey(key);
  };

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    itemKey: string
  ) => {
    const enabledItems = items.filter((item) => !item.disabled);
    const currentIndex = enabledItems.findIndex((item) => item.key === itemKey);
    if (currentIndex < 0) return;

    const previousKey = orientation === 'Horizontal' ? 'ArrowLeft' : 'ArrowUp';
    const nextKey = orientation === 'Horizontal' ? 'ArrowRight' : 'ArrowDown';
    let nextIndex: number | undefined;

    if (event.key === previousKey) {
      nextIndex =
        (currentIndex - 1 + enabledItems.length) % enabledItems.length;
    } else if (event.key === nextKey) {
      nextIndex = (currentIndex + 1) % enabledItems.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = enabledItems.length - 1;
    }

    const nextItem =
      nextIndex === undefined ? undefined : enabledItems[nextIndex];
    if (!nextItem) return;
    event.preventDefault();
    focusTab(nextItem.key);
  };

  return (
    <div
      {...rest}
      {...getDataAttributes(dataAttributes)}
      className={mergeClassNames(
        'PdxTabs',
        orientation,
        size,
        variant,
        className
      )}
      ref={ref}
    >
      <div
        aria-label={ariaLabel}
        aria-orientation={
          orientation.toLowerCase() as 'horizontal' | 'vertical'
        }
        className="PdxTabsList"
        role="tablist"
      >
        {items.map((item, index) => {
          const isSelected = item.key === selectedKey;
          return (
            <button
              aria-controls={`${baseId}-panel-${index}`}
              aria-selected={isSelected}
              className="PdxTabsTab"
              disabled={item.disabled}
              id={`${baseId}-tab-${index}`}
              key={item.key}
              onClick={() => setRequestedKey(item.key)}
              onKeyDown={(event) => handleKeyDown(event, item.key)}
              ref={(node) => {
                if (node) tabRefs.current.set(item.key, node);
                else tabRefs.current.delete(item.key);
              }}
              role="tab"
              tabIndex={isSelected ? 0 : -1}
              type="button"
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item, index) => {
        const isSelected = item.key === selectedKey;
        return (
          <div
            aria-labelledby={`${baseId}-tab-${index}`}
            className="PdxTabsPanel"
            hidden={!isSelected}
            id={`${baseId}-panel-${index}`}
            key={item.key}
            role="tabpanel"
            tabIndex={isSelected ? 0 : -1}
          >
            {item.content}
          </div>
        );
      })}
    </div>
  );
});

export default PdxTabs;
