import type { KeyboardEvent } from 'react';
import type { PluginDiagnostic } from '@prodivix/plugin-contracts';
import type { PaletteItemSelection } from '@/editor/features/blueprint/editor/model/paletteCreation';

export type BlueprintEditorSidebarProps = {
  isCollapsed: boolean;
  isTreeCollapsed?: boolean;
  collapsedGroups: Record<string, boolean>;
  expandedPreviews: Record<string, boolean>;
  sizeSelections: Record<string, string>;
  statusSelections: Record<string, number>;
  officialPluginDiagnostics: readonly PluginDiagnostic[];
  officialLibraryOptions?: Array<{ id: string; label: string }>;
  isOfficialPluginLoading: boolean;
  onReloadOfficialPlugins?: () => Promise<void> | void;
  onToggleCollapse: () => void;
  onToggleGroup: (groupId: string, collapsed: boolean) => void;
  onTogglePreview: (previewId: string) => void;
  onPreviewKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
    previewId: string,
    hasVariants: boolean
  ) => void;
  onAddComponent: (itemId: string, selection?: PaletteItemSelection) => void;
  onSizeSelect: (itemId: string, sizeId: string) => void;
  onStatusSelect: (itemId: string, index: number) => void;
  onStatusCycleStart: (itemId: string, total: number) => void;
  onStatusCycleStop: (itemId: string) => void;
};

export type LibraryTab =
  | {
      id: string;
      label: string;
      source: 'builtIn';
      libraryId?: undefined;
    }
  | {
      id: string;
      label: string;
      source: 'external';
      libraryId: string;
    };
