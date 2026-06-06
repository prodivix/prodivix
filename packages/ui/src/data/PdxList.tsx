import './PdxList.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

export interface PdxListItem {
  title: string;
  description?: string;
  extra?: React.ReactNode;
}

interface PdxListSpecificProps {
  items: Array<PdxListItem>;
  size?: 'Small' | 'Medium' | 'Large';
  bordered?: boolean;
  split?: boolean;
  renderItem?: (item: PdxListItem, index: number) => React.ReactNode;
}

export interface PdxListProps extends PdxComponent, PdxListSpecificProps {}

function PdxList({
  items,
  size = 'Medium',
  bordered = false,
  split = true,
  renderItem,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxListProps) {
  const fullClassName =
    `PdxList ${size} ${bordered ? 'Bordered' : ''} ${split ? 'Split' : ''} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <ul
      className={fullClassName}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {items.map((item, index) => (
        <li key={index} className="PdxListItem">
          {renderItem ? (
            renderItem(item, index)
          ) : (
            <>
              <div className="PdxListContent">
                <div className="PdxListTitle">{item.title}</div>
                {item.description && (
                  <div className="PdxListDescription">{item.description}</div>
                )}
              </div>
              {item.extra && <div className="PdxListExtra">{item.extra}</div>}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

export default PdxList;
