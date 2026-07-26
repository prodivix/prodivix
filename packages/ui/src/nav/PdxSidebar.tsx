import './PdxSidebar.scss';
import { type PdxComponent } from '@prodivix/shared';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import type React from 'react';

export interface PdxSidebarItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}

interface PdxSidebarSpecificProps {
  title?: string;
  items?: PdxSidebarItem[];
  footer?: React.ReactNode;
  collapsed?: boolean;
  navigationLabel?: string;
  width?: number;
  children?: React.ReactNode;
  onItemSelect?: (item: PdxSidebarItem) => void;
}

export interface PdxSidebarProps
  extends PdxComponent, PdxSidebarSpecificProps {}

const firstCodePoint = (value: string) => Array.from(value)[0] ?? '';

/**
 * Selection and availability are declared once, as `aria-current` and
 * `aria-disabled`; the stylesheet reads those attributes rather than a parallel
 * set of modifier classes, so the marker a sighted user sees and the state a
 * screen reader hears cannot drift apart. Collapsing the rail hides item labels
 * visually but keeps them in the accessibility tree, so every link keeps its
 * name.
 */
function PdxSidebar({
  title,
  items = [],
  footer,
  collapsed = false,
  navigationLabel,
  width = 240,
  children,
  onItemSelect,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxSidebarProps) {
  const fullClassName = mergeClassNames(
    'PdxSidebar',
    collapsed && 'Collapsed',
    className
  );

  return (
    <aside
      className={fullClassName}
      {...getDataAttributes(dataAttributes)}
      id={id}
      style={{
        width: collapsed ? 64 : width,
        ...(style as React.CSSProperties),
      }}
    >
      {title && (
        <div className="PdxSidebarTitle">
          {collapsed && (
            <span aria-hidden="true" className="PdxSidebarTitleGlyph">
              {firstCodePoint(title)}
            </span>
          )}
          <span className="PdxSidebarTitleText">{title}</span>
        </div>
      )}
      {children ? (
        children
      ) : (
        <nav
          aria-label={navigationLabel ?? title ?? 'Sidebar'}
          className="PdxSidebarNav"
        >
          <ul className="PdxSidebarList">
            {items.map((item, index) => (
              <li key={`${item.label}-${index}`}>
                <a
                  aria-current={item.active ? 'page' : undefined}
                  aria-disabled={item.disabled || undefined}
                  className="PdxSidebarItem"
                  href={item.href || '#'}
                  onClick={(event) => {
                    if (!item.href || item.disabled) event.preventDefault();
                    if (!item.disabled) onItemSelect?.(item);
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  {item.icon ? (
                    <span aria-hidden="true" className="PdxSidebarIcon">
                      {item.icon}
                    </span>
                  ) : collapsed ? (
                    <span aria-hidden="true" className="PdxSidebarFallbackIcon">
                      {firstCodePoint(item.label)}
                    </span>
                  ) : null}
                  <span className="PdxSidebarItemLabel">{item.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {footer && <div className="PdxSidebarFooter">{footer}</div>}
    </aside>
  );
}

export default PdxSidebar;
