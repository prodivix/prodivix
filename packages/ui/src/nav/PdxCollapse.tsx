import './PdxCollapse.scss';
import { type PdxComponent } from '@prodivix/shared';
import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type React from 'react';

export interface PdxCollapseItem {
  key: string;
  title: string;
  content: React.ReactNode;
  disabled?: boolean;
}

interface PdxCollapseSpecificProps {
  items: PdxCollapseItem[];
  activeKeys?: string[];
  defaultActiveKeys?: string[];
  accordion?: boolean;
  onChange?: (keys: string[]) => void;
}

export interface PdxCollapseProps
  extends PdxComponent,
    PdxCollapseSpecificProps {}

function PdxCollapse({
  items,
  activeKeys,
  defaultActiveKeys,
  accordion = false,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxCollapseProps) {
  const [internalKeys, setInternalKeys] = useState<string[]>(
    defaultActiveKeys || []
  );

  useEffect(() => {
    if (activeKeys) {
      setInternalKeys(activeKeys);
    }
  }, [activeKeys]);

  const currentKeys = activeKeys || internalKeys;

  const toggleKey = (key: string) => {
    let nextKeys: string[] = [];
    if (accordion) {
      nextKeys = currentKeys.includes(key) ? [] : [key];
    } else {
      nextKeys = currentKeys.includes(key)
        ? currentKeys.filter((item) => item !== key)
        : [...currentKeys, key];
    }

    if (!activeKeys) {
      setInternalKeys(nextKeys);
    }
    if (onChange) {
      onChange(nextKeys);
    }
  };

  const fullClassName = `PdxCollapse ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {items.map((item) => {
        const isOpen = currentKeys.includes(item.key);
        return (
          <div
            key={item.key}
            className={`PdxCollapseItem ${isOpen ? 'Open' : ''} ${item.disabled ? 'Disabled' : ''}`}
          >
            <button
              type="button"
              className="PdxCollapseHeader"
              onClick={() => !item.disabled && toggleKey(item.key)}
            >
              <span>{item.title}</span>
              <span className="PdxCollapseIcon">
                {isOpen ? <Minus size={14} /> : <Plus size={14} />}
              </span>
            </button>
            {isOpen && <div className="PdxCollapseContent">{item.content}</div>}
          </div>
        );
      })}
    </div>
  );
}

export default PdxCollapse;
