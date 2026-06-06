import React from 'react';
import { type PdxComponent } from '@prodivix/shared';

import './PdxIcon.scss';

type IconRenderable =
  | React.ReactElement<Record<string, unknown>>
  | React.ComponentType<Record<string, unknown>>;

interface IconSpecificProps {
  icon: IconRenderable;
  size?: number | string;
  color?: string;
  title?: string;
}

export interface PdxIconProps
  extends Omit<PdxComponent, 'as'>,
    IconSpecificProps {}

const isComponentIcon = (
  value: unknown
): value is React.ComponentType<Record<string, unknown>> =>
  typeof value === 'function' ||
  (typeof value === 'object' && value !== null && '$$typeof' in value);

const renderFallbackIcon = (
  size?: number | string,
  color = 'currentColor',
  title?: string
) => (
  <svg
    width={size ?? 24}
    height={size ?? 24}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden={title ? undefined : true}
    aria-label={title}
  >
    <circle cx="12" cy="12" r="8" stroke={color} strokeWidth="2" />
  </svg>
);

function enhanceIcon(
  icon: IconRenderable | null | undefined,
  size?: number | string,
  color?: string,
  title?: string
) {
  if (!icon) {
    return renderFallbackIcon(size, color, title);
  }

  // ------------ 1. 图标是 React Element ------------
  if (React.isValidElement(icon)) {
    const element = icon as React.ReactElement<Record<string, unknown>>;
    const originalProps = element.props || {};
    const clonedProps: Record<string, unknown> = {};

    // --- 强制性 size 规则 ---
    if (size !== undefined) {
      // 如果图标本身支持 size 属性
      if ('size' in originalProps) {
        clonedProps.size = size;
      } else {
        // 若是 SVG 元素，则直接覆盖 width/height
        if (typeof element.type === 'string' && element.type === 'svg') {
          clonedProps.width = size;
          clonedProps.height = size;
        } else {
          // 其他情况（比如 react-icons 的 svg），通过 style 覆盖
          const baseStyle =
            (originalProps.style as React.CSSProperties | undefined) ?? {};
          clonedProps.style = {
            ...baseStyle,
            width: size,
            height: size,
          };
        }
      }
    }

    // --- color 规则 ---
    if (color !== undefined) {
      if ('color' in originalProps) {
        clonedProps.color = color;
      } else if (originalProps.fill !== undefined || element.type === 'svg') {
        clonedProps.fill = color;
      } else {
        clonedProps.stroke = color;
      }
    }

    // --- 可访问性 ---
    if (title && element.type === 'svg' && !originalProps['aria-label']) {
      clonedProps['aria-label'] = title;
    }

    return React.cloneElement(element, clonedProps);
  }

  // ------------ 2. 图标是组件类型（函数/类组件）------------
  if (!isComponentIcon(icon)) {
    return renderFallbackIcon(size, color, title);
  }

  const IconComponent = icon;
  const componentProps: Record<string, unknown> = {};
  if (size !== undefined) {
    componentProps.size = size;
    componentProps.width = size;
    componentProps.height = size;
  }
  if (color !== undefined) {
    componentProps.color = color;
    componentProps.style = { color };
  }
  if (title) componentProps.title = title;

  return <IconComponent {...componentProps} />;
}
function PdxIcon({
  icon,
  size = 24,
  color = 'currentColor',
  title,
  className,
  style,
  id,
  dataAttributes = {},
  onClick,
}: PdxIconProps) {
  const fullClassName = `PdxIcon ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  // ⚠️ React-icons 的 SVG 依赖 font-size = 1em
  // 所以统一设置 fontSize，兼容全部风格
  const wrapperSizeStyle =
    size !== undefined
      ? { fontSize: typeof size === 'number' ? `${size}px` : size }
      : {};

  const accessibilityProps = title
    ? { role: 'img' as const, 'aria-label': title }
    : { 'aria-hidden': true };

  return (
    <span
      className={fullClassName}
      style={{
        ...(wrapperSizeStyle as React.CSSProperties),
        ...(style as React.CSSProperties),
      }}
      id={id}
      onClick={onClick}
      {...accessibilityProps}
      {...dataProps}
    >
      {enhanceIcon(icon, size, color, title)}
    </span>
  );
}

export default PdxIcon;
