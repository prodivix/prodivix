import './PdxPanel.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useState } from 'react';

interface PdxPanelSpecificProps {
  children: React.ReactNode;
  size?: 'Small' | 'Medium' | 'Large';
  variant?: 'Default' | 'Bordered' | 'Filled';
  padding?: 'None' | 'Small' | 'Medium' | 'Large';
  collapsible?: boolean;
  collapsed?: boolean;
  onToggle?: () => void;
  title?: string;
}

export interface PdxPanelProps extends PdxComponent, PdxPanelSpecificProps {}

function PdxPanel({
  children,
  size = 'Medium',
  variant = 'Default',
  padding = 'Medium',
  collapsible = false,
  collapsed = false,
  onToggle,
  title,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(collapsed);

  const handleToggle = () => {
    if (collapsible) {
      const newCollapsed = !isCollapsed;
      setIsCollapsed(newCollapsed);
      if (onToggle) {
        onToggle();
      }
    }
  };

  const fullClassName =
    `PdxPanel ${size} ${variant} Padding${padding} ${collapsible ? 'Collapsible' : ''} ${isCollapsed ? 'Collapsed' : ''} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };

  return (
    <div
      className={fullClassName}
      style={style as React.CSSProperties | undefined}
      id={id}
      {...dataProps}
    >
      {title && (
        <div
          className="PdxPanelHeader"
          onClick={collapsible ? handleToggle : undefined}
        >
          <h3 className="PdxPanelTitle">{title}</h3>
          {collapsible && (
            <button
              type="button"
              className="PdxPanelToggle"
              aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s ease',
                }}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}
        </div>
      )}
      <div className="PdxPanelContent">{children}</div>
    </div>
  );
}

export default PdxPanel;
