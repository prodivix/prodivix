import { Check, Copy } from 'lucide-react';
import { CodeViewer } from './CodeViewer';

type ExportCodePreviewProps = {
  code: string;
  language: string;
  copied: boolean;
  disabled?: boolean;
  copyLabel: string;
  copySuccessLabel: string;
  onCopy: () => void;
};

export function ExportCodePreview({
  code,
  language,
  copied,
  disabled = false,
  copyLabel,
  copySuccessLabel,
  onCopy,
}: ExportCodePreviewProps) {
  const label = copied ? copySuccessLabel : copyLabel;

  return (
    <div className="ExportCodePreview">
      <button
        type="button"
        className="ExportCodeIconButton ExportCodePreviewCopy"
        aria-label={label}
        title={label}
        disabled={disabled || !code}
        onClick={onCopy}
      >
        {copied ? (
          <Check size={15} aria-hidden="true" />
        ) : (
          <Copy size={15} aria-hidden="true" />
        )}
      </button>
      <CodeViewer
        code={code}
        lang={language}
        className="ExportCodePreviewViewer"
      />
    </div>
  );
}
