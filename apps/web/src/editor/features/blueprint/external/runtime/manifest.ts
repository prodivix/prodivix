import type {
  CanonicalExternalComponent,
  ExternalCanonicalGroup,
  ExternalLibraryManifest,
} from './types';

const withComponentOverrides = (
  item: CanonicalExternalComponent,
  manifest?: ExternalLibraryManifest
): CanonicalExternalComponent => {
  const override = manifest?.componentOverrides?.[item.path];
  if (!override) return item;

  return {
    ...item,
    componentName: override.displayName ?? item.componentName,
    defaultProps: {
      ...(item.defaultProps ?? {}),
      ...(override.defaultProps ?? {}),
    },
    sizeOptions: override.sizeOptions ?? item.sizeOptions,
    propOptions: {
      ...(item.propOptions ?? {}),
      ...(override.propOptions ?? {}),
    },
    behaviorTags: override.behaviorTags ?? item.behaviorTags,
    codegenHints: {
      ...(item.codegenHints ?? {}),
      ...(override.codegenHints ?? {}),
    },
  };
};

export const applyManifestToCanonicalComponents = (
  components: CanonicalExternalComponent[],
  manifest?: ExternalLibraryManifest
) => components.map((item) => withComponentOverrides(item, manifest));

export const applyManifestToGroups = (
  components: CanonicalExternalComponent[],
  groups: ExternalCanonicalGroup[],
  manifest?: ExternalLibraryManifest
): ExternalCanonicalGroup[] => {
  if (!manifest) return groups;

  const existingGroupByPath = new Map<string, string>();
  const existingTitles = new Map<string, string>();
  groups.forEach((group) => {
    existingTitles.set(group.id, group.title);
    group.items.forEach((item) => existingGroupByPath.set(item.path, group.id));
  });

  const overriddenGroupByPath = new Map<string, string>();
  const overriddenTitles = new Map<string, string>();
  Object.entries(manifest.componentOverrides ?? {}).forEach(
    ([path, override]) => {
      if (!override.groupId) return;
      overriddenGroupByPath.set(path, override.groupId);
      if (override.groupTitle) {
        overriddenTitles.set(override.groupId, override.groupTitle);
      }
    }
  );

  const grouped = new Map<string, ExternalCanonicalGroup>();
  components.forEach((item) => {
    const groupId =
      overriddenGroupByPath.get(item.path) ??
      existingGroupByPath.get(item.path) ??
      `${item.libraryId}-other`;
    const overrideTitle = manifest.groupOverrides?.[groupId]?.title;
    const title =
      overrideTitle ??
      overriddenTitles.get(groupId) ??
      existingTitles.get(groupId) ??
      groupId;
    const current =
      grouped.get(groupId) ??
      ({
        id: groupId,
        title,
        source: 'external',
        items: [],
      } satisfies ExternalCanonicalGroup);
    current.items.push(item);
    grouped.set(groupId, current);
  });

  const order = [
    ...groups.map((group) => group.id),
    ...[...grouped.keys()].filter((id) => !existingTitles.has(id)),
  ];
  return order
    .map((id) => grouped.get(id))
    .filter((group): group is ExternalCanonicalGroup => Boolean(group));
};
