import React from 'react';
import type { PdxComponent } from '@prodivix/shared';
import './PdxNav.scss';

interface PdxNavSpecificProps {
  columns?: 2 | 3;
  canHide?: boolean;
  isFloat?: boolean;
  backgroundStyle?: 'Transparent' | 'Solid' | 'Blurred';
  children?: React.ReactNode;
}

interface PdxNavProps extends PdxComponent, PdxNavSpecificProps {}

function PdxNav({
  columns = 2,
  canHide = false,
  isFloat = false,
  backgroundStyle = 'Solid',
  children,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
  as: Component = 'nav',
}: PdxNavProps) {
  const fullClassName =
    `PdxNav Columns-${columns} ${isFloat ? 'Float' : ''} ${canHide ? 'CanHide' : ''} ${backgroundStyle} ${className || ''}`.trim();
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

interface PdxNavAreaProps {
  children?: React.ReactNode;
}

function PdxNavLeft({ children }: PdxNavAreaProps) {
  return <div className="PdxNavLeft">{children}</div>;
}

function PdxNavCenter({ children }: PdxNavAreaProps) {
  return <div className="PdxNavCenter">{children}</div>;
}

function PdxNavRight({ children }: PdxNavAreaProps) {
  return <div className="PdxNavRight">{children}</div>;
}

function PdxNavHeading({ heading }: { heading: string }) {
  return <h1 className="PdxNavHeading">{heading}</h1>;
}

PdxNav.Left = PdxNavLeft;
PdxNav.Center = PdxNavCenter;
PdxNav.Right = PdxNavRight;
PdxNav.Heading = PdxNavHeading;

export default PdxNav;
