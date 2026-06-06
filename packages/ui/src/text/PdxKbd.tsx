import './PdxKbd.scss';
import { type PdxComponent } from '@prodivix/shared';
import { Keyboard } from 'lucide-react';
import type React from 'react';

interface PdxKbdSpecificProps {
  children?: React.ReactNode;
  text?: string;
  size?: 'Tiny' | 'Small' | 'Medium' | 'Large';
  texture?: 'Flat' | 'Soft' | 'Raised' | 'Inset';
  tone?: 'Default' | 'Muted' | 'Primary' | 'Danger' | 'Warning' | 'Success';
  showIcon?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'Left' | 'Right';
  bordered?: boolean;
  filled?: boolean;
}

export interface PdxKbdProps extends PdxComponent, PdxKbdSpecificProps {}

function PdxKbd({
  children,
  text,
  size = 'Small',
  texture = 'Soft',
  tone = 'Default',
  showIcon = false,
  icon,
  iconPosition = 'Left',
  bordered = true,
  filled = true,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
  as: Component = 'kbd',
}: PdxKbdProps) {
  const content = children ?? text;
  const shouldRenderIcon = showIcon || Boolean(icon);
  const resolvedIcon = icon ?? <Keyboard size={12} aria-hidden="true" />;
  const fullClassName =
    `PdxKbd ${size} ${texture} ${tone} ${bordered ? 'Bordered' : 'Borderless'} ${filled ? 'Filled' : 'Unfilled'} ${shouldRenderIcon ? 'WithIcon' : ''} ${className || ''}`.trim();
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
      {shouldRenderIcon && iconPosition === 'Left' && (
        <span className="PdxKbdIcon" aria-hidden="true">
          {resolvedIcon}
        </span>
      )}
      <span className="PdxKbdText">{content}</span>
      {shouldRenderIcon && iconPosition === 'Right' && (
        <span className="PdxKbdIcon" aria-hidden="true">
          {resolvedIcon}
        </span>
      )}
    </Element>
  );
}

export default PdxKbd;
