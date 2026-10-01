import './PdxImageUpload.scss';
import { type PdxComponent } from '@prodivix/shared';
import { getDataAttributes } from '../foundation/component';
import { Image as ImageIcon, ImageUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import {
  createImageUploadPreviewUrl,
  isBlobPreviewUrl,
} from './imageUploadPreview';

interface PdxImageUploadSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  required?: boolean;
  value?: File[];
  defaultValue?: File[];
  onChange?: (files: File[]) => void;
}

export interface PdxImageUploadProps
  extends PdxComponent, PdxImageUploadSpecificProps {}

function PdxImageUpload({
  label,
  description,
  message,
  accept = 'image/*',
  multiple = false,
  disabled = false,
  required = false,
  value,
  defaultValue,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxImageUploadProps) {
  const [internalFiles, setInternalFiles] = useState<File[]>(
    defaultValue || []
  );
  const [previews, setPreviews] = useState<(string | null)[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const files = value ?? internalFiles;
  const inputId = id ? `${id}-input` : undefined;

  useEffect(() => {
    let isActive = true;
    const urls: string[] = [];

    void Promise.allSettled(files.map(createImageUploadPreviewUrl)).then(
      (results) => {
        const previewUrls = results.map((result) =>
          result.status === 'fulfilled' ? result.value : null
        );
        if (!isActive) {
          previewUrls.forEach((url) => {
            if (url) URL.revokeObjectURL(url);
          });
          return;
        }
        previewUrls.forEach((url) => {
          if (url && isBlobPreviewUrl(url)) urls.push(url);
        });
        setPreviews(previewUrls);
      }
    );

    return () => {
      isActive = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const updateFiles = (nextFiles: File[]) => {
    if (value === undefined) {
      setInternalFiles(nextFiles);
    }
    onChange?.(nextFiles);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    const nextFiles = multiple ? selectedFiles : selectedFiles.slice(0, 1);
    updateFiles(nextFiles);
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const droppedFiles = Array.from(event.dataTransfer.files || []);
    const nextFiles = multiple ? droppedFiles : droppedFiles.slice(0, 1);
    updateFiles(nextFiles);
  };

  const handleDragOver = (event: React.DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLButtonElement>) => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    setIsDragging(false);
  };

  const fullClassName =
    `PdxImageUpload ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();
  const dataProps = getDataAttributes(dataAttributes);

  return (
    <div
      className={`PdxField ${fullClassName}`}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {label && (
        <div className="PdxFieldHeader">
          <label className="PdxFieldLabel" htmlFor={inputId}>
            {label}
          </label>
          {required && <span className="PdxFieldRequired">*</span>}
        </div>
      )}
      {description && <div className="PdxFieldDescription">{description}</div>}
      <button
        className={`PdxImageUploadDropzone ${isDragging ? 'Dragging' : ''}`}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        type="button"
      >
        <span className="PdxImageUploadIcon">
          <ImageUp aria-hidden="true" size={18} strokeWidth={1.8} />
        </span>
        <span className="PdxImageUploadText">
          Choose {multiple ? 'images' : 'an image'}
          <span> or drag and drop</span>
        </span>
        <span className="PdxImageUploadHint">{accept}</span>
      </button>
      <input
        ref={inputRef}
        aria-label={label || 'Upload images'}
        className="PdxImageUploadInput"
        accept={accept}
        disabled={disabled}
        id={inputId}
        multiple={multiple}
        onChange={handleInputChange}
        required={required && files.length === 0}
        type="file"
      />
      {previews.length > 0 && (
        <div className="PdxImageUploadGrid">
          {previews.map((src, index) => (
            <div key={`${src}-${index}`} className="PdxImageUploadItem">
              {src ? (
                <img
                  src={src}
                  alt={files[index]?.name || `Preview ${index + 1}`}
                />
              ) : (
                <span className="PdxImageUploadPreviewUnavailable">
                  <ImageIcon aria-hidden="true" size={24} />
                  Preview unavailable
                </span>
              )}
              <span className="PdxImageUploadName">
                <ImageIcon aria-hidden="true" size={14} />
                <span>{files[index]?.name || `Image ${index + 1}`}</span>
              </span>
              <button
                aria-label={`Remove ${files[index]?.name || `image ${index + 1}`}`}
                className="PdxImageUploadRemove"
                disabled={disabled}
                onClick={() =>
                  updateFiles(
                    files.filter((_, fileIndex) => fileIndex !== index)
                  )
                }
                title={`Remove ${files[index]?.name || `image ${index + 1}`}`}
                type="button"
              >
                <X aria-hidden="true" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      {message && <div className="PdxFieldMessage">{message}</div>}
    </div>
  );
}

export default PdxImageUpload;
