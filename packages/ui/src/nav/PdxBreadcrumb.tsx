import './PdxBreadcrumb.scss';
import { type PdxComponent } from '@prodivix/shared';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import { ChevronRight } from 'lucide-react';
import type React from 'react';

export interface PdxBreadcrumbItem {
  label: string;
  href?: string;
  icon?: React.ReactNode;
}

interface PdxBreadcrumbSpecificProps {
  items: PdxBreadcrumbItem[];
  navigationLabel?: string;
  separator?: React.ReactNode;
}

export interface PdxBreadcrumbProps
  extends PdxComponent, PdxBreadcrumbSpecificProps {}

/**
 * A navigation landmark wrapping an ordered list: the order is the trail, so it
 * has to survive in the accessibility tree rather than only in the layout. The
 * last crumb carries `aria-current="page"` whether it is a link or plain text,
 * and separators are decoration the screen reader never hears.
 */
function PdxBreadcrumb({
  items,
  navigationLabel = 'Breadcrumb',
  separator = <ChevronRight aria-hidden="true" size={14} strokeWidth={1.8} />,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxBreadcrumbProps) {
  const fullClassName = mergeClassNames('PdxBreadcrumb', className);
  return (
    <nav
      aria-label={navigationLabel}
      className={fullClassName}
      {...getDataAttributes(dataAttributes)}
      id={id}
      style={style as React.CSSProperties}
    >
      <ol className="PdxBreadcrumbList">
        {items.map((item, index) => {
          const isCurrent = index === items.length - 1;
          const current = isCurrent ? 'page' : undefined;
          return (
            <li className="PdxBreadcrumbItem" key={`${item.label}-${index}`}>
              <span className="PdxBreadcrumbItemContent">
                {item.icon && (
                  <span aria-hidden="true" className="PdxBreadcrumbIcon">
                    {item.icon}
                  </span>
                )}
                {item.href ? (
                  <a aria-current={current} href={item.href}>
                    {item.label}
                  </a>
                ) : (
                  <span aria-current={current}>{item.label}</span>
                )}
              </span>
              {!isCurrent && (
                <span aria-hidden="true" className="PdxBreadcrumbSeparator">
                  {separator}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default PdxBreadcrumb;
