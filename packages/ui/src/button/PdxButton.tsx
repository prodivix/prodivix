import './PdxButton.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxButtonSpecificProps {
  text?: string;
  size?: 'Big' | 'Medium' | 'Small' | 'Tiny';
  category?:
    | 'Primary'
    | 'Secondary'
    | 'Danger'
    | 'SubtleDanger'
    | 'Warning'
    | 'SubtleWarning'
    | 'Ghost';
  disabled?: boolean;
  icon?: React.ReactNode;
  onlyIcon?: boolean;
  iconPosition?: 'Left' | 'Right';
}

export interface PdxButtonProps extends PdxComponent, PdxButtonSpecificProps {}

function PdxButton({
  text,
  size = 'Medium',
  category = 'Secondary',
  disabled = false,
  onlyIcon = false,
  icon,
  iconPosition = 'Right',
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
  as: Component = 'button',
}: PdxButtonProps) {
  const fullClassName =
    `PdxButton ${size} ${category} ${onlyIcon ? 'OnlyIcon' : ''} ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };

  const Element = Component as React.ElementType;

  if (onlyIcon && icon) {
    return (
      <Element
        className={fullClassName}
        style={style}
        id={id}
        onClick={onClick}
        {...dataProps}
      >
        {icon}
      </Element>
    );
  }
  if (icon && iconPosition === 'Left') {
    return (
      <Element
        className={fullClassName}
        style={style}
        id={id}
        onClick={onClick}
        {...dataProps}
      >
        {icon}
        <span>{text}</span>
      </Element>
    );
  }
  if (icon && iconPosition === 'Right') {
    return (
      <Element
        className={fullClassName}
        style={style}
        id={id}
        onClick={onClick}
        {...dataProps}
      >
        <span>{text}</span>
        {icon}
      </Element>
    );
  }
  return (
    <Element
      className={fullClassName}
      style={style}
      id={id}
      onClick={onClick}
      {...dataProps}
    >
      {text}
    </Element>
  );
}

export default PdxButton;
