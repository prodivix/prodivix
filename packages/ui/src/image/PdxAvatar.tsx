import './PdxAvatar.scss';
import { getDataAttributes, mergeClassNames } from '../foundation/component';
import React from 'react';
import { type PdxComponent } from '@prodivix/shared';
import User from 'lucide-react/dist/esm/icons/user.mjs';

interface PdxAvatarSpecificProps {
  src?: string;
  alt?: string;
  size?: 'ExtraSmall' | 'Small' | 'Medium' | 'Large' | 'ExtraLarge';
  shape?: 'Square' | 'Rounded' | 'Circle';
  fallback?: string;
  initials?: string;
  status?: 'Online' | 'Offline' | 'Busy' | 'Away';
  onError?: React.ReactEventHandler<HTMLImageElement>;
}

export interface PdxAvatarProps extends PdxComponent, PdxAvatarSpecificProps {}

function PdxAvatar({
  src,
  alt = 'Avatar',
  size = 'Medium',
  shape = 'Circle',
  fallback,
  initials,
  status,
  className,
  style,
  id,
  dataAttributes = {},
  onError,
  onClick,
}: PdxAvatarProps) {
  const [failedSources, setFailedSources] = React.useState<string[]>([]);

  React.useEffect(() => {
    setFailedSources([]);
  }, [fallback, src]);

  const fullClassName = mergeClassNames(
    'PdxAvatar',
    size,
    shape,
    status && `status-${status}`,
    className
  );
  const imageSource = [src, fallback].find(
    (candidate): candidate is string =>
      Boolean(candidate) && !failedSources.includes(candidate as string)
  );

  const handleError = (event: React.SyntheticEvent<HTMLImageElement>) => {
    if (imageSource) {
      setFailedSources((sources) => [...new Set([...sources, imageSource])]);
    }
    onError?.(event);
  };

  const renderContent = () => {
    if (imageSource) {
      return <img src={imageSource} alt={alt} onError={handleError} />;
    }

    if (initials) {
      return (
        <span className="PdxAvatar-initials" aria-hidden="true">
          {initials.trim().slice(0, 2).toUpperCase()}
        </span>
      );
    }

    const fallbackInitial = alt.trim().charAt(0).toUpperCase();
    return (
      <span className="PdxAvatar-placeholder" aria-hidden="true">
        {fallbackInitial || <User size="55%" strokeWidth={1.7} />}
      </span>
    );
  };

  return (
    <div
      className={fullClassName}
      id={id}
      onClick={onClick}
      style={style as React.CSSProperties}
      title={alt}
      {...getDataAttributes(dataAttributes)}
    >
      {renderContent()}
      {status && (
        <span
          aria-label={`${status} status`}
          className="PdxAvatar-status"
          role="status"
        />
      )}
    </div>
  );
}

export default PdxAvatar;
