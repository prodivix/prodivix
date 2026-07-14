import type React from 'react';
import type { BlueprintInspectorNodeView } from '../projection';
import type { InspectorTab } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';

export type InspectorUpdateNode = (
  updater: (node: BlueprintInspectorNodeView) => BlueprintInspectorNodeView
) => void;

export type InspectorPanelRenderProps = {
  node: BlueprintInspectorNodeView;
  updateNode: InspectorUpdateNode;
};

export type InspectorPanelDefinition = {
  key: string;
  title: string;
  description?: string;
  tab?: InspectorTab;
  match: (node: BlueprintInspectorNodeView) => boolean;
  headerActions?: React.ReactNode;
  render: (props: InspectorPanelRenderProps) => React.ReactNode;
};
