import './PdxNotification.scss';
import { type PdxComponent } from '@prodivix/shared';
import { X } from 'lucide-react';
import type React from 'react';

interface PdxNotificationSpecificProps {
  title: string;
  description?: string;
  type?: 'Info' | 'Success' | 'Warning' | 'Danger';
  closable?: boolean;
  actions?: React.ReactNode;
  onClose?: () => void;
}

export interface PdxNotificationProps
  extends PdxComponent,
    PdxNotificationSpecificProps {}

function PdxNotification({
  title,
  description,
  type = 'Info',
  closable = false,
  actions,
  onClose,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxNotificationProps) {
  const fullClassName = `PdxNotification ${type} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      <div className="PdxNotificationHeader">
        <div className="PdxNotificationTitle">{title}</div>
        {closable && (
          <button
            type="button"
            className="PdxNotificationClose"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        )}
      </div>
      {description && (
        <div className="PdxNotificationDescription">{description}</div>
      )}
      {actions && <div className="PdxNotificationActions">{actions}</div>}
    </div>
  );
}

export default PdxNotification;
