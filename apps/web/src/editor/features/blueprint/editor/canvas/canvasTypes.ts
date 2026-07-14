import type {
  PIRCollectionPreviewInput,
  PIRCollectionProjectionLocation,
} from '@prodivix/pir';
import type {
  PIRRenderLocation,
  PIRRendererBlockingIssue,
  PIRRendererHost,
  PIRTriggerDispatchRequest,
} from '@prodivix/pir-react-renderer';
import type { WorkspaceSnapshot } from '@prodivix/workspace';

export type BlueprintCanvasInteractionMode = 'design' | 'interactive';

export type BlueprintEditorCanvasProps = {
  workspace: WorkspaceSnapshot;
  entryDocumentId: string;
  rendererHost: PIRRendererHost;
  currentPath: string;
  interactionMode: BlueprintCanvasInteractionMode;
  viewportWidth: string;
  viewportHeight: string;
  zoom: number;
  pan: { x: number; y: number };
  selectedLocation?: PIRRenderLocation;
  hiddenLocations?: readonly PIRRenderLocation[];
  rootParamsById?: Readonly<Record<string, unknown>>;
  rootStateById?: Readonly<Record<string, unknown>>;
  rootDataById?: Readonly<Record<string, unknown>>;
  rootComponentPropsById?: Readonly<Record<string, unknown>>;
  rootComponentVariantsById?: Readonly<Record<string, string | undefined>>;
  resolveCollectionPreviewState?: (
    location: PIRCollectionProjectionLocation
  ) => PIRCollectionPreviewInput | undefined;
  dispatchTrigger?: (request: PIRTriggerDispatchRequest) => void;
  onPanChange: (pan: { x: number; y: number }) => void;
  onZoomChange: (value: number) => void;
  onSelectNode: (location: PIRRenderLocation) => void;
  onBlockingIssuesChange?: (
    issues: readonly PIRRendererBlockingIssue[]
  ) => void;
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
