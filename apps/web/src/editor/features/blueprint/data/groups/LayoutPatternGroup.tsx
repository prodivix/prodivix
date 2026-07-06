import { PdxDiv } from '@prodivix/ui';
import type { ComponentGroup } from '@/editor/features/blueprint/editor/model/types';

const PATTERN_PREVIEW_STYLE = {
  borderRadius: '8px',
  backgroundColor: 'var(--bg-panel)',
};

export const LAYOUT_PATTERN_GROUP: ComponentGroup = {
  id: 'layout-pattern',
  title: '布局范式',
  items: [
    {
      id: 'layout-pattern-split',
      name: 'Split Layout',
      preview: (
        <PdxDiv
          display="Grid"
          gap="6px"
          padding="6px"
          style={{ gridTemplateColumns: '1fr 1fr' }}
        >
          <PdxDiv height="24px" style={PATTERN_PREVIEW_STYLE}>
            {null}
          </PdxDiv>
          <PdxDiv height="24px" style={PATTERN_PREVIEW_STYLE}>
            {null}
          </PdxDiv>
        </PdxDiv>
      ),
      defaultProps: {
        patternId: 'split',
      },
    },
    {
      id: 'layout-pattern-holy-grail',
      name: 'Holy Grail',
      preview: (
        <PdxDiv display="Flex" flexDirection="Column" gap="6px" padding="6px">
          <PdxDiv height="12px" style={PATTERN_PREVIEW_STYLE}>
            {null}
          </PdxDiv>
          <PdxDiv display="Flex" gap="6px">
            <PdxDiv width="20px" height="28px" style={PATTERN_PREVIEW_STYLE}>
              {null}
            </PdxDiv>
            <PdxDiv width="44px" height="28px" style={PATTERN_PREVIEW_STYLE}>
              {null}
            </PdxDiv>
          </PdxDiv>
          <PdxDiv height="10px" style={PATTERN_PREVIEW_STYLE}>
            {null}
          </PdxDiv>
        </PdxDiv>
      ),
      defaultProps: {
        patternId: 'holy-grail',
      },
    },
    {
      id: 'layout-pattern-dashboard-shell',
      name: 'Dashboard Shell',
      preview: (
        <PdxDiv display="Flex" flexDirection="Column" gap="6px" padding="6px">
          <PdxDiv height="12px" style={PATTERN_PREVIEW_STYLE}>
            {null}
          </PdxDiv>
          <PdxDiv
            display="Grid"
            gap="6px"
            style={{ gridTemplateColumns: '1fr 1fr 1fr' }}
          >
            <PdxDiv height="16px" style={PATTERN_PREVIEW_STYLE}>
              {null}
            </PdxDiv>
            <PdxDiv height="16px" style={PATTERN_PREVIEW_STYLE}>
              {null}
            </PdxDiv>
            <PdxDiv height="16px" style={PATTERN_PREVIEW_STYLE}>
              {null}
            </PdxDiv>
          </PdxDiv>
          <PdxDiv height="10px" style={PATTERN_PREVIEW_STYLE}>
            {null}
          </PdxDiv>
        </PdxDiv>
      ),
      defaultProps: {
        patternId: 'dashboard-shell',
      },
    },
  ],
};
