import type React from 'react';
import type { useTranslation } from 'react-i18next';
import type { BlueprintInspectorNodeView } from '../../projection';
import type { InspectorUpdateNode } from '../types';

/** Bound to the app's own `react-i18next` declaration so layout groups cannot drift from the `t` the panel actually holds. */
export type LayoutGroupTranslate = ReturnType<typeof useTranslation>['t'];

export type LayoutGroupRenderProps = {
  node: BlueprintInspectorNodeView;
  updateNode: InspectorUpdateNode;
  display: string | undefined;
  isPatternStructureControlled: boolean;
  t: LayoutGroupTranslate;
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
