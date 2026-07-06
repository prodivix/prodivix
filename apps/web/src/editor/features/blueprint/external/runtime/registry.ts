import {
  registerRuntimeComponent,
  unregisterRuntimeComponent,
} from '@/pir/renderer/registry';
import {
  registerComponentGroup,
  unregisterComponentGroup,
} from '@/editor/features/blueprint/registry';
import {
  resetExternalRuntimeMetaStore,
  setExternalRuntimeMeta,
} from './metaStore';
import type {
  ComponentGroup,
  ComponentPreviewItem,
} from '@/editor/features/blueprint/editor/model/types';
import type {
  CanonicalExternalComponent,
  ExternalCanonicalGroup,
  ExternalLibraryDiagnostic,
} from './types';

const runtimeTypesByLibraryId = new Map<string, Set<string>>();
const groupIdsByLibraryId = new Map<string, Set<string>>();

const addRuntimeType = (libraryId: string, runtimeType: string) => {
  const current = runtimeTypesByLibraryId.get(libraryId) ?? new Set<string>();
  current.add(runtimeType);
  runtimeTypesByLibraryId.set(libraryId, current);
};

const addGroupId = (libraryId: string, groupId: string) => {
  const current = groupIdsByLibraryId.get(libraryId) ?? new Set<string>();
  current.add(groupId);
  groupIdsByLibraryId.set(libraryId, current);
};

export const clearRegisteredExternalLibraries = () => {
  runtimeTypesByLibraryId.forEach((runtimeTypes) => {
    runtimeTypes.forEach((runtimeType) => {
      unregisterRuntimeComponent(runtimeType);
    });
  });
  groupIdsByLibraryId.forEach((groupIds) => {
    groupIds.forEach((groupId) => {
      unregisterComponentGroup(groupId);
    });
  });
  runtimeTypesByLibraryId.clear();
  groupIdsByLibraryId.clear();
  resetExternalRuntimeMetaStore();
};

const EXTERNAL_PROP_KEYS = [
  'category',
  'type',
  'variant',
  'color',
  'severity',
  'status',
] as const;

const toStatusId = (value: string) => value.toLowerCase().replace(/\s+/g, '-');

const inferExternalStatus = (item: CanonicalExternalComponent) => {
  const defaultProps = item.defaultProps ?? {};
  for (const prop of EXTERNAL_PROP_KEYS) {
    const current = defaultProps[prop];
    if (typeof current !== 'string') continue;
    const options = item.propOptions?.[prop] ?? [current];
    const normalizedOptions = [
      ...new Set(options.map((option) => String(option))),
    ];
    if (normalizedOptions.length <= 1) continue;
    return {
      statusProp: prop,
      statusLabel: prop,
      defaultStatus: current,
      statusOptions: normalizedOptions.map((option) => ({
        id: toStatusId(option),
        label: option,
        value: option,
      })),
    };
  }
  return undefined;
};

const inferExternalSizeOptions = (item: CanonicalExternalComponent) => {
  if (item.sizeOptions?.length) return item.sizeOptions;
  if (item.propOptions?.size && item.propOptions.size.length > 1) {
    return item.propOptions.size.map((value) => ({
      id: toStatusId(value),
      label: value[0]?.toUpperCase() ?? value,
      value,
    }));
  }
  return undefined;
};

const toPreviewItem = (
  item: CanonicalExternalComponent
): ComponentPreviewItem => {
  const inferredStatus = inferExternalStatus(item);
  return {
    id: item.itemId,
    name: item.componentName,
    libraryId: item.libraryId,
    preview: item.preview,
    renderPreview: item.renderPreview,
    sizeOptions: inferExternalSizeOptions(item),
    runtimeType: item.runtimeType,
    defaultProps: item.defaultProps,
    propOptions: item.propOptions,
    variants: inferredStatus
      ? inferredStatus.statusOptions.map((option) => ({
          id: option.id,
          label: option.label,
          element:
            item.renderPreview?.({ status: option.value }) ?? item.preview,
          renderElement: ({ size }) =>
            item.renderPreview?.({ size, status: option.value }) ??
            item.preview,
          props: { [inferredStatus.statusProp]: option.value },
        }))
      : undefined,
  };
};

export const registerExternalRuntimeComponents = (
  components: CanonicalExternalComponent[],
  diagnostics: ExternalLibraryDiagnostic[]
) => {
  let registeredCount = 0;
  const seenTypes = new Set<string>();
  components.forEach((component) => {
    if (seenTypes.has(component.runtimeType)) {
      diagnostics.push({
        code: 'ELIB-3002',
        level: 'warning',
        stage: 'register',
        libraryId: component.libraryId,
        message: `Duplicated runtime type "${component.runtimeType}" detected during registration.`,
        hint: 'Later duplicate entries are ignored to keep runtime registry deterministic.',
        retryable: false,
      });
      return;
    }
    seenTypes.add(component.runtimeType);
    setExternalRuntimeMeta(component.runtimeType, {
      libraryId: component.libraryId,
      runtimeType: component.runtimeType,
      defaultProps: component.defaultProps,
      propOptions: component.propOptions,
    });
    registerRuntimeComponent(
      component.runtimeType,
      component.component,
      component.adapter
    );
    addRuntimeType(component.libraryId, component.runtimeType);
    registeredCount += 1;
  });

  if (registeredCount === 0) {
    diagnostics.push({
      code: 'ELIB-3001',
      level: 'error',
      stage: 'register',
      libraryId: components[0]?.libraryId,
      message: 'No runtime-renderable components found after scan.',
      hint: 'Check export scanner rules or verify remote module exports.',
      retryable: true,
    });
  }
};

export const registerExternalGroups = (groups: ExternalCanonicalGroup[]) => {
  groups.forEach((group) => {
    const nextGroup: ComponentGroup = {
      id: group.id,
      title: group.title,
      source: 'external',
      items: group.items.map(toPreviewItem),
    };
    registerComponentGroup(nextGroup);
    const libraryId = group.items[0]?.libraryId;
    if (libraryId) addGroupId(libraryId, group.id);
  });
};
