import React, { useState } from 'react';
import { type PdxComponent } from '@prodivix/shared';

interface PdxImageGallerySpecificProps {
  images: Array<{
    src: string;
    alt?: string;
    thumbnail?: string;
    caption?: string;
  }>;
  layout?: 'Grid' | 'List' | 'Masonry';
  columns?: number;
  gap?: 'None' | 'Small' | 'Medium' | 'Large';
  size?: 'Small' | 'Medium' | 'Large';
  shape?: 'Square' | 'Rounded' | 'Circle';
  fit?: 'Cover' | 'Contain' | 'Fill' | 'None' | 'ScaleDown';
  showCaptions?: boolean;
  selectable?: boolean;
  maxSelection?: number;
  onImageClick?: (
    image: PdxImageGallerySpecificProps['images'][0],
    index: number
  ) => void;
  onSelectionChange?: (selectedIndices: number[]) => void;
}

export interface PdxImageGalleryProps
  extends PdxComponent,
    PdxImageGallerySpecificProps {}

function PdxImageGallery({
  images,
  layout = 'Grid',
  columns = 3,
  gap = 'Medium',
  size = 'Medium',
  shape = 'Rounded',
  fit = 'Cover',
  showCaptions = false,
  selectable = false,
  maxSelection,
  onImageClick,
  onSelectionChange,
  className,
  style,
  id,
  dataAttributes = {},
  ...rest
}: PdxImageGalleryProps) {
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);

  const fullClassName =
    `PdxImageGallery ${layout} ${gap} ${className || ''}`.trim();

  const dataProps = { ...dataAttributes };

  const handleImageClick = (
    image: PdxImageGallerySpecificProps['images'][0],
    index: number
  ) => {
    if (onImageClick) {
      onImageClick(image, index);
    }

    if (selectable) {
      const newSelection = selectedIndices.includes(index)
        ? selectedIndices.filter((i) => i !== index)
        : [...selectedIndices, index];

      if (maxSelection && newSelection.length > maxSelection) {
        return;
      }

      setSelectedIndices(newSelection);
      if (onSelectionChange) {
        onSelectionChange(newSelection);
      }
    }
  };

  const getGridStyle = (): React.CSSProperties => {
    if (layout === 'Grid' || layout === 'Masonry') {
      return {
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
      };
    }
    return {};
  };

  return (
    <div
      className={fullClassName}
      style={{ ...getGridStyle(), ...(style as React.CSSProperties) }}
      id={id}
      {...dataProps}
      {...rest}
    >
      {images.map((image, index) => (
        <div
          key={index}
          className={`PdxImageGallery-item ${size} ${shape} ${selectedIndices.includes(index) ? 'selected' : ''}`}
          onClick={() => handleImageClick(image, index)}
        >
          <img
            src={image.thumbnail || image.src}
            alt={image.alt || `Image ${index + 1}`}
            className={`PdxImageGallery-image ${fit}`}
            loading="lazy"
          />
          {showCaptions && image.caption && (
            <div className="PdxImageGallery-caption">{image.caption}</div>
          )}
          {selectable && selectedIndices.includes(index) && (
            <div className="PdxImageGallery-check">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default PdxImageGallery;
