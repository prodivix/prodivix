import type { LayoutPatternDefinition } from '@/editor/features/blueprint/layoutPatterns/layoutPattern.types';
import { DASHBOARD_SHELL_LAYOUT_PATTERN } from './dashboardShell';
import { HOLY_GRAIL_LAYOUT_PATTERN } from './holyGrail';
import { SPLIT_LAYOUT_PATTERN } from './split';

export const LAYOUT_PATTERN_PRESETS: LayoutPatternDefinition[] = [
  SPLIT_LAYOUT_PATTERN,
  HOLY_GRAIL_LAYOUT_PATTERN,
  DASHBOARD_SHELL_LAYOUT_PATTERN,
];

export {
  SPLIT_LAYOUT_PATTERN,
  HOLY_GRAIL_LAYOUT_PATTERN,
  DASHBOARD_SHELL_LAYOUT_PATTERN,
};
