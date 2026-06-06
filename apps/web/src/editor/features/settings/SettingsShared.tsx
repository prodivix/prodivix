import type React from 'react';
import { PdxPanel, PdxParagraph, PdxText } from '@prodivix/ui';

type SettingsRowProps = {
  label: string;
  description?: string;
  control: React.ReactNode;
  meta?: React.ReactNode;
};

export const SettingsRow = ({
  label,
  description,
  control,
  meta,
}: SettingsRowProps) => {
  const className = meta
    ? 'grid grid-cols-[minmax(200px,1.2fr)_minmax(220px,1fr)_minmax(200px,0.8fr)] items-start gap-[12px] max-[1100px]:grid-cols-1'
    : 'grid grid-cols-[minmax(240px,1.2fr)_minmax(260px,1fr)] items-start gap-[12px] max-[1100px]:grid-cols-1';
  return (
    <div className={className}>
      <div className="grid gap-1">
        <PdxText
          size="Small"
          weight="SemiBold"
          className="text-(--text-primary)"
        >
          {label}
        </PdxText>
        {description && (
          <PdxParagraph
            size="Small"
            color="Muted"
            className="m-0 leading-[1.4]"
          >
            {description}
          </PdxParagraph>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 [&_.PdxInput]:max-w-[320px] [&_.PdxSelect]:max-w-[320px] [&_.PdxTextarea]:max-w-[320px]">
        {control}
      </div>
      {meta && (
        <div className="ml-6 flex flex-col items-start gap-1.5 text-[11px] text-(--text-muted) max-[1100px]:ml-0">
          {meta}
        </div>
      )}
    </div>
  );
};

type SettingsPanelProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

export const SettingsPanel = ({
  title,
  description,
  children,
}: SettingsPanelProps) => (
  <PdxPanel
    title={title}
    variant="Default"
    padding="Large"
    className="rounded-2xl border border-[rgba(0,0,0,0.06)] bg-(--bg-canvas) shadow-[0_14px_32px_rgba(0,0,0,0.08)] in-data-[theme='dark']:border-[rgba(255,255,255,0.08)] in-data-[theme='dark']:shadow-[0_18px_36px_rgba(0,0,0,0.45)]"
  >
    {description && (
      <p className="mb-3 -translate-x-2 -translate-y-4 text-[12px] text-(--text-muted)">
        {description}
      </p>
    )}
    <div className="grid gap-3.5">{children}</div>
  </PdxPanel>
);

export const formatValue = (value: unknown) => {
  if (Array.isArray(value)) return value.join(', ');
  if (value === undefined || value === null || value === '') return '--';
  return String(value);
};

export const withDisabled = (
  items: { label: string; value: string; disabled?: boolean }[],
  disabled: boolean
) => items.map((item) => ({ ...item, disabled: disabled || item.disabled }));
