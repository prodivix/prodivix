import './PdxCard.scss';
import {
  getDataAttributes,
  isInteractiveDescendantEvent,
  mergeClassNames,
} from '../foundation/component';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxCardSpecificProps {
  children: React.ReactNode;
  size?: 'Small' | 'Medium' | 'Large';
  variant?: 'Default' | 'Bordered' | 'Elevated' | 'Flat';
  padding?: 'None' | 'Small' | 'Medium' | 'Large';
  hoverable?: boolean;
  clickable?: boolean;
  disabled?: boolean;
}

export interface PdxCardProps extends PdxComponent, PdxCardSpecificProps {}

function PdxCard({
  children,
  size = 'Medium',
  variant = 'Default',
  padding = 'Medium',
  hoverable = false,
  clickable = false,
  disabled = false,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxCardProps) {
  const fullClassName = mergeClassNames(
    'PdxCard',
    size,
    variant,
    `Padding${padding}`,
    hoverable && 'Hoverable',
    clickable && 'Clickable',
    disabled && 'Disabled',
    className
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      !clickable ||
      disabled ||
      !onClick ||
      event.defaultPrevented ||
      event.target !== event.currentTarget
    )
      return;
    if (event.key === ' ') {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && !event.repeat) {
      event.preventDefault();
      event.currentTarget.click();
    }
  };

  const handleKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      !clickable ||
      disabled ||
      !onClick ||
      event.key !== ' ' ||
      event.defaultPrevented ||
      event.target !== event.currentTarget
    )
      return;
    event.preventDefault();
    event.currentTarget.click();
  };

  return (
    <div
      aria-disabled={clickable && disabled ? true : undefined}
      className={fullClassName}
      id={id}
      onClick={
        disabled
          ? undefined
          : (event) => {
              if (
                clickable &&
                (event.defaultPrevented || isInteractiveDescendantEvent(event))
              )
                return;
              onClick?.(event);
            }
      }
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      role={clickable ? 'button' : undefined}
      style={style as React.CSSProperties | undefined}
      tabIndex={clickable && !disabled ? 0 : undefined}
      {...getDataAttributes(dataAttributes)}
    >
      {children}
    </div>
  );
}

export default PdxCard;
