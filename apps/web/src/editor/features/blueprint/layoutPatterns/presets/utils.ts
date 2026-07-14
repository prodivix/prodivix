import type { BlueprintInspectorNodeView } from '@/editor/features/blueprint/editor/inspector/projection';
import {
  createLayoutPatternRoleDataAttributes,
  createLayoutPatternRootDataAttributes,
} from '@/editor/features/blueprint/layoutPatterns/dataAttributes';
import type { LayoutPatternRole } from '@/editor/features/blueprint/layoutPatterns/layoutPattern.types';

const withDataAttributes = (
  node: BlueprintInspectorNodeView,
  dataAttributes: Record<string, string>
): BlueprintInspectorNodeView => ({
  ...node,
  props: {
    ...(node.props ?? {}),
    dataAttributes,
  },
});

export const createPatternRootNode = ({
  id,
  patternId,
  props,
  children,
}: {
  id: string;
  patternId: string;
  props?: Record<string, unknown>;
  children?: BlueprintInspectorNodeView[];
}): BlueprintInspectorNodeView =>
  withDataAttributes(
    {
      id,
      type: 'PdxDiv',
      props,
      children,
    },
    createLayoutPatternRootDataAttributes({
      patternId,
      role: 'root',
    })
  );

export const createPatternRoleNode = ({
  id,
  patternId,
  role,
  props,
  children,
}: {
  id: string;
  patternId: string;
  role: LayoutPatternRole;
  props?: Record<string, unknown>;
  children?: BlueprintInspectorNodeView[];
}): BlueprintInspectorNodeView =>
  withDataAttributes(
    {
      id,
      type: 'PdxDiv',
      props,
      children,
    },
    createLayoutPatternRoleDataAttributes({
      patternId,
      role,
    })
  );
