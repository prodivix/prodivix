import React from 'react';
import type { PdxComponent } from '@prodivix/shared';

interface PdxVideoSpecificProps {
  src: string;
  poster?: string;
  autoplay?: boolean;
  controls?: boolean;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  preload?: 'None' | 'Metadata' | 'Auto';
  width?: number | string;
  height?: number | string;
  aspectRatio?: '16:9' | '4:3' | '1:1' | '21:9';
  onPlay?: React.ReactEventHandler<HTMLVideoElement>;
  onPause?: React.ReactEventHandler<HTMLVideoElement>;
  onEnded?: React.ReactEventHandler<HTMLVideoElement>;
  onTimeUpdate?: React.ReactEventHandler<HTMLVideoElement>;
  onProgress?: React.ReactEventHandler<HTMLVideoElement>;
  onLoadedMetadata?: React.ReactEventHandler<HTMLVideoElement>;
}

export interface PdxVideoProps extends PdxComponent, PdxVideoSpecificProps {}

function PdxVideo({
  src,
  poster,
  autoplay = false,
  controls = true,
  loop = false,
  muted = false,
  playsInline = false,
  preload = 'Metadata',
  width,
  height,
  aspectRatio = '16:9',
  className,
  style,
  id,
  dataAttributes = {},
  onPlay,
  onPause,
  onEnded,
  onTimeUpdate,
  onProgress,
  onLoadedMetadata,
  onClick,
}: PdxVideoProps) {
  const fullClassName =
    `PdxVideo ${aspectRatio.replace(':', '-')} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };
  const normalizedSrc = src?.trim() ? src : undefined;
  const normalizedPoster = poster?.trim() ? poster : undefined;

  const containerStyle = {
    ...style,
    width: width || '100%',
    height: height || 'auto',
  };

  const aspectRatioMap: Record<string, string> = {
    '16:9': '16 / 9',
    '4:3': '4 / 3',
    '1:1': '1 / 1',
    '21:9': '21 / 9',
  };

  const videoContainerStyle = {
    position: 'relative',
    width: '100%',
    aspectRatio: aspectRatioMap[aspectRatio],
    overflow: 'hidden',
    backgroundColor: '#000',
    borderRadius: '8px',
  };

  const videoStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  };

  return (
    <div
      className={fullClassName}
      style={containerStyle as React.CSSProperties}
      id={id}
      onClick={onClick}
      {...dataProps}
    >
      <div style={videoContainerStyle as React.CSSProperties}>
        <video
          style={videoStyle as React.CSSProperties}
          src={normalizedSrc}
          poster={normalizedPoster}
          autoPlay={autoplay}
          controls={controls}
          loop={loop}
          muted={muted}
          playsInline={playsInline}
          preload={preload.toLowerCase() as 'none' | 'metadata' | 'auto'}
          onPlay={onPlay}
          onPause={onPause}
          onEnded={onEnded}
          onTimeUpdate={onTimeUpdate}
          onProgress={onProgress}
          onLoadedMetadata={onLoadedMetadata}
        />
      </div>
    </div>
  );
}

export default PdxVideo;
