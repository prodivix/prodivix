import type { LayoutPatternDefinition } from '@/editor/features/blueprint/layoutPatterns/layoutPattern.types';
import { createPatternRoleNode, createPatternRootNode } from './utils';

export const HOLY_GRAIL_LAYOUT_PATTERN: LayoutPatternDefinition<{
  gap: { kind: 'length'; label: 'Gap'; defaultValue: string };
  sidebarWidth: {
    kind: 'length';
    label: 'Sidebar Width';
    defaultValue: string;
  };
}> = {
  id: 'holy-grail',
  name: 'Holy Grail',
  category: 'page',
  description: 'Header + sidebar + main + footer layout.',
  schema: {
    gap: {
      kind: 'length',
      label: 'Gap',
      defaultValue: '12px',
    },
    sidebarWidth: {
      kind: 'length',
      label: 'Sidebar Width',
      defaultValue: '240px',
    },
  },
  build: ({ createId, patternId, resolvedParams }) =>
    createPatternRootNode({
      id: createId('PdxDiv'),
      patternId,
      props: {
        display: 'Flex',
        flexDirection: 'Column',
        gap: resolvedParams.gap,
      },
      children: [
        createPatternRoleNode({
          id: createId('PdxDiv'),
          patternId,
          role: 'header',
          props: {
            padding: '12px 16px',
            backgroundColor: 'var(--bg-panel)',
            borderRadius: '8px',
          },
        }),
        createPatternRoleNode({
          id: createId('PdxDiv'),
          patternId,
          role: 'content',
          props: {
            display: 'Flex',
            gap: resolvedParams.gap,
          },
          children: [
            createPatternRoleNode({
              id: createId('PdxDiv'),
              patternId,
              role: 'sidebar',
              props: {
                width: resolvedParams.sidebarWidth,
                padding: '12px',
                backgroundColor: 'var(--bg-panel)',
                borderRadius: '8px',
              },
            }),
            createPatternRoleNode({
              id: createId('PdxDiv'),
              patternId,
              role: 'main',
              props: {
                display: 'Block',
                padding: '12px',
                backgroundColor: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                width: '100%',
              },
            }),
          ],
        }),
        createPatternRoleNode({
          id: createId('PdxDiv'),
          patternId,
          role: 'footer',
          props: {
            padding: '12px 16px',
            backgroundColor: 'var(--bg-panel)',
            borderRadius: '8px',
          },
        }),
      ],
    }),
  update: (root, context) => {
    const nextChildren = (root.children ?? []).map((child) => {
      const role =
        (child.props?.dataAttributes as Record<string, string> | undefined)?.[
          'data-layout-role'
        ] ?? '';

      if (role === 'content') {
        const contentChildren = (child.children ?? []).map((contentChild) => {
          const contentRole =
            (
              contentChild.props?.dataAttributes as
                Record<string, string> | undefined
            )?.['data-layout-role'] ?? '';
          if (contentRole === 'sidebar') {
            return {
              ...contentChild,
              props: {
                ...(contentChild.props ?? {}),
                width: context.nextParams.sidebarWidth,
              },
            };
          }
          return contentChild;
        });
        return {
          ...child,
          props: {
            ...(child.props ?? {}),
            gap: context.nextParams.gap,
          },
          children: contentChildren,
        };
      }

      return child;
    });

    return {
      ...root,
      props: {
        ...(root.props ?? {}),
        gap: context.nextParams.gap,
      },
      children: nextChildren,
    };
  },
};
