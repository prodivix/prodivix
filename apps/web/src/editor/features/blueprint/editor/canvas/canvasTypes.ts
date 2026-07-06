export type BlueprintCanvasInteractionMode = 'design' | 'interactive';

export type BlueprintEditorCanvasProps = {
  currentPath: string;
  interactionMode: BlueprintCanvasInteractionMode;
  viewportWidth: string;
  viewportHeight: string;
  zoom: number;
  pan: { x: number; y: number };
  selectedId?: string;
  hiddenNodeIds: string[];
  runtimeState?: Record<string, unknown>;
  onPanChange: (pan: { x: number; y: number }) => void;
  onZoomChange: (value: number) => void;
  onSelectNode: (nodeId: string) => void;
  onNavigateRequest?: (options: {
    params?: Record<string, unknown>;
    nodeId: string;
    trigger: string;
    eventKey: string;
    payload?: unknown;
  }) => void;
  onExecuteGraphRequest?: (options: {
    params?: Record<string, unknown>;
    nodeId: string;
    trigger: string;
    eventKey: string;
    payload?: unknown;
  }) => void;
};

export type PanState = {
  pointerId: number | null;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

export type RouteCanvasDiagnostic = {
  code: string;
  message: string;
};
