import './PdxCollapse.scss';
import {
  getDataAttributes,
  mergeClassNames,
  type PdxNativeProps,
} from '../foundation/component';
import { useControllableState } from '../foundation/useControllableState';
import { ChevronDown } from 'lucide-react';
import {
  forwardRef,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

export interface PdxCollapseItem {
  content: ReactNode;
  disabled?: boolean;
  key: string;
  title: ReactNode;
}

export interface PdxCollapseOwnProps {
  accordion?: boolean;
  activeKeys?: string[];
  defaultActiveKeys?: string[];
  items: PdxCollapseItem[];
  keepMounted?: boolean;
  onExpandedKeysChange?: (keys: string[]) => void;
}

export type PdxCollapseProps = Omit<PdxNativeProps<'div'>, 'children'> &
  PdxCollapseOwnProps;

/**
 * The panel element is always rendered so `aria-controls` always resolves to a
 * real region; `keepMounted` decides whether the *content* stays mounted, which
 * is a rendering cost question and not an accessibility one. Arrow keys, Home
 * and End move between headers, which is what makes a tall accordion navigable
 * without tabbing through every panel in between.
 */
const PdxCollapse = forwardRef<HTMLDivElement, PdxCollapseProps>(
  function PdxCollapse(
    {
      accordion = false,
      activeKeys,
      className,
      dataAttributes,
      defaultActiveKeys = [],
      items,
      keepMounted = false,
      onExpandedKeysChange,
      ...rest
    },
    ref
  ) {
    const baseId = useId();
    const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
    const [expandedKeys, setExpandedKeys] = useControllableState({
      value: activeKeys,
      defaultValue: accordion
        ? defaultActiveKeys.slice(0, 1)
        : defaultActiveKeys,
      onChange: onExpandedKeysChange,
    });

    const toggleKey = (key: string) => {
      const nextKeys = accordion
        ? expandedKeys.includes(key)
          ? []
          : [key]
        : expandedKeys.includes(key)
          ? expandedKeys.filter((item) => item !== key)
          : [...expandedKeys, key];
      setExpandedKeys(nextKeys);
    };

    const handleTriggerKeyDown = (
      event: KeyboardEvent<HTMLButtonElement>,
      itemKey: string
    ) => {
      const currentIndex = items.findIndex((item) => item.key === itemKey);
      if (currentIndex < 0 || items.length === 0) return;

      let nextIndex: number | undefined;
      if (event.key === 'ArrowDown') {
        nextIndex = (currentIndex + 1) % items.length;
      } else if (event.key === 'ArrowUp') {
        nextIndex = (currentIndex - 1 + items.length) % items.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = items.length - 1;
      }

      const nextItem = nextIndex === undefined ? undefined : items[nextIndex];
      if (!nextItem) return;
      event.preventDefault();
      triggerRefs.current.get(nextItem.key)?.focus();
    };

    return (
      <div
        {...rest}
        {...getDataAttributes(dataAttributes)}
        className={mergeClassNames('PdxCollapse', className)}
        ref={ref}
      >
        {items.map((item, index) => {
          const isOpen = expandedKeys.includes(item.key);
          const triggerId = `${baseId}-trigger-${index}`;
          const panelId = `${baseId}-panel-${index}`;
          return (
            <section
              className={mergeClassNames('PdxCollapseItem', isOpen && 'Open')}
              key={item.key}
            >
              <h3 className="PdxCollapseHeading">
                <button
                  aria-controls={panelId}
                  aria-disabled={item.disabled || undefined}
                  aria-expanded={isOpen}
                  className="PdxCollapseTrigger"
                  id={triggerId}
                  onClick={() => {
                    if (!item.disabled) toggleKey(item.key);
                  }}
                  onKeyDown={(event) => handleTriggerKeyDown(event, item.key)}
                  ref={(node) => {
                    if (node) triggerRefs.current.set(item.key, node);
                    else triggerRefs.current.delete(item.key);
                  }}
                  type="button"
                >
                  <span>{item.title}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className="PdxCollapseIcon"
                    size={16}
                  />
                </button>
              </h3>
              <div
                aria-labelledby={triggerId}
                className="PdxCollapsePanel"
                hidden={!isOpen}
                id={panelId}
                role="region"
              >
                {isOpen || keepMounted ? (
                  <div className="PdxCollapseContent">{item.content}</div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    );
  }
);

export default PdxCollapse;
