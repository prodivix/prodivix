import { PdxCard, PdxDiv, PdxPanel, PdxSection, PdxText } from '@prodivix/ui';
import type { ComponentGroup } from '@/editor/features/design/blueprint/editor/model/types';
import { buildVariants } from '@/editor/features/design/blueprint/data/helpers';
import {
  CARD_VARIANTS,
  PANEL_VARIANTS,
  SIZE_OPTIONS,
} from '@/editor/features/design/blueprint/data/options';

export const LAYOUT_GROUP: ComponentGroup = {
  id: 'layout',
  title: '布局组件',
  items: [
    {
      id: 'div',
      name: 'Div',
      preview: (
        <PdxDiv
          padding="6px"
          backgroundColor="var(--bg-panel)"
          borderRadius="6px"
        >
          <PdxText size="Tiny">Div</PdxText>
        </PdxDiv>
      ),
    },
    {
      id: 'flex',
      name: 'Flex',
      preview: (
        <PdxDiv
          display="Flex"
          gap="6px"
          padding="6px"
          backgroundColor="var(--bg-panel)"
          borderRadius="6px"
        >
          <PdxDiv
            width="18px"
            height="18px"
            backgroundColor="var(--border-subtle)"
            borderRadius="4px"
          >
            {null}
          </PdxDiv>
          <PdxDiv
            width="18px"
            height="18px"
            backgroundColor="var(--border-default)"
            borderRadius="4px"
          >
            {null}
          </PdxDiv>
          <PdxDiv
            width="18px"
            height="18px"
            backgroundColor="var(--border-strong)"
            borderRadius="4px"
          >
            {null}
          </PdxDiv>
        </PdxDiv>
      ),
    },
    {
      id: 'grid',
      name: 'Grid',
      preview: (
        <PdxDiv
          display="Grid"
          gap="6px"
          padding="6px"
          backgroundColor="var(--bg-panel)"
          borderRadius="6px"
          style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}
        >
          <PdxDiv
            height="16px"
            backgroundColor="var(--border-subtle)"
            borderRadius="4px"
          >
            {null}
          </PdxDiv>
          <PdxDiv
            height="16px"
            backgroundColor="var(--border-default)"
            borderRadius="4px"
          >
            {null}
          </PdxDiv>
          <PdxDiv
            height="16px"
            backgroundColor="var(--border-strong)"
            borderRadius="4px"
          >
            {null}
          </PdxDiv>
          <PdxDiv
            height="16px"
            backgroundColor="var(--text-muted)"
            borderRadius="4px"
          >
            {null}
          </PdxDiv>
        </PdxDiv>
      ),
    },
    {
      id: 'section',
      name: 'Section',
      preview: (
        <PdxSection size="Medium" padding="Small" backgroundColor="Light">
          <PdxText size="Tiny">Section</PdxText>
        </PdxSection>
      ),
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxSection
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          padding="Small"
          backgroundColor="Light"
        >
          <PdxText size="Tiny">Section</PdxText>
        </PdxSection>
      ),
      scale: 0.65,
    },
    {
      id: 'card',
      name: 'Card',
      preview: (
        <PdxCard size="Medium" variant="Bordered" padding="Small">
          <PdxText size="Tiny">Card</PdxText>
        </PdxCard>
      ),
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxCard
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          variant="Bordered"
          padding="Small"
        >
          <PdxText size="Tiny">Card</PdxText>
        </PdxCard>
      ),
      variants: buildVariants(CARD_VARIANTS, (variant) => (
        <PdxCard size="Medium" variant={variant} padding="Small">
          <PdxText size="Tiny">{variant}</PdxText>
        </PdxCard>
      )),
    },
    {
      id: 'panel',
      name: 'Panel',
      preview: (
        <PdxPanel size="Medium" title="Panel">
          <PdxText size="Tiny">Content</PdxText>
        </PdxPanel>
      ),
      sizeOptions: SIZE_OPTIONS,
      renderPreview: ({ size }) => (
        <PdxPanel
          size={(size ?? 'Medium') as 'Small' | 'Medium' | 'Large'}
          title="Panel"
        >
          <PdxText size="Tiny">Content</PdxText>
        </PdxPanel>
      ),
      variants: buildVariants(PANEL_VARIANTS, (variant) => (
        <PdxPanel size="Medium" variant={variant} title="Panel">
          <PdxText size="Tiny">{variant}</PdxText>
        </PdxPanel>
      )),
      scale: 0.64,
    },
  ],
};
