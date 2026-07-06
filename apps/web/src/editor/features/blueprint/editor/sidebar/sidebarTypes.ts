import type { KeyboardEvent } from 'react';
import type {
  ExternalLibraryDiagnostic,
  ExternalLibraryRuntimeState,
} from '@/editor/features/blueprint/external';

export type BlueprintEditorSidebarProps = {
  isCollapsed: boolean;
  isTreeCollapsed?: boolean;
  collapsedGroups: Record<string, boolean>;
  expandedPreviews: Record<string, boolean>;
  sizeSelections: Record<string, string>;
  statusSelections: Record<string, number>;
  externalDiagnostics: ExternalLibraryDiagnostic[];
  externalLibraryStates?: ExternalLibraryRuntimeState[];
  externalLibraryOptions?: Array<{ id: string; label: string }>;
  isExternalLibraryLoading: boolean;
  onReloadExternalLibraries?: () => Promise<void> | void;
  onRetryExternalLibrary?: (libraryId: string) => Promise<void> | void;
  onToggleCollapse: () => void;
  onToggleGroup: (groupId: string, collapsed: boolean) => void;
  onTogglePreview: (previewId: string) => void;
  onPreviewKeyDown: (
    event: KeyboardEvent<HTMLDivElement>,
    previewId: string,
    hasVariants: boolean
  ) => void;
  onAddComponent: (itemId: string) => void;
  onSizeSelect: (itemId: string, sizeId: string) => void;
  onStatusSelect: (itemId: string, index: number) => void;
  onStatusCycleStart: (itemId: string, total: number) => void;
  onStatusCycleStop: (itemId: string) => void;
};

export type LibraryTab =
  | {
      id: string;
      label: string;
      source: 'builtIn' | 'headless';
      libraryId?: undefined;
    }
  | {
      id: string;
      label: string;
      source: 'external';
      libraryId: string;
    };
