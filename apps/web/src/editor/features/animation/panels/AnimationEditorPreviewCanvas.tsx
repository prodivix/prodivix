import { Minus, Pause, Play, Plus, RotateCcw, SkipBack } from 'lucide-react';
import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentNode, PIRDocument } from '@prodivix/shared/types/pir';
import type {
  AnimationTimeline,
  SvgFilterDefinition,
} from '@prodivix/animation';
import { PIRRenderer } from '@prodivix/pir-react-renderer';
import { materializePirRoot } from '@prodivix/pir';
import { buildAnimationPreviewSnapshot } from '@prodivix/runtime-browser';

type AnimationEditorPreviewCanvasProps = {
  pirDoc: PIRDocument;
  previewNodeId?: string;
  timeline: AnimationTimeline | undefined;
  cursorMs: number;
  onCursorChange?: (nextMs: number) => void;
  svgFilters: SvgFilterDefinition[];
  zoom: number;
  onZoomChange: (nextZoom: number) => void;
  selectedNodeId?: string;
  onSelectNodeId?: (nodeId: string) => void;
};

const clampZoom = (value: number) =>
  Math.min(4, Math.max(0.2, Math.round(value * 100) / 100));

const findNodeById = (
  node: ComponentNode,
  nodeId: string
): ComponentNode | undefined => {
  if (node.id === nodeId) return node;
  for (const child of node.children ?? []) {
    const matched = findNodeById(child, nodeId);
    if (matched) return matched;
  }
  return undefined;
};

const renderSvgPrimitive = (
  primitive: SvgFilterDefinition['primitives'][number]
) => {
  const props: Record<string, unknown> = { key: primitive.id };
  if (primitive.in) props['in'] = primitive.in;
  if (primitive.in2) props.in2 = primitive.in2;
  if (primitive.result) props.result = primitive.result;
  if (primitive.attrs) {
    Object.entries(primitive.attrs).forEach(([key, value]) => {
      props[key] = value;
    });
  }
  return createElement(primitive.type, props);
};

export const AnimationEditorPreviewCanvas = ({
  pirDoc,
  previewNodeId,
  timeline,
  cursorMs,
  onCursorChange,
  svgFilters,
  zoom,
  onZoomChange,
  selectedNodeId,
  onSelectNodeId,
}: AnimationEditorPreviewCanvasProps) => {
  const { t } = useTranslation('editor');
  const [playing, setPlaying] = useState(false);
  const cursorRef = useRef(cursorMs);

  useEffect(() => {
    cursorRef.current = cursorMs;
  }, [cursorMs]);

  useEffect(() => {
    if (!playing) return;
    if (!timeline || !onCursorChange) return;

    let rafId = 0;
    let lastTs: number | null = null;

    const tick = (ts: number) => {
      if (lastTs === null) lastTs = ts;
      const delta = ts - lastTs;
      lastTs = ts;

      const durationMs = timeline.durationMs;
      if (durationMs > 0) {
        let nextMs = cursorRef.current + delta;
        if (nextMs >= durationMs) nextMs = nextMs % durationMs;
        cursorRef.current = nextMs;
        onCursorChange(nextMs);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [onCursorChange, playing, timeline]);

  const preview = useMemo(
    () =>
      buildAnimationPreviewSnapshot({
        timeline,
        cursorMs,
        svgFilters,
      }),
    [cursorMs, svgFilters, timeline]
  );
  const previewNode = useMemo(() => {
    if (!previewNodeId?.trim()) return undefined;
    return findNodeById(materializePirRoot(pirDoc), previewNodeId.trim());
  }, [pirDoc, previewNodeId]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_30%_20%,rgb(var(--bg-panel-rgb)_/_0.9),transparent_55%),radial-gradient(circle_at_80%_30%,rgb(var(--bg-raised-rgb)_/_0.6),transparent_55%),linear-gradient(120deg,rgb(var(--bg-canvas-rgb)_/_0.9),rgb(var(--bg-panel-rgb)_/_0.96))] shadow-[0_18px_38px_rgba(0,0,0,0.06)]">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-full border border-black/10 bg-[rgb(var(--bg-canvas-rgb)_/_0.78)] px-2 py-1 text-xs text-(--text-secondary) shadow-[0_10px_24px_rgba(0,0,0,0.12)] backdrop-blur-sm">
        <button
          type="button"
          onClick={() => {
            if (!timeline || !onCursorChange) return;
            cursorRef.current = 0;
            onCursorChange(0);
            setPlaying(false);
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-black/8 disabled:opacity-40"
          aria-label={t('animationEditor.preview.jumpToStart')}
          title={t('animationEditor.preview.jumpToStart')}
          disabled={!timeline || !onCursorChange}
        >
          <SkipBack size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!timeline || !onCursorChange) return;
            setPlaying((prev) => !prev);
          }}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-black/8 disabled:opacity-40"
          aria-label={
            playing
              ? t('animationEditor.preview.pause')
              : t('animationEditor.preview.play')
          }
          title={
            playing
              ? t('animationEditor.preview.pause')
              : t('animationEditor.preview.play')
          }
          disabled={!timeline || !onCursorChange}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <div className="mx-1 h-5 w-px bg-black/10" />
        <button
          type="button"
          onClick={() => onZoomChange(clampZoom(zoom - 0.1))}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-black/8"
          aria-label={t('animationEditor.preview.zoomOut')}
          title={t('animationEditor.preview.zoomOut')}
        >
          <Minus size={14} />
        </button>
        <span className="w-14 text-center tabular-nums">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => onZoomChange(clampZoom(zoom + 0.1))}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-black/8"
          aria-label={t('animationEditor.preview.zoomIn')}
          title={t('animationEditor.preview.zoomIn')}
        >
          <Plus size={14} />
        </button>
        <div className="mx-1 h-5 w-px bg-black/10" />
        <button
          type="button"
          onClick={() => onZoomChange(1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-black/8"
          aria-label={t('animationEditor.preview.resetZoom')}
          title={t('animationEditor.preview.resetZoom')}
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto p-10">
        <style>{preview.cssText}</style>
        {preview.svgFilters.length ? (
          <svg
            width="0"
            height="0"
            aria-hidden="true"
            focusable="false"
            className="absolute"
          >
            <defs>
              {preview.svgFilters.map((filter) => (
                <filter
                  key={filter.id}
                  id={filter.id}
                  filterUnits={filter.units}
                >
                  {filter.primitives.map(renderSvgPrimitive)}
                </filter>
              ))}
            </defs>
          </svg>
        ) : null}

        <div
          className="mx-auto flex min-h-[420px] min-w-[520px] items-center justify-center rounded-2xl bg-[rgb(var(--bg-canvas-rgb)_/_0.96)] p-8 shadow-[0_18px_48px_rgba(0,0,0,0.12)]"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
          }}
        >
          {previewNode ? (
            <PIRRenderer
              node={previewNode}
              pirDoc={pirDoc}
              selectedId={selectedNodeId ?? previewNode.id}
              onNodeSelect={(nodeId) => {
                onSelectNodeId?.(nodeId);
              }}
            />
          ) : (
            <div className="rounded-xl border border-dashed border-black/20 bg-black/[0.02] px-8 py-6 text-xs tracking-[0.06em] text-(--text-muted)">
              {t('animationEditor.preview.selectBindingTarget')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
