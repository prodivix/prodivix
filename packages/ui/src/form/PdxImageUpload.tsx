import './PdxImageUpload.scss';
import { type PdxComponent } from '@prodivix/shared';
import { useEffect, useRef, useState } from 'react';
import type React from 'react';

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
  extends PdxComponent,
    PdxImageUploadSpecificProps {}

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
  const [files, setFiles] = useState<File[]>(defaultValue || []);
  const [previews, setPreviews] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (value) {
      setFiles(value);
    }
  }, [value]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const updateFiles = (nextFiles: File[]) => {
    if (!value) {
      setFiles(nextFiles);
    }
    if (onChange) {
      onChange(nextFiles);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFiles = Array.from(event.target.files || []);
    updateFiles(nextFiles);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    const nextFiles = Array.from(event.dataTransfer.files || []);
    updateFiles(nextFiles);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleSelectClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const fullClassName =
    `PdxImageUpload ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();
  const dataProps = { ...dataAttributes };

  return (
    <div
      className={`PdxField ${fullClassName}`}
      style={style as React.CSSProperties}
      id={id}
      {...dataProps}
    >
      {label && (
        <div className="PdxFieldHeader">
          <label className="PdxFieldLabel">{label}</label>
          {required && <span className="PdxFieldRequired">*</span>}
        </div>
      )}
      {description && <div className="PdxFieldDescription">{description}</div>}
      <div
        className="PdxImageUploadDropzone"
        onClick={handleSelectClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div className="PdxImageUploadText">Click or drag images to upload</div>
      </div>
      <input
        ref={inputRef}
        className="PdxImageUploadInput"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={handleInputChange}
      />
      {previews.length > 0 && (
        <div className="PdxImageUploadGrid">
          {previews.map((src, index) => (
            <div key={`${src}-${index}`} className="PdxImageUploadItem">
              <img src={src} alt={`Preview ${index + 1}`} />
            </div>
          ))}
        </div>
      )}
      {message && <div className="PdxFieldMessage">{message}</div>}
    </div>
  );
}

export default PdxImageUpload;
