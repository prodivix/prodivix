import './PdxModal.scss';
import { type PdxComponent } from '@prodivix/shared';
import { X } from 'lucide-react';
import type React from 'react';

interface PdxModalSpecificProps {
  open: boolean;
  title?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'Small' | 'Medium' | 'Large';
  closeOnOverlayClick?: boolean;
  showClose?: boolean;
  onClose?: () => void;
}

export interface PdxModalProps extends PdxComponent, PdxModalSpecificProps {}

function PdxModal({
  open,
  title,
  children,
  footer,
  size = 'Medium',
  closeOnOverlayClick = true,
  showClose = true,
  onClose,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxModalProps) {
  if (!open) return null;

  const fullClassName = `PdxModal ${size} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className="PdxModalOverlay"
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className={fullClassName}
        style={style as React.CSSProperties}
        id={id}
        {...dataProps}
        onClick={(event) => event.stopPropagation()}
      >
        {(title || showClose) && (
          <div className="PdxModalHeader">
            {title && <h3>{title}</h3>}
            {showClose && (
              <button type="button" className="PdxModalClose" onClick={onClose}>
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <div className="PdxModalBody">{children}</div>
        {footer && <div className="PdxModalFooter">{footer}</div>}
      </div>
    </div>
  );
}

export default PdxModal;
