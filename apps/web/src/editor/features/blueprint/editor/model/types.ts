import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type RouteItem = {
  id: string;
  path: string;
  depth?: number;
  label?: string;
  parentId?: string;
  index?: boolean;
  hasPage?: boolean;
  hasLayout?: boolean;
  hasOutlet?: boolean;
  childCount?: number;
};

export type ComponentPreviewVariant = {
  id: string;
  label: string;
  element: ReactNode;
  scale?: number;
  renderElement?: (options: { size?: string }) => ReactNode;
  props?: Record<string, unknown>;
};

export type ComponentPreviewOption = {
  id: string;
  label: string;
  value: string;
};

export type ComponentPreviewStatus = ComponentPreviewOption & {
  icon?: ReactNode;
};

export type ComponentPreviewItem = {
  id: string;
  name: string;
  libraryId?: string;
  preview: ReactNode;
  runtimeType?: string;
  defaultProps?: Record<string, unknown>;
  propOptions?: Record<string, string[]>;
  scale?: number;
  variants?: readonly ComponentPreviewVariant[];
  sizeOptions?: readonly ComponentPreviewOption[];
  statusOptions?: readonly ComponentPreviewStatus[];
  statusProp?: string;
  statusLabel?: string;
  renderPreview?: (options: { size?: string; status?: string }) => ReactNode;
  defaultStatus?: string;
};

export type ComponentGroup = {
  id: string;
  title: string;
  source?: 'builtIn' | 'external';
  items: readonly ComponentPreviewItem[];
};

export type ViewportPreset = {
  id: string;
  nameKey: string;
  kind: 'Phone' | 'Tablet' | 'Laptop' | 'Desktop' | 'Watch';
  kindKey: string;
  width: string;
  height: string;
  icon: LucideIcon;
};

export type QuickViewportPreset = {
  id: string;
  labelKey: string;
  width: string;
  height: string;
};

export type DropPosition = 'before' | 'after' | 'inside';

export type DropIndicator = {
  targetId: string;
  position: DropPosition;
};
