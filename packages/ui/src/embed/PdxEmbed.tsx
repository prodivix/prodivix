import './PdxEmbed.scss';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import { getAspectRatioStyle, type PdxAspectRatio } from '../foundation/media';
import React from 'react';
import type { PdxComponent } from '@prodivix/shared';
import {
  resolveSafeEmbedUrl,
  type SafeEmbedType,
} from '@prodivix/shared/safety';

type EmbedType = SafeEmbedType;

const BLOCKED_IFRAME_PROP_NAMES = new Set([
  'children',
  'dangerouslysetinnerhtml',
  'src',
  'srcdoc',
]);

interface PdxEmbedSpecificProps {
  type: EmbedType;
  url: string;
  title?: string;
  allowFullScreen?: boolean;
  loading?: 'Eager' | 'Lazy';
  width?: number | string;
  height?: number | string;
  aspectRatio?: PdxAspectRatio;
}

type PdxEmbedNativeProps = Omit<
  React.IframeHTMLAttributes<HTMLIFrameElement>,
  | 'src'
  | 'srcDoc'
  | 'children'
  | 'dangerouslySetInnerHTML'
  | 'title'
  | 'width'
  | 'height'
  | 'loading'
  | 'allowFullScreen'
  | 'className'
  | 'style'
  | 'id'
  | 'onClick'
  | 'onLoad'
  | 'onError'
>;

export interface PdxEmbedProps
  extends Omit<PdxComponent, 'as'>, PdxEmbedSpecificProps, PdxEmbedNativeProps {
  onLoad?: React.ReactEventHandler<HTMLIFrameElement>;
  onError?: React.ReactEventHandler<HTMLIFrameElement>;
}

function PdxEmbed({
  type,
  url,
  title,
  allowFullScreen = false,
  loading = 'Lazy',
  width,
  height,
  aspectRatio = '16:9',
  className,
  style,
  id,
  dataAttributes = {},
  onLoad,
  onError,
  onClick,
  ...rest
}: PdxEmbedProps) {
  const fullClassName = mergeClassNames(
    'PdxEmbed',
    type,
    `aspect-${aspectRatio.replace(':', '-')}`,
    height !== undefined && 'HasExplicitHeight',
    className
  );

  const containerStyle: React.CSSProperties = {
    ...getAspectRatioStyle(aspectRatio),
    ...(style as React.CSSProperties | undefined),
    width: width ?? style?.width ?? '100%',
    ...(height !== undefined ? { height } : {}),
  };

  const embedUrl = resolveSafeEmbedUrl(type, url);
  const iframeProps = Object.fromEntries(
    Object.entries(rest).filter(
      ([name]) => !BLOCKED_IFRAME_PROP_NAMES.has(name.toLowerCase())
    )
  ) as React.IframeHTMLAttributes<HTMLIFrameElement>;

  return (
    <div
      className={fullClassName}
      id={id}
      onClick={onClick}
      style={containerStyle}
      {...getDataAttributes(dataAttributes)}
    >
      <div className="PdxEmbedFrame">
        <iframe
          allowFullScreen={allowFullScreen}
          className="PdxEmbedElement"
          loading={loading.toLowerCase() as 'eager' | 'lazy'}
          onError={onError}
          onLoad={onLoad}
          src={embedUrl}
          title={title || `${type} embed`}
          {...iframeProps}
        />
      </div>
    </div>
  );
}

export default PdxEmbed;
