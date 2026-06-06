import './PdxBreadcrumb.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

export interface PdxBreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

interface PdxBreadcrumbSpecificProps {
  items: PdxBreadcrumbItem[];
  separator?: React.ReactNode;
}

export interface PdxBreadcrumbProps
  extends PdxComponent,
    PdxBreadcrumbSpecificProps {}

function PdxBreadcrumb({
  items,
  separator = '/',
  className,
  style,
  id,
  dataAttributes = {},
}: PdxBreadcrumbProps) {
  const fullClassName = `PdxBreadcrumb ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <nav
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {items.map((item, index) => (
        <span key={item.label} className="PdxBreadcrumbItem">
          {item.icon && <span className="PdxBreadcrumbIcon">{item.icon}</span>}
          {item.href ? (
            <a href={item.href}>{item.label}</a>
          ) : (
            <span>{item.label}</span>
          )}
          {index < items.length - 1 && (
            <span className="PdxBreadcrumbSeparator">{separator}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export default PdxBreadcrumb;
