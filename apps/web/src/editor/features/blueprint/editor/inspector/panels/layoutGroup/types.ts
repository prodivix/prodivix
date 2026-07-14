import type React from 'react';
import type { TFunction } from 'i18next';
import type { BlueprintInspectorNodeView } from '../../projection';
import type { InspectorUpdateNode } from '../types';

export type LayoutGroupRenderProps = {
  node: BlueprintInspectorNodeView;
  updateNode: InspectorUpdateNode;
  display: string | undefined;
  isPatternStructureControlled: boolean;
  t: TFunction;
};

export type LayoutGroupDefinition = {
  key: string;
  title: string;
  description?: string;
  order?: number;
  match?: (
    node: BlueprintInspectorNodeView,
    display: string | undefined,
    isPatternStructureControlled: boolean
  ) => boolean;
  render: (props: LayoutGroupRenderProps) => React.ReactNode;
};
