import type React from 'react';
import type { TFunction } from 'i18next';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import type { InspectorUpdateNode } from '../types';

export type LayoutGroupRenderProps = {
  node: ComponentNode;
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
    node: ComponentNode,
    display: string | undefined,
    isPatternStructureControlled: boolean
  ) => boolean;
  render: (props: LayoutGroupRenderProps) => React.ReactNode;
};
