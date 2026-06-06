import './PdxNavbar.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

export interface PdxNavbarItem {
  label: string;
  href?: string;
  active?: boolean;
}

interface PdxNavbarSpecificProps {
  brand?: React.ReactNode;
  items?: PdxNavbarItem[];
  actions?: React.ReactNode;
  variant?: 'Solid' | 'Transparent' | 'Blurred';
  size?: 'Small' | 'Medium' | 'Large';
  sticky?: boolean;
  children?: React.ReactNode;
}

export interface PdxNavbarProps extends PdxComponent, PdxNavbarSpecificProps {}

function PdxNavbar({
  brand,
  items = [],
  actions,
  variant = 'Solid',
  size = 'Medium',
  sticky = false,
  children,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxNavbarProps) {
  const fullClassName =
    `PdxNavbar ${size} ${variant} ${sticky ? 'Sticky' : ''} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <nav
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {children ? (
        children
      ) : (
        <>
          <div className="PdxNavbarBrand">{brand}</div>
          <div className="PdxNavbarItems">
            {items.map((item) => (
              <a
                key={item.label}
                href={item.href || '#'}
                className={`PdxNavbarItem ${item.active ? 'Active' : ''}`}
              >
                {item.label}
              </a>
            ))}
          </div>
          <div className="PdxNavbarActions">{actions}</div>
        </>
      )}
    </nav>
  );
}

export default PdxNavbar;
