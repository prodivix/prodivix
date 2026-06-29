import React from 'react';
import { Link, type To } from 'react-router';
import { type PdxComponent } from '@prodivix/shared';
import './PdxLink.scss';

interface PdxLinkSpecificProps {
  to: To;
  text?: string;
  title?: string;
  disabled?: boolean;
  underline?: boolean;
  children?: React.ReactNode;
}

export interface PdxLinkProps extends PdxComponent, PdxLinkSpecificProps {}

function PdxLink({
  to,
  text,
  title,
  disabled = false,
  underline = true,
  children,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
  as: LinkComponent = Link,
}: PdxLinkProps) {
  const content = children ?? text ?? 'Link';

  const fullClassName =
    `PdxLink ${disabled ? 'Disabled' : ''} ${underline ? '' : 'NoUnderline'} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };

  const Element = LinkComponent as React.ElementType;
  const linkProps = {
    to,
    className: fullClassName,
    style,
    id,
    title,
    onClick: onClick,
    ...dataProps,
  };

  const handleClick = disabled
    ? (e: React.MouseEvent) => {
        e.preventDefault();
      }
    : onClick;
  linkProps.onClick = handleClick;

  return <Element {...linkProps}>{content}</Element>;
}

export default PdxLink;
