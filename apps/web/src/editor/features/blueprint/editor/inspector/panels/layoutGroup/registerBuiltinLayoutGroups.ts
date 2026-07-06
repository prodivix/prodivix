import { registerLayoutGroup } from './layoutGroupRegistry';
import { spacingGroup } from './groups/SpacingGroup';
import { sizeGroup } from './groups/SizeGroup';
import { flexGroup } from './groups/FlexGroup';
import { gridGroup } from './groups/GridGroup';

export const registerBuiltinLayoutGroups = () => {
  registerLayoutGroup(spacingGroup);
  registerLayoutGroup(sizeGroup);
  registerLayoutGroup(flexGroup);
  registerLayoutGroup(gridGroup);
};

registerBuiltinLayoutGroups();
