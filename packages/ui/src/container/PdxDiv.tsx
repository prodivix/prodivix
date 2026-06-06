import './PdxDiv.scss';
import { type PdxComponent } from '@prodivix/shared';
import type React from 'react';

interface PdxDivSpecificProps {
  children: React.ReactNode;
  display?: 'Block' | 'Inline' | 'InlineBlock' | 'Flex' | 'Grid';
  flexDirection?: 'Row' | 'Column' | 'RowReverse' | 'ColumnReverse';
  justifyContent?:
    | 'Start'
    | 'Center'
    | 'End'
    | 'SpaceBetween'
    | 'SpaceAround'
    | 'SpaceEvenly';
  alignItems?: 'Start' | 'Center' | 'End' | 'Stretch' | 'Baseline';
  gap?: string | number;
  padding?: string | number;
  margin?: string | number;
  width?: string | number;
  height?: string | number;
  maxWidth?: string | number;
  maxHeight?: string | number;
  overflow?: 'Visible' | 'Hidden' | 'Auto' | 'Scroll';
  textAlign?: 'Left' | 'Center' | 'Right' | 'Justify';
  backgroundColor?: string;
  borderRadius?: string | number;
  border?: string;
}

export interface PdxDivProps extends PdxComponent, PdxDivSpecificProps {}

function PdxDiv({
  children,
  display = 'Block',
  flexDirection,
  justifyContent,
  alignItems,
  gap,
  padding,
  margin,
  width,
  height,
  maxWidth,
  maxHeight,
  overflow = 'Visible',
  textAlign,
  backgroundColor,
  borderRadius,
  border,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxDivProps) {
  const fullClassName =
    `PdxDiv ${display} ${overflow} ${textAlign ? textAlign : ''} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };

  const customStyle: React.CSSProperties = {
    ...(style as React.CSSProperties),
    ...(flexDirection && {
      flexDirection: flexDirection
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '') as React.CSSProperties['flexDirection'],
    }),
    ...(justifyContent && {
      justifyContent: justifyContent
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '') as React.CSSProperties['justifyContent'],
    }),
    ...(alignItems && {
      alignItems: alignItems.toLowerCase() as React.CSSProperties['alignItems'],
    }),
    ...(gap !== undefined && {
      gap: typeof gap === 'number' ? `${gap}px` : gap,
    }),
    ...(padding !== undefined && {
      padding: typeof padding === 'number' ? `${padding}px` : padding,
    }),
    ...(margin !== undefined && {
      margin: typeof margin === 'number' ? `${margin}px` : margin,
    }),
    ...(width !== undefined && {
      width: typeof width === 'number' ? `${width}px` : width,
    }),
    ...(height !== undefined && {
      height: typeof height === 'number' ? `${height}px` : height,
    }),
    ...(maxWidth !== undefined && {
      maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth,
    }),
    ...(maxHeight !== undefined && {
      maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
    }),
    ...(backgroundColor && { backgroundColor }),
    ...(borderRadius !== undefined && {
      borderRadius:
        typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
    }),
    ...(border && { border }),
  };

  return (
    <div
      className={fullClassName}
      style={customStyle}
      id={id}
      onClick={onClick}
      {...dataProps}
    >
      {children}
    </div>
  );
}

export default PdxDiv;
