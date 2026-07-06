import { useTranslation } from 'react-i18next';
import { PdxInput, PdxPopover, PdxSlider } from '@prodivix/ui';
import { ChevronDown, MousePointer2, Play, RotateCcw } from 'lucide-react';
import {
  VIEWPORT_DEVICE_PRESETS,
  VIEWPORT_QUICK_PRESETS,
  VIEWPORT_ZOOM_RANGE,
} from '@/editor/features/blueprint/editor/model/data';
import type { BlueprintCanvasInteractionMode } from '../canvas';

type BlueprintEditorViewportBarProps = {
  interactionMode: BlueprintCanvasInteractionMode;
  onInteractionModeChange: (mode: BlueprintCanvasInteractionMode) => void;
  viewportWidth: string;
  viewportHeight: string;
  onViewportWidthChange: (value: string) => void;
  onViewportHeightChange: (value: string) => void;
  zoom: number;
  zoomStep: number;
  onZoomChange: (value: number) => void;
  onResetView: () => void;
};

const DEVICE_KIND_ICON_STYLES: Record<string, string> = {
  Phone: 'bg-(--info-subtle) text-(--info-color)',
  Tablet: 'bg-(--success-subtle) text-(--success-color)',
  Laptop: 'bg-(--warning-subtle) text-(--warning-color)',
  Desktop: 'bg-(--bg-raised) text-(--text-secondary)',
  Watch: 'bg-(--danger-subtle) text-(--danger-color)',
};

export function BlueprintEditorViewportBar({
  interactionMode,
  onInteractionModeChange,
  viewportWidth,
  viewportHeight,
  onViewportWidthChange,
  onViewportHeightChange,
  zoom,
  zoomStep,
  onZoomChange,
  onResetView,
}: BlueprintEditorViewportBarProps) {
  const { t } = useTranslation('blueprint');
  const interactionModes: Array<{
    value: BlueprintCanvasInteractionMode;
    label: string;
    title: string;
    icon: typeof MousePointer2;
  }> = [
    {
      value: 'design',
      label: t('viewport.modes.design'),
      title: t('viewport.modes.designTitle', {
        defaultValue: 'Design mode (Ctrl+Alt+I)',
      }),
      icon: MousePointer2,
    },
    {
      value: 'interactive',
      label: t('viewport.modes.interactive'),
      title: t('viewport.modes.interactiveTitle', {
        defaultValue: 'Interactive mode (Ctrl+Alt+I)',
      }),
      icon: Play,
    },
  ];

  return (
    <section className="flex min-h-[30px] flex-nowrap items-center gap-2.5 bg-(--bg-canvas) px-[14px] py-1 text-[11px] text-(--text-muted)">
      <div className="inline-flex h-6 flex-none items-center overflow-hidden rounded-full border border-(--border-default) bg-(--bg-muted)">
        {interactionModes.map((mode) => {
          const Icon = mode.icon;
          const isActive = interactionMode === mode.value;
          return (
            <button
              key={mode.value}
              type="button"
              className={`inline-flex h-full w-7 items-center justify-center text-[11px] leading-none whitespace-nowrap transition-[background,color] duration-150 ${
                isActive
                  ? 'bg-(--bg-canvas) text-(--text-primary)'
                  : 'text-(--text-muted) hover:text-(--text-primary)'
              }`}
              title={mode.title}
              aria-label={mode.title}
              aria-pressed={isActive}
              onClick={() => onInteractionModeChange(mode.value)}
            >
              <Icon size={12} />
            </button>
          );
        })}
      </div>
      <div className="flex flex-none items-center gap-2.5">
        <div className="font-medium text-(--text-secondary)">
          {t('viewport.label')}
        </div>
        <div className="inline-flex items-center gap-1.5 [&_.PdxInput]:w-[76px] [&_.PdxInput]:max-w-[76px] max-[980px]:[&_.PdxInput]:w-[62px] max-[980px]:[&_.PdxInput]:max-w-[62px]">
          <PdxInput
            size="Small"
            value={viewportWidth}
            onChange={onViewportWidthChange}
          />
          <span className="text-(--text-muted)">×</span>
          <PdxInput
            size="Small"
            value={viewportHeight}
            onChange={onViewportHeightChange}
          />
        </div>
      </div>
      <div className="inline-flex flex-none items-center gap-2 whitespace-nowrap">
        <span className="font-medium text-(--text-secondary) max-[980px]:hidden">
          {t('viewport.zoom')}
        </span>
        <PdxSlider
          className="inline-flex w-auto items-center gap-1.5 [&_.PdxSliderInput]:w-[120px] max-[980px]:[&_.PdxSliderInput]:w-[92px] [&.PdxField]:w-auto [&.PdxField]:flex-row [&.PdxField]:gap-1.5"
          min={VIEWPORT_ZOOM_RANGE.min}
          max={VIEWPORT_ZOOM_RANGE.max}
          step={zoomStep}
          value={zoom}
          showValue={false}
          size="Small"
          onChange={onZoomChange}
        />
        <span className="min-w-9 text-right text-(--text-muted) tabular-nums">
          {zoom}%
        </span>
        <button
          type="button"
          className="inline-flex h-6 items-center gap-1 rounded-full border border-(--border-default) bg-(--bg-canvas) px-2 text-[11px] leading-none whitespace-nowrap text-(--text-muted) transition-[border-color,color,background] duration-150 hover:border-(--border-strong) hover:bg-(--bg-raised) hover:text-(--text-primary)"
          onClick={onResetView}
          aria-label={t('viewport.reset')}
        >
          <RotateCcw size={12} />
          <span className="max-[980px]:hidden">{t('viewport.reset')}</span>
        </button>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap max-[980px]:hidden">
        {VIEWPORT_QUICK_PRESETS.map((preset) => {
          const presetLabel = t(preset.labelKey, {
            defaultValue: `${preset.width}×${preset.height}`,
          });
          return (
            <button
              type="button"
              key={preset.id}
              className="h-6 rounded-full border border-(--border-default) bg-(--bg-canvas) px-2 text-[11px] leading-none whitespace-nowrap text-(--text-muted) transition-[border-color,color,background] duration-150 hover:border-(--border-strong) hover:bg-(--bg-raised) hover:text-(--text-primary)"
              onClick={() => {
                onViewportWidthChange(preset.width);
                onViewportHeightChange(preset.height);
              }}
            >
              {presetLabel}
            </button>
          );
        })}
      </div>
      <div className="hidden min-w-0 flex-1 items-center gap-2 max-[980px]:inline-flex">
        <label
          className="font-medium whitespace-nowrap text-(--text-secondary)"
          htmlFor="ViewportQuickPresetsSelect"
        >
          {t('viewport.quickPresetMenu')}
        </label>
        <select
          id="ViewportQuickPresetsSelect"
          className="h-6 min-w-0 rounded-full border border-(--border-default) bg-(--bg-canvas) px-2.5 text-[11px] text-(--text-primary)"
          defaultValue=""
          onChange={(event) => {
            const preset = VIEWPORT_QUICK_PRESETS.find(
              (item) => item.id === event.target.value
            );
            if (!preset) return;
            onViewportWidthChange(preset.width);
            onViewportHeightChange(preset.height);
          }}
        >
          <option value="">{t('viewport.quickPresetMenu')}</option>
          {VIEWPORT_QUICK_PRESETS.map((preset) => {
            const presetLabel = t(preset.labelKey, {
              defaultValue: `${preset.width}×${preset.height}`,
            });
            return (
              <option key={preset.id} value={preset.id}>
                {presetLabel}
              </option>
            );
          })}
        </select>
      </div>
      <PdxPopover
        className="ml-auto flex-none"
        panelClassName="max-h-[min(60vh,520px)] w-[min(760px,90vw)] overflow-auto p-2.5"
        panelStyle={{
          top: 'auto',
          right: 0,
          bottom: '100%',
          left: 'auto',
          marginTop: 0,
          marginBottom: '6px',
        }}
        content={
          <div className="grid [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))] gap-2.5">
            {VIEWPORT_DEVICE_PRESETS.map((preset) => {
              const Icon = preset.icon;
              const deviceName = t(preset.nameKey, {
                defaultValue: preset.id,
              });
              const deviceKind = t(preset.kindKey, {
                defaultValue: preset.kind,
              });
              const sizeLabel = t('viewport.size', {
                width: preset.width,
                height: preset.height,
              });
              return (
                <button
                  key={preset.id}
                  className="flex min-w-[190px] items-center gap-2.5 rounded-[14px] border border-(--border-default) bg-(--bg-canvas) px-2.5 py-1.5 text-left text-xs text-(--text-muted) transition-[border-color,color,background] duration-150 hover:border-(--border-strong) hover:bg-(--bg-raised) hover:text-(--text-primary) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent-color)"
                  onClick={() => {
                    onViewportWidthChange(preset.width);
                    onViewportHeightChange(preset.height);
                  }}
                  aria-label={`${deviceName} ${sizeLabel}`}
                >
                  <span
                    className={`ViewportPresetIcon inline-flex h-[30px] w-[30px] flex-none items-center justify-center rounded-[10px] bg-(--bg-raised) text-(--text-secondary) ${DEVICE_KIND_ICON_STYLES[preset.kind] ?? ''}`}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-xs font-medium text-(--text-primary)">
                      {deviceName}
                    </span>
                    <span className="text-[10px] text-(--text-muted)">
                      {deviceKind}
                    </span>
                  </span>
                  <span className="ml-auto text-[11px] text-(--text-muted) tabular-nums">
                    {sizeLabel}
                  </span>
                </button>
              );
            })}
          </div>
        }
      >
        <button
          type="button"
          className="ViewportMoreButton inline-flex h-6 items-center gap-1 rounded-full border border-(--border-default) bg-(--bg-canvas) px-2 text-[11px] leading-none whitespace-nowrap text-(--text-muted) transition-[border-color,color,background] duration-150 hover:border-(--border-strong) hover:bg-(--bg-raised) hover:text-(--text-primary)"
        >
          {t('viewport.moreDevices')}
          <ChevronDown size={12} />
        </button>
      </PdxPopover>
    </section>
  );
}
