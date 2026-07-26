import './PdxNavbar.scss';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

export interface PdxNavbarItem {
  label: string;
  href?: string;
  active?: boolean;
  disabled?: boolean;
  target?: React.HTMLAttributeAnchorTarget;
}

interface PdxNavbarSpecificProps {
  brand?: React.ReactNode;
  items?: PdxNavbarItem[];
  actions?: React.ReactNode;
  variant?: 'Solid' | 'Transparent' | 'Blurred';
  size?: 'Small' | 'Medium' | 'Large';
  sticky?: boolean;
  navigationLabel?: string;
  onItemSelect?: (item: PdxNavbarItem, index: number) => void;
  children?: React.ReactNode;
}

export interface PdxNavbarProps extends PdxComponent, PdxNavbarSpecificProps {}

/**
 * Item state lives in ARIA: `aria-current` marks the item the user is on and
 * `aria-disabled` marks one they cannot reach, and the stylesheet keys off both
 * so no modifier class can contradict them. A disabled item stays focusable
 * rather than being dropped from the tab order, so its unavailability is
 * announced instead of silently skipped.
 */
function PdxNavbar({
  brand,
  items = [],
  actions,
  variant = 'Solid',
  size = 'Medium',
  sticky = false,
  navigationLabel = 'Main',
  onItemSelect,
  children,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxNavbarProps) {
  const fullClassName = mergeClassNames(
    'PdxNavbar',
    size,
    variant,
    sticky && 'Sticky',
    children && 'CustomContent',
    className
  );

  return (
    <nav
      aria-label={navigationLabel}
      className={fullClassName}
      id={id}
      onClick={onClick}
      style={style as React.CSSProperties}
      {...getDataAttributes(dataAttributes)}
    >
      {children ? (
        children
      ) : (
        <>
          <div className="PdxNavbarBrand">{brand}</div>
          <ul className="PdxNavbarItems">
            {items.map((item, index) => {
              const handleSelect = (
                event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>
              ) => {
                if (item.disabled) {
                  event.preventDefault();
                  return;
                }
                onItemSelect?.(item, index);
              };

              return (
                <li key={`${item.label}-${index}`}>
                  {item.href ? (
                    <a
                      aria-current={item.active ? 'page' : undefined}
                      aria-disabled={item.disabled || undefined}
                      className="PdxNavbarItem"
                      href={item.href}
                      onClick={handleSelect}
                      rel={item.target === '_blank' ? 'noreferrer' : undefined}
                      target={item.target}
                    >
                      {item.label}
                    </a>
                  ) : (
                    <button
                      aria-current={item.active ? 'page' : undefined}
                      aria-disabled={item.disabled || undefined}
                      className="PdxNavbarItem"
                      onClick={handleSelect}
                      type="button"
                    >
                      {item.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="PdxNavbarActions">{actions}</div>
        </>
      )}
    </nav>
  );
}

export default PdxNavbar;
