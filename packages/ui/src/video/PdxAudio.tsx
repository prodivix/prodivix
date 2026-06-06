import React from 'react';
import type { PdxComponent } from '@prodivix/shared';

interface PdxAudioSpecificProps {
  src: string;
  autoplay?: boolean;
  controls?: boolean;
  loop?: boolean;
  muted?: boolean;
  preload?: 'None' | 'Metadata' | 'Auto';
  onPlay?: React.ReactEventHandler<HTMLAudioElement>;
  onPause?: React.ReactEventHandler<HTMLAudioElement>;
  onEnded?: React.ReactEventHandler<HTMLAudioElement>;
  onTimeUpdate?: React.ReactEventHandler<HTMLAudioElement>;
  onProgress?: React.ReactEventHandler<HTMLAudioElement>;
  onLoadedMetadata?: React.ReactEventHandler<HTMLAudioElement>;
}

export interface PdxAudioProps extends PdxComponent, PdxAudioSpecificProps {}

function PdxAudio({
  src,
  autoplay = false,
  controls = true,
  loop = false,
  muted = false,
  preload = 'Metadata',
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
}: PdxAudioProps) {
  const fullClassName = `PdxAudio ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };
  const normalizedSrc = src?.trim() ? src : undefined;

  const containerStyle = {
    ...style,
    width: '100%',
    maxWidth: '600px',
  };

  return (
    <div
      className={fullClassName}
      style={containerStyle as React.CSSProperties}
      id={id}
      onClick={onClick}
      {...dataProps}
    >
      <audio
        src={normalizedSrc}
        autoPlay={autoplay}
        controls={controls}
        loop={loop}
        muted={muted}
        preload={preload.toLowerCase() as 'none' | 'metadata' | 'auto'}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onTimeUpdate={onTimeUpdate}
        onProgress={onProgress}
        onLoadedMetadata={onLoadedMetadata}
      />
    </div>
  );
}

export default PdxAudio;
