import './PdxAnchorNavigation.scss';
import { type PdxComponent } from '@prodivix/shared';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import type React from 'react';

export interface PdxAnchorItem {
  id: string;
  label: string;
  href?: string;
}

interface PdxAnchorNavigationSpecificProps {
  items: PdxAnchorItem[];
  activeId?: string;
  navigationLabel?: string;
  orientation?: 'Vertical' | 'Horizontal';
  onSelect?: (item: PdxAnchorItem) => void;
}

export interface PdxAnchorNavigationProps
  extends PdxComponent, PdxAnchorNavigationSpecificProps {}

/**
 * `aria-current="location"` — not `"page"` — is the correct claim here: the
 * reader is somewhere inside the current page, not on a different one. It is
 * also the only place the active state is recorded, and the stylesheet draws
 * the marker from it.
 */
function PdxAnchorNavigation({
  items,
  activeId,
  navigationLabel = 'On this page',
  orientation = 'Vertical',
  onSelect,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxAnchorNavigationProps) {
  const fullClassName = mergeClassNames(
    'PdxAnchorNavigation',
    orientation,
    className
  );

  return (
    <nav
      aria-label={navigationLabel}
      className={fullClassName}
      {...getDataAttributes(dataAttributes)}
      id={id}
      style={style as React.CSSProperties}
    >
      <ul className="PdxAnchorNavigationList">
        {items.map((item) => (
          <li key={item.id}>
            <a
              aria-current={activeId === item.id ? 'location' : undefined}
              className="PdxAnchorNavigationItem"
              href={item.href || `#${item.id}`}
              onClick={() => onSelect?.(item)}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default PdxAnchorNavigation;
