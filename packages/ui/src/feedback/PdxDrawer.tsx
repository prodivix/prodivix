import './PdxDrawer.scss';
import OverlayDialog, { type PdxOverlayCloseReason } from './OverlayDialog';
import type { CSSProperties, ReactNode } from 'react';

export type { PdxOverlayCloseReason };

export type PdxDrawerPlacement = 'Left' | 'Right' | 'Top' | 'Bottom';

export interface PdxDrawerProps {
  children?: ReactNode;
  className?: string;
  closeLabel?: string;
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
  dataAttributes?: Record<string, string>;
  description?: ReactNode;
  footer?: ReactNode;
  id?: string;
  onClose?: (reason: PdxOverlayCloseReason) => void;
  onOpenChange?: (open: boolean) => void;
  open: boolean;
  placement?: PdxDrawerPlacement;
  portal?: boolean;
  showClose?: boolean;
  size?: number | string;
  style?: CSSProperties;
  title: ReactNode;
}

function PdxDrawer({
  closeLabel = 'Close drawer',
  closeOnEscape = true,
  closeOnOverlayClick = true,
  placement = 'Right',
  portal = true,
  showClose = true,
  size = 360,
  style,
  ...rest
}: PdxDrawerProps) {
  const dimension = typeof size === 'number' ? `${size}px` : size;
  const contentStyle: CSSProperties =
    placement === 'Top' || placement === 'Bottom'
      ? { height: dimension, ...style }
      : { width: dimension, ...style };

  return (
    <OverlayDialog
      {...rest}
      block="PdxDrawer"
      closeLabel={closeLabel}
      closeOnEscape={closeOnEscape}
      closeOnOverlayClick={closeOnOverlayClick}
      contentStyle={contentStyle}
      modifier={placement}
      portal={portal}
      showClose={showClose}
    />
  );
}

export default PdxDrawer;
