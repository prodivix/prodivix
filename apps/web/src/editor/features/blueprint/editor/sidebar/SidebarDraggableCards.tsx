import type {
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';
import { useDraggable } from '@dnd-kit/core';

type DraggablePreviewCardProps = {
  itemId: string;
  selectedSize?: string;
  className: string;
  role?: string;
  tabIndex?: number;
  ariaExpanded?: boolean;
  onClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onDoubleClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: ReactNode;
};

export const DraggablePreviewCard = ({
  itemId,
  selectedSize,
  className,
  role,
  tabIndex,
  ariaExpanded,
  onClick,
  onDoubleClick,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
  children,
}: DraggablePreviewCardProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${itemId}`,
    data: { kind: 'palette-item', itemId, selectedSize },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isDragging ? 'IsDragging cursor-grabbing opacity-[0.55]' : ''}`.trim()}
      role={role}
      tabIndex={tabIndex}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
};

type DraggableVariantCardProps = {
  itemId: string;
  variantId: string;
  variantProps?: Record<string, unknown>;
  selectedSize?: string;
  className: string;
  children: ReactNode;
};

export const DraggableVariantCard = ({
  itemId,
  variantId,
  variantProps,
  selectedSize,
  className,
  children,
}: DraggableVariantCardProps) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${itemId}:${variantId}`,
    data: {
      kind: 'palette-item',
      itemId,
      variantId,
      variantProps,
      selectedSize,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isDragging ? 'IsDragging cursor-grabbing opacity-[0.55]' : ''}`.trim()}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
};
