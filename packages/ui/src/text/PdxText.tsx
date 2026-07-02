import './PdxText.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxTextSpecificProps {
  children: React.ReactNode;
  size?: 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Big';
  weight?: 'Light' | 'Normal' | 'Medium' | 'SemiBold' | 'Bold';
  color?:
    | 'Default'
    | 'Muted'
    | 'Primary'
    | 'Secondary'
    | 'Danger'
    | 'Warning'
    | 'Success';
  align?: 'Left' | 'Center' | 'Right';
  truncate?: boolean;
}

export interface PdxTextProps extends PdxComponent, PdxTextSpecificProps {}

function PdxText({
  children,
  size = 'Medium',
  weight = 'Normal',
  color = 'Default',
  align = 'Left',
  truncate = false,
  as: Component = 'span',
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxTextProps) {
  const fullClassName =
    `PdxText ${size} ${weight} ${color} ${align} ${truncate ? 'Truncate' : ''} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };

  const Element = Component as React.ElementType;

  return (
    <Element
      className={fullClassName}
      style={style}
      id={id}
      onClick={onClick}
      {...dataProps}
    >
      {children}
    </Element>
  );
}

export default PdxText;
