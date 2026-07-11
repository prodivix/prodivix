import type { PaletteContributionV1 } from '@prodivix/plugin-contracts';
import type { OfficialPaletteRuntimeProjection } from '@prodivix/plugin-react-host';
import type { ComponentGroup } from '@/editor/features/blueprint/editor/model/types';

export type ResolvedPaletteContribution = Readonly<{
  descriptor: PaletteContributionV1;
  groups: readonly ComponentGroup[];
  creationMode: 'native' | 'contract';
}>;

export type PaletteRuntimeProjection = OfficialPaletteRuntimeProjection;
