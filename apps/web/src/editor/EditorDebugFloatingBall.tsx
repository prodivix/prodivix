import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Bug } from 'lucide-react';
import type { RouteDebugSnapshot } from '@/pir/renderer/routeDebug';

type DebugMetrics = {
  elementCount: number;
  pirNodeElementCount: number;
  selectedPirNodeElementCount: number;
  routeCount: number;
  currentPath?: string;
  interactionMode?: string;
};

type FloatingPosition = {
  x: number;
  y: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

type DragState = {
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  didDrag: boolean;
};

const BALL_SIZE = 40;
const EDGE_PADDING = 12;
const DRAG_THRESHOLD = 4;
const POSITION_STORAGE_KEY = 'prodivix.editorDebugFloatingBall.position';

const readViewportSize = (): ViewportSize => ({
  width: typeof window === 'undefined' ? 0 : window.innerWidth,
  height: typeof window === 'undefined' ? 0 : window.innerHeight,
});

const clampPosition = (
  position: FloatingPosition,
  viewport = readViewportSize()
): FloatingPosition => ({
  x: Math.min(
    Math.max(position.x, EDGE_PADDING),
    Math.max(EDGE_PADDING, viewport.width - BALL_SIZE - EDGE_PADDING)
  ),
  y: Math.min(
    Math.max(position.y, EDGE_PADDING),
    Math.max(EDGE_PADDING, viewport.height - BALL_SIZE - EDGE_PADDING)
  ),
});

const readInitialPosition = (): FloatingPosition => {
  if (typeof window === 'undefined') {
    return { x: EDGE_PADDING, y: EDGE_PADDING };
  }
  const fallbackPosition = () =>
    clampPosition({
      x: window.innerWidth - BALL_SIZE - 16,
      y: window.innerHeight - BALL_SIZE - 16,
    });
  try {
    const storedPosition = window.localStorage.getItem(POSITION_STORAGE_KEY);
    if (storedPosition) {
      const parsed = JSON.parse(storedPosition) as Partial<FloatingPosition>;
      if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
        return clampPosition(parsed);
      }
    }
  } catch {
    return fallbackPosition();
  }
  return fallbackPosition();
};

const persistPosition = (position: FloatingPosition) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
  } catch {
    return;
  }
};

const readDebugMetrics = (): DebugMetrics => {
  const snapshot: RouteDebugSnapshot | undefined =
    window.__PRODIVIX_ROUTE_DEBUG_SNAPSHOT__?.();
  return {
    elementCount:
      snapshot?.elementCount ?? document.querySelectorAll('*').length,
    pirNodeElementCount:
      snapshot?.pirNodeElementCount ??
      document.querySelectorAll('[data-pir-node-id], [data-pir-id]').length,
    selectedPirNodeElementCount: snapshot?.selectedPirNodeElementCount ?? 0,
    routeCount: snapshot?.routeCount ?? 0,
    currentPath: snapshot?.currentPath,
    interactionMode: snapshot?.interactionMode,
  };
};

const areDebugMetricsEqual = (a: DebugMetrics, b: DebugMetrics) =>
  a.elementCount === b.elementCount &&
  a.pirNodeElementCount === b.pirNodeElementCount &&
  a.selectedPirNodeElementCount === b.selectedPirNodeElementCount &&
  a.routeCount === b.routeCount &&
  a.currentPath === b.currentPath &&
  a.interactionMode === b.interactionMode;

export function EditorDebugFloatingBall() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isCapsuleVisible, setIsCapsuleVisible] = useState(true);
  const [position, setPosition] = useState<FloatingPosition>(() =>
    readInitialPosition()
  );
  const [viewportSize, setViewportSize] = useState<ViewportSize>(() =>
    readViewportSize()
  );
  const [metrics, setMetrics] = useState<DebugMetrics>(() =>
    typeof window === 'undefined'
      ? {
          elementCount: 0,
          pirNodeElementCount: 0,
          selectedPirNodeElementCount: 0,
          routeCount: 0,
        }
      : readDebugMetrics()
  );
  const positionRef = useRef(position);
  const dragStateRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__PRODIVIX_DEBUG_ROUTE__ = isEnabled;
    return () => {
      window.__PRODIVIX_DEBUG_ROUTE__ = false;
    };
  }, [isEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refreshMetrics = () => {
      const nextMetrics = readDebugMetrics();
      setMetrics((current) =>
        areDebugMetricsEqual(current, nextMetrics) ? current : nextMetrics
      );
    };
    refreshMetrics();
    const intervalId = window.setInterval(refreshMetrics, 500);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      const nextViewportSize = readViewportSize();
      setViewportSize(nextViewportSize);
      setPosition((current) => {
        const nextPosition = clampPosition(current, nextViewportSize);
        positionRef.current = nextPosition;
        return nextPosition;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const title = useMemo(() => {
    const parts = [
      isEnabled ? 'Route debug on' : 'Route debug off',
      isCapsuleVisible ? 'Capsule visible' : 'Capsule hidden',
      `DOM ${metrics.elementCount.toLocaleString()}`,
      `PIR ${metrics.pirNodeElementCount.toLocaleString()}`,
    ];
    if (metrics.currentPath) parts.push(`Route ${metrics.currentPath}`);
    if (metrics.interactionMode) parts.push(`Mode ${metrics.interactionMode}`);
    return parts.join(' · ');
  }, [isCapsuleVisible, isEnabled, metrics]);

  const capsulePlacement = useMemo(() => {
    const spaceLeft = position.x - EDGE_PADDING;
    const spaceRight =
      viewportSize.width - position.x - BALL_SIZE - EDGE_PADDING;
    const spaceTop = position.y - EDGE_PADDING;
    const spaceBottom =
      viewportSize.height - position.y - BALL_SIZE - EDGE_PADDING;

    if (spaceLeft >= 210 && spaceLeft >= spaceRight) return 'left';
    if (spaceRight >= 210) return 'right';
    if (spaceTop >= spaceBottom) return 'top';
    return 'bottom';
  }, [position, viewportSize]);

  const capsulePlacementClass = {
    left: 'right-full top-1/2 mr-2 -translate-y-1/2',
    right: 'left-full top-1/2 ml-2 -translate-y-1/2',
    top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
    bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  }[capsulePlacement];

  const handlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const dragState: DragState = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: positionRef.current.x,
      startY: positionRef.current.y,
      didDrag: false,
    };
    dragStateRef.current = dragState;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const currentDragState = dragStateRef.current;
      if (!currentDragState) return;
      const deltaX = moveEvent.clientX - currentDragState.startClientX;
      const deltaY = moveEvent.clientY - currentDragState.startClientY;
      if (
        !currentDragState.didDrag &&
        Math.hypot(deltaX, deltaY) > DRAG_THRESHOLD
      ) {
        currentDragState.didDrag = true;
        setIsDragging(true);
      }
      if (!currentDragState.didDrag) return;
      moveEvent.preventDefault();
      const nextPosition = clampPosition({
        x: currentDragState.startX + deltaX,
        y: currentDragState.startY + deltaY,
      });
      positionRef.current = nextPosition;
      setPosition(nextPosition);
    };

    const handlePointerUp = () => {
      const currentDragState = dragStateRef.current;
      if (currentDragState?.didDrag) {
        suppressClickRef.current = true;
        persistPosition(positionRef.current);
      }
      dragStateRef.current = null;
      setIsDragging(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove, {
      passive: false,
    });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  return (
    <div
      className="fixed z-50 text-[11px] text-(--text-muted)"
      style={{ left: position.x, top: position.y }}
    >
      {isCapsuleVisible ? (
        <div
          className={`pointer-events-none absolute flex h-9 items-center gap-2 whitespace-nowrap rounded-full border border-(--border-default) bg-(--bg-panel) px-3 font-medium shadow-(--shadow-lg) tabular-nums ${capsulePlacementClass}`}
        >
          <span>DOM {metrics.elementCount.toLocaleString()}</span>
          <span className="text-(--border-strong)">·</span>
          <span>PIR {metrics.pirNodeElementCount.toLocaleString()}</span>
          {metrics.currentPath ? (
            <>
              <span className="text-(--border-strong)">·</span>
              <span className="max-w-[120px] truncate text-(--text-secondary)">
                {metrics.currentPath}
              </span>
            </>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className={`inline-flex h-10 w-10 touch-none select-none items-center justify-center rounded-full border shadow-(--shadow-lg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent-color) ${
          isEnabled
            ? 'border-(--accent-color) bg-(--accent-color) text-white'
            : 'border-(--border-default) bg-(--bg-panel) text-(--text-secondary) hover:border-(--border-strong) hover:bg-(--bg-raised) hover:text-(--text-primary)'
        } ${
          isDragging
            ? 'cursor-grabbing transition-none'
            : 'cursor-grab transition-[border-color,background,color,transform] duration-150 hover:-translate-y-0.5'
        }`}
        title={title}
        aria-label={title}
        aria-pressed={isEnabled}
        onPointerDown={handlePointerDown}
        onContextMenu={(event) => {
          event.preventDefault();
          setIsCapsuleVisible((current) => !current);
        }}
        onClick={(event) => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            event.preventDefault();
            return;
          }
          setIsEnabled((current) => !current);
        }}
      >
        <Bug size={16} />
      </button>
    </div>
  );
}
