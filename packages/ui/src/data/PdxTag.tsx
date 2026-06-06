import './PdxTag.scss';
import { type PdxComponent } from '@prodivix/shared';
import { X } from 'lucide-react';
import type React from 'react';

interface PdxTagSpecificProps {
  text?: string;
  color?:
    | 'Default'
    | 'Primary'
    | 'Secondary'
    | 'Success'
    | 'Warning'
    | 'Danger';
  size?: 'Small' | 'Medium' | 'Large';
  variant?: 'Solid' | 'Outline' | 'Soft';
  closable?: boolean;
  onClose?: () => void;
}

export interface PdxTagProps extends PdxComponent, PdxTagSpecificProps {}

function PdxTag({
  text,
  color = 'Default',
  size = 'Medium',
  variant = 'Soft',
  closable = false,
  onClose,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxTagProps) {
  const fullClassName =
    `PdxTag ${size} ${color} ${variant} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <span
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      onClick={onClick}
      {...dataProps}
    >
      <span className="PdxTagText">{text}</span>
      {closable && (
        <button type="button" className="PdxTagClose" onClick={onClose}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}

export default PdxTag;
