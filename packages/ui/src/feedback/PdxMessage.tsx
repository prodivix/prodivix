import './PdxMessage.scss';
import { type PdxComponent } from '@prodivix/shared';
import { X } from 'lucide-react';

interface PdxMessageSpecificProps {
  text: string;
  type?: 'Info' | 'Success' | 'Warning' | 'Danger';
  closable?: boolean;
  onClose?: () => void;
}

export interface PdxMessageProps
  extends PdxComponent,
    PdxMessageSpecificProps {}

function PdxMessage({
  text,
  type = 'Info',
  closable = false,
  onClose,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxMessageProps) {
  const fullClassName = `PdxMessage ${type} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      <span>{text}</span>
      {closable && (
        <button type="button" className="PdxMessageClose" onClick={onClose}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default PdxMessage;
