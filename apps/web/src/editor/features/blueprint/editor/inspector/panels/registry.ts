import type { InspectorPanelDefinition } from './types';
import type { BlueprintInspectorNodeView } from '../projection';
import type { InspectorTab } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import { classNamePanel } from './ClassNamePanel';
import { layoutPanel } from './LayoutPanel';
import { layoutPatternPanel } from './LayoutPatternPanel';
import { animationPanel } from './AnimationPanel';
import { typographyPanel } from './TypographyPanel';
import { backgroundPanel } from './BackgroundPanel';
import { borderPanel } from './BorderPanel';
import { triggersPanel } from './TriggersPanel';
import { externalCodePanel } from './ExternalCodePanel';

export const INSPECTOR_PANELS: InspectorPanelDefinition[] = [
  classNamePanel,
  layoutPatternPanel,
  layoutPanel,
  typographyPanel,
  backgroundPanel,
  borderPanel,
  animationPanel,
  triggersPanel,
  externalCodePanel,
];

export const resolveInspectorPanels = (
  node: BlueprintInspectorNodeView,
  tab: InspectorTab
): InspectorPanelDefinition[] =>
  INSPECTOR_PANELS.filter(
    (panel) => panel.match(node) && (panel.tab ?? 'style') === tab
  );
