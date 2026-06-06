import './PdxDrawer.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxDrawerSpecificProps {
  open: boolean;
  title?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  placement?: 'Left' | 'Right' | 'Top' | 'Bottom';
  size?: number;
  closeOnOverlayClick?: boolean;
  onClose?: () => void;
}

export interface PdxDrawerProps extends PdxComponent, PdxDrawerSpecificProps {}

function PdxDrawer({
  open,
  title,
  children,
  footer,
  placement = 'Right',
  size = 360,
  closeOnOverlayClick = true,
  onClose,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxDrawerProps) {
  if (!open) return null;

  const fullClassName = `PdxDrawer ${placement} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  const drawerStyle: React.CSSProperties =
    placement === 'Top' || placement === 'Bottom'
      ? { height: size, ...(style as React.CSSProperties) }
      : { width: size, ...(style as React.CSSProperties) };

  return (
    <div
      className="PdxDrawerOverlay"
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className={fullClassName}
        style={drawerStyle}
        id={id}
        {...dataProps}
        onClick={(event) => event.stopPropagation()}
      >
        {title && <div className="PdxDrawerHeader">{title}</div>}
        <div className="PdxDrawerBody">{children}</div>
        {footer && <div className="PdxDrawerFooter">{footer}</div>}
      </div>
    </div>
  );
}

export default PdxDrawer;
