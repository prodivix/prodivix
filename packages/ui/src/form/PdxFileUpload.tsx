import './PdxFileUpload.scss';
import { type PdxComponent } from '@prodivix/shared';
import { getDataAttributes } from '../foundation/component';
import { FileText, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type React from 'react';

interface PdxFileUploadSpecificProps {
  label?: string;
  description?: string;
  message?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  required?: boolean;
  showList?: boolean;
  value?: File[];
  defaultValue?: File[];
  onChange?: (files: File[]) => void;
}

export interface PdxFileUploadProps
  extends PdxComponent, PdxFileUploadSpecificProps {}

function PdxFileUpload({
  label,
  description,
  message,
  accept,
  multiple = false,
  disabled = false,
  required = false,
  showList = true,
  value,
  defaultValue,
  onChange,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxFileUploadProps) {
  const [internalFiles, setInternalFiles] = useState<File[]>(
    defaultValue || []
  );
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const files = value ?? internalFiles;
  const inputId = id ? `${id}-input` : undefined;

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
    `PdxFileUpload ${disabled ? 'Disabled' : ''} ${className || ''}`.trim();
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
        className={`PdxFileUploadDropzone ${isDragging ? 'Dragging' : ''}`}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        type="button"
      >
        <div className="PdxFileUploadIcon">
          <Upload aria-hidden="true" size={18} strokeWidth={1.8} />
        </div>
        <div className="PdxFileUploadText">
          Choose {multiple ? 'files' : 'a file'}
          <span> or drag and drop</span>
        </div>
        <div className="PdxFileUploadHint">
          {accept || (multiple ? 'Multiple files supported' : 'One file')}
        </div>
      </button>
      <input
        ref={inputRef}
        aria-label={label || 'Upload files'}
        className="PdxFileUploadInput"
        accept={accept}
        disabled={disabled}
        id={inputId}
        multiple={multiple}
        onChange={handleInputChange}
        required={required && files.length === 0}
        type="file"
      />
      {showList && files.length > 0 && (
        <ul className="PdxFileUploadList">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}`} className="PdxFileUploadItem">
              <span className="PdxFileUploadFileIcon" aria-hidden="true">
                <FileText size={16} strokeWidth={1.8} />
              </span>
              <span className="PdxFileUploadMeta">
                <span className="PdxFileUploadName">{file.name}</span>
                <span className="PdxFileUploadSize">
                  {formatFileSize(file.size)}
                </span>
              </span>
              <button
                aria-label={`Remove ${file.name}`}
                className="PdxFileUploadRemove"
                disabled={disabled}
                onClick={() =>
                  updateFiles(
                    files.filter((_, fileIndex) => fileIndex !== index)
                  )
                }
                title={`Remove ${file.name}`}
                type="button"
              >
                <X aria-hidden="true" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {message && <div className="PdxFieldMessage">{message}</div>}
    </div>
  );
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default PdxFileUpload;
