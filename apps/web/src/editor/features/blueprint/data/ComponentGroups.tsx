import type { ComponentGroup } from '@/editor/features/blueprint/editor/model/types';
import { BASE_GROUP } from './groups/BaseGroup';
import { LAYOUT_GROUP } from './groups/LayoutGroup';
import { LAYOUT_PATTERN_GROUP } from './groups/LayoutPatternGroup';
import { FORM_GROUP } from './groups/FormGroup';
import { NAV_GROUP } from './groups/NavGroup';
import { MEDIA_GROUP } from './groups/MediaGroup';
import { DATA_GROUP } from './groups/DataGroup';
import { FEEDBACK_GROUP } from './groups/FeedbackGroup';
import { HEADLESS_GROUP } from './groups/HeadlessGroup';

export const COMPONENT_GROUPS: ComponentGroup[] = [
  { ...BASE_GROUP, source: 'builtIn' },
  { ...LAYOUT_PATTERN_GROUP, source: 'builtIn' },
  { ...LAYOUT_GROUP, source: 'builtIn' },
  { ...FORM_GROUP, source: 'builtIn' },
  { ...NAV_GROUP, source: 'builtIn' },
  { ...MEDIA_GROUP, source: 'builtIn' },
  { ...DATA_GROUP, source: 'builtIn' },
  { ...FEEDBACK_GROUP, source: 'builtIn' },
  { ...HEADLESS_GROUP, source: 'headless' },
];
