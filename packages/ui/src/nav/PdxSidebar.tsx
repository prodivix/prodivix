import './PdxSidebar.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

export interface PdxSidebarItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
  active?: boolean;
}

interface PdxSidebarSpecificProps {
  title?: string;
  items?: PdxSidebarItem[];
  footer?: React.ReactNode;
  collapsed?: boolean;
  width?: number;
  children?: React.ReactNode;
}

export interface PdxSidebarProps
  extends PdxComponent,
    PdxSidebarSpecificProps {}

function PdxSidebar({
  title,
  items = [],
  footer,
  collapsed = false,
  width = 240,
  children,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxSidebarProps) {
  const fullClassName =
    `PdxSidebar ${collapsed ? 'Collapsed' : ''} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <aside
      className={fullClassName}
      style={{ width, ...(style as React.CSSProperties) }}
      id={id}
      {...dataProps}
    >
      {title && <div className="PdxSidebarTitle">{title}</div>}
      {children ? (
        children
      ) : (
        <nav className="PdxSidebarNav">
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href || '#'}
              className={`PdxSidebarItem ${item.active ? 'Active' : ''}`}
            >
              {item.icon && <span className="PdxSidebarIcon">{item.icon}</span>}
              {!collapsed && <span>{item.label}</span>}
            </a>
          ))}
        </nav>
      )}
      {footer && <div className="PdxSidebarFooter">{footer}</div>}
    </aside>
  );
}

export default PdxSidebar;
