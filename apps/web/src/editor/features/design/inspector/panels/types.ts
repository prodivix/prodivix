import type React from 'react';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import type { InspectorTab } from '@/editor/features/design/inspector/InspectorContext.types';

export type InspectorUpdateNode = (
  updater: (node: ComponentNode) => ComponentNode
) => void;

export type InspectorPanelRenderProps = {
  node: ComponentNode;
  updateNode: InspectorUpdateNode;
};

export type InspectorPanelDefinition = {
  key: string;
  title: string;
  description?: string;
  tab?: InspectorTab;
  match: (node: ComponentNode) => boolean;
  headerActions?: React.ReactNode;
  render: (props: InspectorPanelRenderProps) => React.ReactNode;
};
