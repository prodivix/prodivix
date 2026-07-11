import type { InspectorComponentMeta } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import type {
  PaletteRegistrySnapshot,
  WebExtensionRegistrySnapshot,
} from '@/plugins/platform';

/**
 * Projects Host-owned component contracts into the Inspector without making
 * the editor scan plugin packages or infer metadata from rendered elements.
 */
export const resolveInspectorComponentMeta = (
  runtimeType: string | undefined,
  palette: PaletteRegistrySnapshot,
  extensions: WebExtensionRegistrySnapshot
): InspectorComponentMeta | null => {
  if (!runtimeType) return null;
  const paletteItem = palette.itemsByRuntimeType.get(runtimeType);
  const externalComponent =
    extensions.externalComponentsByRuntimeType.get(runtimeType);
  const resolvedRuntimeType =
    externalComponent?.runtimeType ?? paletteItem?.runtimeType;
  if (!resolvedRuntimeType) return null;

  return {
    source:
      externalComponent || paletteItem?.libraryId ? 'external' : 'builtIn',
    libraryId: externalComponent?.libraryId ?? paletteItem?.libraryId,
    runtimeType: resolvedRuntimeType,
    defaultProps: paletteItem?.defaultProps,
    propOptions: paletteItem?.propOptions,
    propDefinitions: externalComponent?.props,
  };
};
