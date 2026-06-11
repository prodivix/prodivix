import { ChevronDown, Download } from 'lucide-react';
import { PdxPopover } from '@prodivix/ui';
import type { ExportTab } from './exportCodeModel';

type ExportCodeHeaderProps = {
  activeTab: ExportTab;
  title: string;
  description: string;
  viewMenuOpen: boolean;
  viewOptions: Array<{ value: ExportTab; label: string }>;
  titleLabel: string;
  downloadingZip: boolean;
  canDownloadReactZip: boolean;
  downloadingLabel: string;
  downloadZipLabel: string;
  onOpenViewMenuChange: (open: boolean) => void;
  onSelectTab: (tab: ExportTab) => void;
  onDownloadReactZip: () => void;
};

export function ExportCodeHeader({
  activeTab,
  title,
  description,
  viewMenuOpen,
  viewOptions,
  titleLabel,
  downloadingZip,
  canDownloadReactZip,
  downloadingLabel,
  downloadZipLabel,
  onOpenViewMenuChange,
  onSelectTab,
  onDownloadReactZip,
}: ExportCodeHeaderProps) {
  const downloadLabel = downloadingZip ? downloadingLabel : downloadZipLabel;

  return (
    <div className="ExportCodeHeader">
      <div className="ExportCodeTitle">
        <div className="ExportCodeTitleRow">
          <h1>{title}</h1>
          <PdxPopover
            open={viewMenuOpen}
            onOpenChange={onOpenViewMenuChange}
            panelClassName="ExportCodeViewMenu"
            content={
              <div className="ExportCodeViewMenuList" role="listbox">
                {viewOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`ExportCodeViewMenuItem ${
                      activeTab === option.value ? 'Active' : ''
                    }`}
                    role="option"
                    aria-selected={activeTab === option.value}
                    onClick={() => {
                      onSelectTab(option.value);
                      onOpenViewMenuChange(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          >
            <button
              type="button"
              className="ExportCodeViewTrigger"
              aria-label={titleLabel}
              aria-expanded={viewMenuOpen}
            >
              <ChevronDown size={13} aria-hidden="true" />
            </button>
          </PdxPopover>
        </div>
        <p>{description}</p>
      </div>
      <div className="ExportCodeActions">
        {activeTab === 'react' ? (
          <button
            type="button"
            className="ExportCodeIconButton"
            aria-label={downloadLabel}
            title={downloadLabel}
            disabled={!canDownloadReactZip || downloadingZip}
            onClick={onDownloadReactZip}
          >
            <Download size={15} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
