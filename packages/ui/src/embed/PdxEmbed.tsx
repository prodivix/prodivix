import React from 'react';
import type { PdxComponent } from '@prodivix/shared';
import {
  resolveSafeEmbedUrl,
  type SafeEmbedType,
} from '@prodivix/shared/safety';

type EmbedType = SafeEmbedType;

interface PdxEmbedSpecificProps {
  type: EmbedType;
  url: string;
  title?: string;
  allowFullScreen?: boolean;
  loading?: 'Eager' | 'Lazy';
  width?: number | string;
  height?: number | string;
  aspectRatio?: '16:9' | '4:3' | '1:1' | '21:9';
}

type PdxEmbedNativeProps = Omit<
  React.IframeHTMLAttributes<HTMLIFrameElement>,
  | 'src'
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
  extends Omit<PdxComponent, 'as'>,
    PdxEmbedSpecificProps,
    PdxEmbedNativeProps {
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
  ...rest
}: PdxEmbedProps) {
  const fullClassName =
    `PdxEmbed ${type} ${aspectRatio.replace(':', '-')} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };

  const containerStyle: React.CSSProperties = {
    ...(style as React.CSSProperties | undefined),
    width: width || '100%',
    height: height || 'auto',
  };

  const aspectRatioMap: Record<string, string> = {
    '16:9': '16 / 9',
    '4:3': '4 / 3',
    '1:1': '1 / 1',
    '21:9': '21 / 9',
  };

  const embedContainerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: aspectRatioMap[aspectRatio],
    overflow: 'hidden',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
  };

  const iframeStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    border: 'none',
  };

  const embedUrl = resolveSafeEmbedUrl(type, url);

  if (type === 'Twitter' || type === 'Instagram') {
    return (
      <div
        className={fullClassName}
        style={containerStyle}
        id={id}
        {...dataProps}
      >
        <div style={embedContainerStyle}>
          <iframe
            style={iframeStyle}
            src={embedUrl}
            title={title || `${type} embed`}
            loading={loading.toLowerCase() as 'eager' | 'lazy'}
            onLoad={onLoad}
            onError={onError}
            {...rest}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={fullClassName}
      style={containerStyle}
      id={id}
      {...dataProps}
    >
      <div style={embedContainerStyle}>
        <iframe
          style={iframeStyle}
          src={embedUrl}
          title={title || `${type} embed`}
          allowFullScreen={allowFullScreen}
          loading={loading.toLowerCase() as 'eager' | 'lazy'}
          onLoad={onLoad}
          onError={onError}
          {...rest}
        />
      </div>
    </div>
  );
}

export default PdxEmbed;
