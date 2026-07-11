import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import { PIRRenderer } from '@/pir/renderer/PIRRenderer';
import type { RendererCodeArtifact } from '@/pir/renderer/PIRRenderer.types';
import { materializePirRoot } from '@/pir/graph';
import { isWorkspaceCodeDocumentContent } from '@/workspace';
import {
  createOrderedComponentRegistry,
  parseResolverOrder,
} from '@/pir/renderer/registry';
import {
  createRendererProjectionRegistry,
  useWebExtensionRegistrySnapshot,
} from '@/plugins/platform';
import { OfficialReactSurfaceBoundary } from '@/plugins/platform/officialSurfaceHost';
import { normalizeAnimationDefinition } from '@/editor/features/animation/animationEditorModel';
import { buildAnimationPreviewSnapshotFromTimelines } from '@/editor/features/animation/preview/animationPreview';
import { VIEWPORT_ZOOM_RANGE } from '@/editor/features/blueprint/editor/model/viewport';
import { CanvasPlaceholder } from './CanvasPlaceholder';
import { CanvasRouteDiagnostics } from './CanvasRouteDiagnostics';
import {
  canConsumeScroll,
  DRAG_THRESHOLD,
  getTimestamp,
  isInteractiveTarget,
  isNodeTarget,
  normalizeWheelDelta,
  parseDimension,
} from './canvasGeometry';
import type { BlueprintEditorCanvasProps, PanState } from './canvasTypes';
import { CanvasSvgFilters } from './CanvasSvgFilters';
import { createRouteCanvasDiagnostics } from './routeDiagnostics';
import { useActiveRoutePreview } from './useActiveRoutePreview';

const escapeCssAttributeValue = (value: string) =>
  value.replace(/["\\\n\r\f]/g, (char) => `\\${char}`);

const createCanvasHiddenLayerCss = (nodeIds: string[]) =>
  nodeIds
    .filter((nodeId) => nodeId.trim().length > 0)
    .map(
      (nodeId) =>
        `[data-pir-node-id="${escapeCssAttributeValue(nodeId)}"] > * { opacity: 0 !important; pointer-events: none !important; }`
    )
    .join('\n');
/**
 * 交互链路：
 * 节点点击 -> PIRRenderer -> onSelectNode -> controller；
 * 节点内置动作 -> builtInActions -> controller。
 */
export function BlueprintEditorCanvas({
  currentPath,
  interactionMode,
  viewportWidth,
  viewportHeight,
  zoom,
  pan,
  selectedId,
  hiddenNodeIds,
  runtimeState,
  onPanChange,
  onZoomChange,
  onSelectNode,
  onNavigateRequest,
  onExecuteGraphRequest,
}: BlueprintEditorCanvasProps) {
  const { t } = useTranslation('blueprint');
  const assist = useSettingsStore((state) => state.global.assist);
  const panInertia = useSettingsStore((state) => state.global.panInertia);
  const zoomStep = useSettingsStore((state) => state.global.zoomStep);
  const renderModeValue = useSettingsStore((state) => state.global.renderMode);
  const renderMode =
    renderModeValue === 'strict' || renderModeValue === 'tolerant'
      ? renderModeValue
      : 'tolerant';
  const allowExternalProps = useSettingsStore(
    (state) => state.global.allowExternalProps
  );
  const resolverOrder = useSettingsStore((state) => state.global.resolverOrder);
  const diagnostics = useSettingsStore((state) => state.global.diagnostics);
  const [isPanning, setIsPanning] = useState(false);
  const extensionRegistry = useWebExtensionRegistrySnapshot();
  const pirDoc = useEditorStore((state) => state.pirDoc);
  const workspaceDocumentsById = useEditorStore(
    (state) => state.workspaceDocumentsById
  );
  const pirRoot = useMemo(() => materializePirRoot(pirDoc), [pirDoc]);
  const codeArtifacts = useMemo<RendererCodeArtifact[]>(() => {
    const artifacts: RendererCodeArtifact[] = [];
    Object.values(workspaceDocumentsById).forEach((document) => {
      if (
        document.type !== 'code' ||
        !isWorkspaceCodeDocumentContent(document.content)
      ) {
        return;
      }
      artifacts.push({
        id: document.id,
        path: document.path,
        language: document.content.language,
        source: document.content.source,
      });
    });
    return artifacts;
  }, [workspaceDocumentsById]);
  const {
    composedRouteManifest,
    routeRuntimeContext,
    activeRouteNodeId,
    activeRouteNode,
    outletContentNode,
    outletTargetNodeId,
  } = useActiveRoutePreview(currentPath);
  const routeDiagnostics = useMemo(
    () =>
      createRouteCanvasDiagnostics(
        activeRouteNode,
        pirRoot,
        outletTargetNodeId
      ),
    [activeRouteNode, outletTargetNodeId, pirRoot]
  );
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const panState = useRef<PanState>({
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    moved: false,
  });
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const zoomStepRef = useRef(zoomStep);
  const onPanChangeRef = useRef(onPanChange);
  const onZoomChangeRef = useRef(onZoomChange);
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastMoveRef = useRef({ x: 0, y: 0, time: 0 });
  const inertiaFrameRef = useRef<number | null>(null);
  const suppressSelectRef = useRef(false);
  const canvasWidth = parseDimension(viewportWidth, 1440, 320);
  const canvasHeight = parseDimension(viewportHeight, 900, 240);
  const scale = Math.min(2, Math.max(0.4, zoom / 100));
  const showGrid = assist.includes('grid');
  const showSelectionDiagnostics = diagnostics.includes('selection');
  const animationDefinition = useMemo(
    () => normalizeAnimationDefinition(pirDoc.animation),
    [pirDoc.animation]
  );
  const animationTimelines = animationDefinition?.timelines ?? [];
  const animationSvgFilters = animationDefinition?.svgFilters ?? [];
  const animationSignature = useMemo(
    () => JSON.stringify(animationTimelines),
    [animationTimelines]
  );
  const hasAutoPlayAnimation = useMemo(
    () =>
      animationTimelines.some((timeline) =>
        timeline.bindings.some((binding) => binding.tracks.length > 0)
      ),
    [animationTimelines]
  );
  const [animationElapsedMs, setAnimationElapsedMs] = useState(0);
  const registry = useMemo(
    () =>
      createOrderedComponentRegistry(
        parseResolverOrder(resolverOrder),
        createRendererProjectionRegistry(extensionRegistry)
      ),
    [extensionRegistry, resolverOrder]
  );
  const animationPreview = useMemo(
    () =>
      buildAnimationPreviewSnapshotFromTimelines({
        timelines: animationTimelines,
        globalMs: animationElapsedMs,
        svgFilters: animationSvgFilters,
      }),
    [animationElapsedMs, animationSvgFilters, animationTimelines]
  );
  const hiddenLayerCss = useMemo(
    () => createCanvasHiddenLayerCss(hiddenNodeIds),
    [hiddenNodeIds]
  );

  const { setNodeRef: setCanvasDropRef, isOver: isCanvasOver } = useDroppable({
    id: 'canvas-drop',
    data: { kind: 'canvas' },
  });

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    zoomStepRef.current = zoomStep;
  }, [zoomStep]);

  useEffect(() => {
    onPanChangeRef.current = onPanChange;
  }, [onPanChange]);

  useEffect(() => {
    onZoomChangeRef.current = onZoomChange;
  }, [onZoomChange]);

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      if (inertiaFrameRef.current) {
        window.cancelAnimationFrame(inertiaFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setAnimationElapsedMs(0);
  }, [animationSignature]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hasAutoPlayAnimation) return;
    let rafId = 0;
    let startTs: number | null = null;
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const elapsed = Math.max(0, ts - startTs);
      setAnimationElapsedMs(elapsed);
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [hasAutoPlayAnimation, animationSignature]);

  const stopInertia = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (inertiaFrameRef.current) {
      window.cancelAnimationFrame(inertiaFrameRef.current);
      inertiaFrameRef.current = null;
    }
  }, []);

  const applyPan = useCallback((nextPan: { x: number; y: number }) => {
    panRef.current = nextPan;
    onPanChangeRef.current(nextPan);
  }, []);

  const applyZoom = useCallback((nextZoom: number) => {
    const clamped = Math.min(
      VIEWPORT_ZOOM_RANGE.max,
      Math.max(VIEWPORT_ZOOM_RANGE.min, nextZoom)
    );
    zoomRef.current = clamped;
    onZoomChangeRef.current(clamped);
  }, []);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const handleWheel = (event: WheelEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (isInteractiveTarget(target)) return;
      const { x, y } = normalizeWheelDelta(event);
      const shouldZoom = event.ctrlKey || event.metaKey;
      stopInertia();
      if (shouldZoom) {
        const zoomAxis = y !== 0 ? y : x;
        if (zoomAxis === 0) return;
        event.preventDefault();
        const direction = zoomAxis > 0 ? -1 : 1;
        applyZoom(zoomRef.current + direction * zoomStepRef.current);
        return;
      }
      const artboard = target?.closest('.BlueprintEditorCanvasArtboard');
      if (artboard instanceof HTMLElement && canConsumeScroll(artboard, x, y)) {
        return;
      }
      const panX = event.shiftKey ? -y : -x;
      const panY = event.shiftKey ? 0 : -y;
      if (panX === 0 && panY === 0) return;
      event.preventDefault();
      applyPan({
        x: panRef.current.x + panX,
        y: panRef.current.y + panY,
      });
    };
    surface.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      surface.removeEventListener('wheel', handleWheel);
    };
  }, [applyPan, applyZoom, stopInertia]);

  const setSurfaceNodeRef = useCallback(
    (node: HTMLDivElement | null) => {
      surfaceRef.current = node;
      setCanvasDropRef(node);
    },
    [setCanvasDropRef]
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (isInteractiveTarget(target) || isNodeTarget(target)) return;
    event.currentTarget.focus();
    stopInertia();
    panState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
      moved: false,
    };
    velocityRef.current = { x: 0, y: 0 };
    lastMoveRef.current = {
      x: event.clientX,
      y: event.clientY,
      time: getTimestamp(),
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (panState.current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - panState.current.startX;
    const deltaY = event.clientY - panState.current.startY;
    const now = getTimestamp();
    const lastMove = lastMoveRef.current;
    const deltaTime = now - lastMove.time;
    if (deltaTime > 0) {
      velocityRef.current = {
        x: (event.clientX - lastMove.x) / deltaTime,
        y: (event.clientY - lastMove.y) / deltaTime,
      };
    }
    lastMoveRef.current = { x: event.clientX, y: event.clientY, time: now };
    if (
      !panState.current.moved &&
      Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD
    ) {
      panState.current.moved = true;
      setIsPanning(true);
    }
    if (!panState.current.moved) return;
    event.preventDefault();
    applyPan({
      x: panState.current.originX + deltaX,
      y: panState.current.originY + deltaY,
    });
  };

  const startInertia = () => {
    if (typeof window === 'undefined') return;
    if (panInertia <= 0) return;
    const baseVelocity = velocityRef.current;
    let velocityX = baseVelocity.x * 16;
    let velocityY = baseVelocity.y * 16;
    if (Math.abs(velocityX) + Math.abs(velocityY) < 0.1) return;
    const inertiaStrength = Math.min(1, Math.max(0, panInertia / 100));
    const damping = 0.86 + inertiaStrength * 0.12;
    const step = () => {
      velocityX *= damping;
      velocityY *= damping;
      if (Math.abs(velocityX) + Math.abs(velocityY) < 0.1) {
        inertiaFrameRef.current = null;
        return;
      }
      applyPan({
        x: panRef.current.x + velocityX,
        y: panRef.current.y + velocityY,
      });
      inertiaFrameRef.current = window.requestAnimationFrame(step);
    };
    inertiaFrameRef.current = window.requestAnimationFrame(step);
  };

  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (panState.current.pointerId !== event.pointerId) return;
    const shouldInertia = panState.current.moved;
    if (panState.current.moved) {
      suppressSelectRef.current = true;
      setTimeout(() => {
        suppressSelectRef.current = false;
      }, 0);
    }
    panState.current.pointerId = null;
    panState.current.moved = false;
    setIsPanning(false);
    if (shouldInertia) {
      startInertia();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (isInteractiveTarget(event.target as HTMLElement)) return;
    const isZoomIn =
      event.key === '+' ||
      event.key === '=' ||
      event.code === 'Equal' ||
      event.code === 'NumpadAdd';
    const isZoomOut =
      event.key === '-' ||
      event.key === '_' ||
      event.code === 'Minus' ||
      event.code === 'NumpadSubtract';
    if (!isZoomIn && !isZoomOut) return;
    event.preventDefault();
    stopInertia();
    const delta = (isZoomIn ? 1 : -1) * zoomStepRef.current;
    applyZoom(zoomRef.current + delta);
  };

  const handleNodeSelect = (nodeId: string) => {
    if (suppressSelectRef.current) return;
    onSelectNode(nodeId);
  };

  const hasChildren = Boolean(pirRoot.children?.length);
  const isDesignMode = interactionMode === 'design';

  return (
    <section
      className={`BlueprintEditorCanvas relative z-1 flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-(--bg-panel) max-[1100px]:min-h-80 ${showSelectionDiagnostics && isDesignMode ? '' : 'HideSelectionDiagnostics [&_.BlueprintEditorCanvasArtboard_[data-pir-selected=true]]:outline-none'}`}
    >
      <div
        className={`BlueprintEditorCanvasSurface relative min-h-0 flex-1 touch-none overflow-hidden ${isPanning ? 'IsPanning cursor-grabbing select-none' : isDesignMode ? 'cursor-grab' : 'cursor-default'} ${isCanvasOver && isDesignMode ? 'IsOver outline-2 -outline-offset-2 outline-(--accent-color) outline-dashed' : ''}`}
        ref={setSurfaceNodeRef}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onPointerLeave={endPan}
        onKeyDown={handleKeyDown}
      >
        {showGrid && (
          <div className="BlueprintEditorCanvasGrid pointer-events-none absolute inset-0 bg-[radial-gradient(color-mix(in_srgb,var(--text-primary)_14%,transparent)_1px,transparent_1px)] bg-size-[20px_20px] opacity-30" />
        )}
        <div
          className="BlueprintEditorCanvasPanLayer absolute inset-0 origin-top-left"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
        >
          <div
            className="BlueprintEditorCanvasZoomLayer h-full w-full origin-top-left"
            style={{ transform: `scale(${scale})` }}
          >
            <div
              className="BlueprintEditorCanvasArtboard relative overflow-auto overscroll-contain border border-(--border-default) bg-(--bg-canvas) shadow-(--shadow-lg) **:data-[pir-missing=true]:outline **:data-[pir-missing=true]:outline-offset-2 **:data-[pir-missing=true]:outline-(--danger-color) **:data-[pir-missing=true]:outline-dashed **:data-[pir-selected=true]:outline-2 **:data-[pir-selected=true]:outline-offset-2 **:data-[pir-selected=true]:outline-(--accent-color)"
              style={{ width: canvasWidth, height: canvasHeight }}
            >
              <OfficialReactSurfaceBoundary>
                {animationPreview.cssText ? (
                  <style>{animationPreview.cssText}</style>
                ) : null}
                {hiddenLayerCss ? (
                  <style data-blueprint-author-hidden-layers>
                    {hiddenLayerCss}
                  </style>
                ) : null}
                <CanvasSvgFilters filters={animationPreview.svgFilters} />
                {hasChildren ? (
                  <PIRRenderer
                    pirDoc={pirDoc}
                    runtimeState={runtimeState}
                    codeArtifacts={codeArtifacts}
                    overrides={{ currentPath }}
                    outletContentNode={outletContentNode}
                    outletTargetNodeId={outletTargetNodeId}
                    selectedId={isDesignMode ? selectedId : undefined}
                    onNodeSelect={isDesignMode ? handleNodeSelect : undefined}
                    registry={registry}
                    renderMode={renderMode}
                    allowExternalProps={allowExternalProps === 'enabled'}
                    requireSelectionForEvents={false}
                    interactionMode={interactionMode}
                    // 内置动作链路：PIRRenderer -> builtInActions -> controller。
                    builtInActions={{
                      ...(onNavigateRequest
                        ? { navigate: onNavigateRequest }
                        : {}),
                      ...(onExecuteGraphRequest
                        ? {
                            executeGraph: onExecuteGraphRequest,
                          }
                        : {}),
                    }}
                    routeManifest={composedRouteManifest}
                    activeRouteNodeId={activeRouteNodeId}
                    routeRuntimeContext={routeRuntimeContext}
                  />
                ) : (
                  <CanvasPlaceholder
                    title={t('canvas.placeholderTitle')}
                    description={t('canvas.placeholderDescription')}
                  />
                )}
              </OfficialReactSurfaceBoundary>
              <CanvasRouteDiagnostics diagnostics={routeDiagnostics} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
