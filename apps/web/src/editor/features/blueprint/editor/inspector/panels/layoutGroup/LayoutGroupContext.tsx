import { createContext, useContext } from 'react';
import type { BlueprintInspectorNodeView } from '../../projection';
import type { InspectorUpdateNode } from '../types';
import type { LayoutGroupTranslate } from './types';

export type LayoutGroupContextValue = {
  node: BlueprintInspectorNodeView;
  updateNode: InspectorUpdateNode;
  display: string | undefined;
  isPatternStructureControlled: boolean;
  t: LayoutGroupTranslate;
};

export const LayoutGroupContext = createContext<LayoutGroupContextValue | null>(
  null
);

export const useLayoutGroupContext = (): LayoutGroupContextValue => {
  const value = useContext(LayoutGroupContext);
  if (!value) {
    throw new Error(
      'LayoutGroupContext is missing. Groups must be rendered inside LayoutPanelView.'
    );
  }
  return value;
};
