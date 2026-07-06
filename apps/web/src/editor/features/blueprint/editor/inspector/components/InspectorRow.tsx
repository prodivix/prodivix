import type React from 'react';

type InspectorRowProps = {
  label: React.ReactNode;
  description?: React.ReactNode;
  control: React.ReactNode;
  layout?: 'horizontal' | 'vertical';
  controlWidth?: 'sm' | 'md' | 'lg' | 'full';
};

type InspectorIconFieldRowProps = {
  icon: React.ReactNode;
  label: string;
  control: React.ReactNode;
};

export function InspectorRow({
  label,
  description,
  control,
  layout = 'horizontal',
  controlWidth = 'lg',
}: InspectorRowProps) {
  const controlWidthClass = {
    sm: 'w-32',
    md: 'w-40',
    lg: 'w-48',
    full: 'w-[288px]',
  }[controlWidth];

  if (layout === 'vertical') {
    return (
      <div className="col-span-9 grid w-[288px] max-w-full grid-cols-[repeat(9,32px)] gap-y-2">
        <div className="col-span-9 min-w-0">
          <div className="InspectorLabel text-[11px] font-medium text-(--text-secondary)">
            {label}
          </div>
          {description ? (
            <div className="InspectorDescription text-[10px] text-(--text-muted)">
              {description}
            </div>
          ) : null}
        </div>
        <div className="col-span-9 min-w-0">{control}</div>
      </div>
    );
  }

  const alignClass = description ? 'items-start' : 'items-center';

  return (
    <div
      className={`col-span-9 grid min-h-8 w-[288px] max-w-full grid-cols-[repeat(9,32px)] ${alignClass}`}
    >
      <div className="col-span-3 min-w-0 pr-2">
        <div className="InspectorLabel text-[11px] font-medium text-(--text-secondary)">
          {label}
        </div>
        {description ? (
          <div className="InspectorDescription text-[10px] text-(--text-muted)">
            {description}
          </div>
        ) : null}
      </div>
      <div className="col-span-6 min-w-0">
        <div
          className={`ml-auto flex min-h-7 justify-end ${controlWidthClass}`}
        >
          {control}
        </div>
      </div>
    </div>
  );
}

export function InspectorIconFieldRow({
  icon,
  label,
  control,
}: InspectorIconFieldRowProps) {
  return (
    <div className="col-span-9 grid min-h-8 w-[288px] max-w-full grid-cols-[repeat(9,32px)] items-start">
      <div
        className="col-span-1 flex h-8 w-8 items-center justify-center text-(--text-secondary) [&>svg]:h-6 [&>svg]:w-6"
        title={label}
        aria-label={label}
      >
        {icon}
      </div>
      <div className="col-span-7 col-start-3 min-w-0">
        <div className="flex min-h-8 items-start">{control}</div>
      </div>
    </div>
  );
}
