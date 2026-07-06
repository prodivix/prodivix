import type React from 'react';
import { ChevronDown } from 'lucide-react';

type InspectorPanelFrameProps = {
  panelKey: string;
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function InspectorPanelFrame({
  panelKey,
  title,
  isExpanded,
  onToggle,
  actions,
  children,
  className,
  bodyClassName,
}: InspectorPanelFrameProps) {
  return (
    <section
      className={className ?? 'pt-1'}
      data-testid={`inspector-panel-${panelKey}`}
    >
      <div className="flex w-full items-center justify-between gap-1 px-0 py-1">
        <span className="min-w-0 flex-1 text-[14px] font-medium text-(--text-primary)">
          {title}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          <button
            type="button"
            className="inline-flex h-5 w-5 items-center justify-center rounded-md border-0 bg-transparent text-(--text-muted) hover:text-(--text-primary)"
            onClick={onToggle}
            aria-label={isExpanded ? 'Collapse panel' : 'Expand panel'}
            title={isExpanded ? 'Collapse panel' : 'Expand panel'}
            data-testid={`inspector-panel-toggle-${panelKey}`}
          >
            <ChevronDown
              size={14}
              className={`${isExpanded ? 'rotate-0' : '-rotate-90'} transition-transform`}
            />
          </button>
        </div>
      </div>
      {isExpanded ? (
        <div className={bodyClassName ?? 'mt-1'}>{children}</div>
      ) : null}
    </section>
  );
}
