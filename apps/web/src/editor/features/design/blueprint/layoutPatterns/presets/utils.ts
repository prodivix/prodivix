import type { ComponentNode } from '@/core/types/engine.types';
import {
  createLayoutPatternRoleDataAttributes,
  createLayoutPatternRootDataAttributes,
} from '@/editor/features/design/blueprint/layoutPatterns/dataAttributes';
import type { LayoutPatternRole } from '@/editor/features/design/blueprint/layoutPatterns/layoutPattern.types';

const withDataAttributes = (
  node: ComponentNode,
  dataAttributes: Record<string, string>
): ComponentNode => ({
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
  children?: ComponentNode[];
}): ComponentNode =>
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
  children?: ComponentNode[];
}): ComponentNode =>
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
