import './PdxPopover.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useState } from 'react';
import type React from 'react';

interface PdxPopoverSpecificProps {
  title?: string;
  content: React.ReactNode;
  trigger?: 'Click' | 'Hover';
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  panelClassName?: string;
  panelStyle?: React.CSSProperties;
  children: React.ReactNode;
}

export interface PdxPopoverProps
  extends PdxComponent,
    PdxPopoverSpecificProps {}

function PdxPopover({
  title,
  content,
  trigger = 'Click',
  open,
  defaultOpen = false,
  onOpenChange,
  panelClassName,
  panelStyle,
  children,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxPopoverProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);

  useEffect(() => {
    if (open !== undefined) {
      setInternalOpen(open);
    }
  }, [open]);

  const isOpen = open !== undefined ? open : internalOpen;

  const setOpen = (next: boolean) => {
    if (open === undefined) {
      setInternalOpen(next);
    }
    if (onOpenChange) {
      onOpenChange(next);
    }
  };

  const fullClassName = `PdxPopover ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  const triggerProps =
    trigger === 'Hover'
      ? {
          onMouseEnter: () => setOpen(true),
          onMouseLeave: () => setOpen(false),
        }
      : {
          onClick: () => setOpen(!isOpen),
        };

  return (
    <span
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
      {...triggerProps}
    >
      {children}
      {isOpen && (
        <span
          className={`PdxPopoverPanel ${panelClassName || ''}`.trim()}
          style={panelStyle}
        >
          {title && <div className="PdxPopoverTitle">{title}</div>}
          <div className="PdxPopoverContent">{content}</div>
        </span>
      )}
    </span>
  );
}

export default PdxPopover;
