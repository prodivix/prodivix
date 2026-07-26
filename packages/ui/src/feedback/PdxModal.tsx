import './PdxModal.scss';
import OverlayDialog, { type PdxOverlayCloseReason } from './OverlayDialog';
import type { CSSProperties, ReactNode } from 'react';

export type { PdxOverlayCloseReason };

export type PdxModalSize = 'Small' | 'Medium' | 'Large';

export interface PdxModalProps {
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
  portal?: boolean;
  showClose?: boolean;
  size?: PdxModalSize;
  style?: CSSProperties;
  title: ReactNode;
}

function PdxModal({
  closeLabel = 'Close dialog',
  closeOnEscape = true,
  closeOnOverlayClick = true,
  portal = true,
  showClose = true,
  size = 'Medium',
  style,
  ...rest
}: PdxModalProps) {
  return (
    <OverlayDialog
      {...rest}
      block="PdxModal"
      closeLabel={closeLabel}
      closeOnEscape={closeOnEscape}
      closeOnOverlayClick={closeOnOverlayClick}
      contentStyle={style}
      modifier={size}
      portal={portal}
      showClose={showClose}
    />
  );
}

export default PdxModal;
