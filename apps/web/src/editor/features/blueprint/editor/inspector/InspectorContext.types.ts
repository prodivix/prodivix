import type React from 'react';
import type { BlueprintInspectorNodeView } from './projection';
import type { RouteManifestIssue } from '@prodivix/router';
import type { IconRef } from '@prodivix/pir-react-renderer';
import type {
  InspectorPanelDefinition,
  InspectorUpdateNode,
} from '@/editor/features/blueprint/editor/inspector/panels/types';
import type { MountedCssEntry } from '@/editor/features/blueprint/editor/inspector/components/classProtocol/mountedCss';
import type { EditableTextField } from '@/editor/features/blueprint/editor/model/blueprintText';

export type InspectorTab = 'basic' | 'style' | 'data' | 'code';

type InspectorTranslate = (
  key: string,
  options?: Record<string, unknown>
) => string;

export type InspectorComponentPropDefinition = Readonly<{
  name: string;
  valueType:
    'string' | 'number' | 'boolean' | 'object' | 'array' | 'event' | 'unknown';
  required?: boolean;
  description?: string;
}>;

export type InspectorComponentMeta = {
  source: 'builtIn' | 'external';
  libraryId?: string;
  runtimeType: string;
  defaultProps?: Record<string, unknown>;
  propOptions?: Record<string, string[]>;
  propDefinitions?: readonly InspectorComponentPropDefinition[];
};

export type InspectorCoreContext = {
  t: InspectorTranslate;
  projectId?: string;
  selectedNode: BlueprintInspectorNodeView | null;
  updateSelectedNode: InspectorUpdateNode;
  expandedPanels: Record<string, boolean>;
  togglePanel: (key: string) => void;
  readonly: boolean;
  bindingDiagnostics: readonly string[];
};

export type InspectorIdentityContext = {
  primaryTextField: EditableTextField | null;
};

export type InspectorCapabilitiesContext = {
  supportsClassProtocol: boolean;
  classNameValue: string;
  mountedCssEntries: MountedCssEntry[];
  openMountedCssEditor: (target?: {
    path?: string;
    className?: string;
    line?: number;
    column?: number;
  }) => void;
  isIconNode: boolean;
  SelectedIconComponent: React.ComponentType<{
    size: number;
    width: number;
    height: number;
  }> | null;
  selectedIconRef: IconRef | null;
  setIconPickerOpen: (open: boolean) => void;
  linkPropKey: string | null;
  linkDestination: string;
  linkTarget: '_self' | '_blank';
  linkRel: string;
  linkTitle: string;
  targetPropKey: string;
  relPropKey: string;
  titlePropKey: string;
  routeOptions: Array<{ id: string; path: string }>;
  outletRouteNodeId: string;
  activeRouteNodeId?: string;
  bindOutletToRoute: (
    routeNodeId: string,
    outletNodeId: string | undefined
  ) => void;
  selectedParentNode: BlueprintInspectorNodeView | null;
  componentMeta: InspectorComponentMeta | null;
  dataModelFieldPaths: string[];
};

export type InspectorActiveRouteDetails = {
  id: string;
  path: string;
  label: string;
  segment: string;
  depth: number;
  treeIndex: number | null;
  parentId?: string;
  isIndexRoute: boolean;
  pageDocId?: string;
  layoutDocId?: string;
  defaultOutletNodeId?: string;
  outletBindings: Array<{
    name: string;
    outletNodeId: string;
    pageDocId?: string;
  }>;
  runtimeRefs: Array<{
    kind: 'loader' | 'action' | 'guard';
    artifactId: string;
    exportName?: string;
    symbolId?: string;
  }>;
  issues: RouteManifestIssue[];
};

export type InspectorRouteContext = {
  activeRouteDetails: InspectorActiveRouteDetails | null;
  canAttachLayoutToActiveRoute: boolean;
  canDetachLayoutFromActiveRoute: boolean;
  attachLayoutToActiveRoute: () => void;
  detachLayoutFromActiveRoute: () => void;
};

export type InspectorStyleContext = {
  matchedPanels: InspectorPanelDefinition[];
  hasAnimationDefinition: boolean;
  isAnimationMounted: boolean;
  mountedAnimationBindingCount: number;
  mountSelectedNodeToAnimation: () => void;
  unmountSelectedNodeFromAnimation: () => void;
  openAnimationEditor: () => void;
  canOpenAnimationEditor: boolean;
  animationWriteAvailable: boolean;
  animationDiagnostic?: string;
};

export type InspectorDataContext = {
  dataModelFieldPaths: string[];
  collectionWriteAvailable: boolean;
  collectionDiagnostic?: string;
};

export type TriggerEntry = {
  key: string;
  trigger: string;
  action?: string;
  params: Record<string, unknown>;
  editable?: boolean;
  diagnostic?: string;
};

export type InspectorCodeContext = {
  controlledJsxArtifactId?: string;
  controlledCssArtifactId?: string;
  controlledCodeCanCreate: boolean;
  createControlledCode: () => void;
  openControlledJsx: () => void;
  openControlledCss: () => void;
  addTrigger: () => void;
  updateTrigger: (
    triggerKey: string,
    updater: (event: TriggerEntry) => TriggerEntry
  ) => void;
  removeTrigger: (triggerKey: string) => void;
  hasLinkTriggerConflict: boolean;
  triggerEntries: TriggerEntry[];
  graphOptions: Array<{ id: string; label: string }>;
};

export type InspectorContextValue = InspectorCoreContext &
  InspectorIdentityContext &
  InspectorCapabilitiesContext &
  InspectorRouteContext &
  InspectorStyleContext &
  InspectorDataContext &
  InspectorCodeContext;
