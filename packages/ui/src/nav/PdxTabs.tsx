import './PdxTabs.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useState } from 'react';
import type React from 'react';

export interface PdxTabItem {
  key: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
}

interface PdxTabsSpecificProps {
  items: PdxTabItem[];
  activeKey?: string;
  defaultActiveKey?: string;
  onChange?: (key: string) => void;
}

export interface PdxTabsProps extends PdxComponent, PdxTabsSpecificProps {}

function PdxTabs({
  items,
  activeKey,
  defaultActiveKey,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxTabsProps) {
  const [internalKey, setInternalKey] = useState(
    defaultActiveKey || items[0]?.key
  );

  useEffect(() => {
    if (activeKey !== undefined) {
      setInternalKey(activeKey);
    }
  }, [activeKey]);

  const currentKey = activeKey !== undefined ? activeKey : internalKey;
  const currentTab = items.find((item) => item.key === currentKey) || items[0];

  const handleChange = (key: string, disabled?: boolean) => {
    if (disabled) return;
    if (activeKey === undefined) {
      setInternalKey(key);
    }
    if (onChange) {
      onChange(key);
    }
  };

  const fullClassName = `PdxTabs ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      <div className="PdxTabsHeader">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`PdxTabsTab ${item.key === currentKey ? 'Active' : ''} ${item.disabled ? 'Disabled' : ''}`}
            onClick={() => handleChange(item.key, item.disabled)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="PdxTabsContent">{currentTab?.content}</div>
    </div>
  );
}

export default PdxTabs;
