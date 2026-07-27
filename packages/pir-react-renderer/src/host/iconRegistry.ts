import { createElement, useEffect, useSyncExternalStore } from 'react';
import type React from 'react';
import * as LucideIcons from 'lucide-react';
import dynamicIconImports from 'lucide-react/dynamicIconImports';

export type IconRef = {
  provider: string;
  name: string;
  variant?: string;
};

/**
 * Polymorphic icon component type. Icon libraries expose components with their
 * own prop shapes; the renderer passes through className / size / style without
 * committing to one library's typing. Consumers that need a stricter shape cast
 * at the boundary.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
export type IconComponent = React.ComponentType<any>;

type IconResolver = (name: string, iconRef?: IconRef) => IconComponent | null;
type IconNameProvider = () => string[];

export type IconProviderRegistration = {
  label?: string;
  resolve: IconResolver;
  listIcons?: IconNameProvider;
  ensureReady?: () => Promise<void>;
  configurable?: boolean;
};

export type IconProviderMeta = {
  id: string;
  label: string;
};

export type IconLibraryMeta = {
  id: string;
  label: string;
};

type IconProviderRecord = {
  id: string;
  label: string;
  resolve: IconResolver;
  listIcons: IconNameProvider;
  ensureReady?: () => Promise<void>;
  configurable: boolean;
  visible: boolean;
  status: IconProviderStatus;
  loadPromise: Promise<void> | null;
  error: string | null;
};

const DEFAULT_ICON_LIBRARY_IDS: string[] = [];

const iconProviders = new Map<string, IconProviderRecord>();
const iconFallbackComponentCache = new Map<string, IconComponent>();

const registryListeners = new Set<() => void>();
let registryRevision = 0;
let configuredIconLibraryIds = new Set<string>();
let iconLibraryConfigLoaded = false;

const normalizeProvider = (provider: string) => provider.trim().toLowerCase();
const normalizeKey = (value: string) => value.trim().toLowerCase();

const notifyRegistryChanged = () => {
  registryRevision += 1;
  registryListeners.forEach((listener) => listener());
};

export const subscribeIconRegistry = (listener: () => void) => {
  registryListeners.add(listener);
  return () => registryListeners.delete(listener);
};

export const getIconRegistryRevision = () => registryRevision;

const isIconComponent = (value: unknown): value is IconComponent =>
  typeof value === 'function' ||
  (typeof value === 'object' && value !== null && '$$typeof' in value);

export type IconProviderStatus = 'idle' | 'loading' | 'ready' | 'error';

export type IconProviderState = {
  status: IconProviderStatus;
  error: string | null;
};

const toKebabCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();

const toPascalCase = (value: string) =>
  value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join('');

const toLookupKeys = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const kebab = toKebabCase(trimmed);
  const keys = new Set<string>([
    normalizeKey(trimmed),
    normalizeKey(kebab),
    normalizeKey(toPascalCase(kebab)),
  ]);
  if (kebab.endsWith('-icon')) {
    const withoutSuffix = kebab.slice(0, -5);
    keys.add(normalizeKey(withoutSuffix));
    keys.add(normalizeKey(toPascalCase(withoutSuffix)));
  }
  if (trimmed.endsWith('Icon')) {
    const withoutSuffix = trimmed.slice(0, -4);
    keys.add(normalizeKey(withoutSuffix));
    keys.add(normalizeKey(toKebabCase(withoutSuffix)));
  }
  return [...keys];
};

const normalizeConfiguredIconLibraryIds = (libraryIds: string[]) =>
  [...new Set(libraryIds.map(normalizeProvider))].filter(
    (libraryId) => libraryId.length > 0
  );

const ensureIconLibraryConfigurationLoaded = () => {
  if (iconLibraryConfigLoaded) return;
  configuredIconLibraryIds = new Set(DEFAULT_ICON_LIBRARY_IDS);
  iconLibraryConfigLoaded = true;
};

const hasSameMembers = (left: Set<string>, right: Set<string>) => {
  if (left.size !== right.size) return false;
  for (const item of left) {
    if (!right.has(item)) return false;
  }
  return true;
};

const applyConfiguredIconLibraryIds = (libraryIds: string[]) => {
  ensureIconLibraryConfigurationLoaded();
  const nextIds = normalizeConfiguredIconLibraryIds(libraryIds);
  const nextSet = new Set(nextIds);
  const configChanged = !hasSameMembers(configuredIconLibraryIds, nextSet);
  configuredIconLibraryIds = nextSet;

  let visibilityChanged = false;
  iconProviders.forEach((provider) => {
    if (!provider.configurable) return;
    const nextVisible = configuredIconLibraryIds.has(provider.id);
    if (provider.visible !== nextVisible) {
      provider.visible = nextVisible;
      visibilityChanged = true;
    }
  });

  if (configChanged || visibilityChanged) {
    notifyRegistryChanged();
  }

  return nextIds;
};

export const setConfiguredIconLibraryIds = (libraryIds: string[]) => {
  return applyConfiguredIconLibraryIds(libraryIds);
};

/**
 * Returns libraries in registration order. Display ordering (locale-aware
 * label sorting) is owned by the presentation-layer callers.
 */
export const getRegisteredIconLibraries = (): IconLibraryMeta[] => {
  return [...iconProviders.values()]
    .filter((provider) => provider.configurable)
    .map((provider) => ({ id: provider.id, label: provider.label }));
};

export const isIconRef = (value: unknown): value is IconRef => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const variant = record.variant;
  const hasValidVariant = variant === undefined || typeof variant === 'string';
  return (
    typeof record.provider === 'string' &&
    record.provider.trim() !== '' &&
    typeof record.name === 'string' &&
    record.name.trim() !== '' &&
    hasValidVariant
  );
};

export const registerIconProvider = (
  provider: string,
  registration: IconResolver | IconProviderRegistration
) => {
  if (!provider.trim()) return;
  ensureIconLibraryConfigurationLoaded();
  const normalizedId = normalizeProvider(provider);
  const normalizedRegistration: IconProviderRegistration =
    typeof registration === 'function'
      ? { label: provider, resolve: registration, listIcons: () => [] }
      : registration;
  const configurable = Boolean(normalizedRegistration.configurable);
  const visible = configurable
    ? configuredIconLibraryIds.has(normalizedId)
    : true;

  iconProviders.set(normalizedId, {
    id: normalizedId,
    label: normalizedRegistration.label ?? provider,
    resolve: normalizedRegistration.resolve,
    listIcons: normalizedRegistration.listIcons ?? (() => []),
    ensureReady: normalizedRegistration.ensureReady,
    configurable,
    visible,
    status: normalizedRegistration.ensureReady ? 'idle' : 'ready',
    loadPromise: null,
    error: null,
  });
  notifyRegistryChanged();
};

export const unregisterIconProvider = (provider: string) => {
  const normalizedId = normalizeProvider(provider);
  if (!iconProviders.delete(normalizedId)) return;
  iconFallbackComponentCache.forEach((_component, key) => {
    if (key.startsWith(`${normalizedId}:`)) {
      iconFallbackComponentCache.delete(key);
    }
  });
  notifyRegistryChanged();
};

export const getIconProviderState = (providerId: string): IconProviderState => {
  const provider = iconProviders.get(normalizeProvider(providerId));
  if (!provider) {
    return { status: 'error', error: 'Provider not found.' };
  }
  return { status: provider.status, error: provider.error };
};

export const ensureIconProviderReady = async (providerId: string) => {
  const provider = iconProviders.get(normalizeProvider(providerId));
  if (!provider || !provider.ensureReady) return;
  if (provider.status === 'ready') return;
  if (provider.loadPromise) {
    await provider.loadPromise;
    return;
  }

  provider.status = 'loading';
  provider.error = null;
  notifyRegistryChanged();

  provider.loadPromise = provider
    .ensureReady()
    .then(() => {
      provider.status = 'ready';
      provider.error = null;
      provider.loadPromise = null;
      notifyRegistryChanged();
    })
    .catch((error: unknown) => {
      provider.status = 'error';
      provider.error = String(error);
      provider.loadPromise = null;
      notifyRegistryChanged();
      throw error;
    });

  await provider.loadPromise;
};

/**
 * 图标解析主链路：
 * Inspector/PIR 写入 `props.iconRef` -> registry 的 icon adapter -> resolveIconRef ->
 * 对应 provider 返回 React 组件 -> PIRRenderer 渲染。
 */
export const resolveIconRef = (value: unknown) => {
  if (!isIconRef(value)) return null;
  const provider = iconProviders.get(normalizeProvider(value.provider));
  if (!provider) return null;
  const resolved = provider.resolve(value.name, value);
  if (resolved) return resolved;
  if (
    !provider.ensureReady ||
    provider.status === 'ready' ||
    provider.status === 'error'
  ) {
    return null;
  }
  void ensureIconProviderReady(provider.id).catch(() => undefined);

  const cacheKey = `${provider.id}:${normalizeKey(value.name)}:${normalizeKey(value.variant ?? '')}`;
  const cached = iconFallbackComponentCache.get(cacheKey);
  if (cached) return cached;

  const DeferredIcon = (props: Record<string, unknown>) => {
    useSyncExternalStore(
      subscribeIconRegistry,
      getIconRegistryRevision,
      getIconRegistryRevision
    );

    useEffect(() => {
      void ensureIconProviderReady(provider.id).catch(() => undefined);
    }, [provider.id]);

    const nextProvider = iconProviders.get(provider.id);
    const nextResolved = nextProvider?.resolve(value.name, value) ?? null;
    if (!nextResolved) return null;
    return createElement(nextResolved, props);
  };

  DeferredIcon.displayName = `DeferredIcon(${provider.id}:${value.name})`;
  iconFallbackComponentCache.set(cacheKey, DeferredIcon);
  return DeferredIcon;
};

/**
 * Returns providers in registration order. Display ordering (locale-aware
 * label sorting) is owned by the presentation-layer callers.
 */
export const listIconProviders = (): IconProviderMeta[] => {
  return [...iconProviders.values()]
    .filter((provider) => provider.visible)
    .map((provider) => ({ id: provider.id, label: provider.label }));
};

export const listIconNamesByProvider = (providerId: string) => {
  const provider = iconProviders.get(normalizeProvider(providerId));
  if (!provider) return [];
  return provider.listIcons();
};

const resolveLucideIcon = (name: string) => {
  const candidates = [
    name,
    toPascalCase(name),
    toPascalCase(name.toLowerCase()),
  ];
  for (const candidate of candidates) {
    const icon = (LucideIcons as Record<string, unknown>)[candidate];
    if (isIconComponent(icon)) {
      return icon as IconComponent;
    }
  }
  return null;
};

const LUCIDE_ICON_NAMES = Object.keys(dynamicIconImports)
  .map(toPascalCase)
  .filter((name, index, names) => names.indexOf(name) === index)
  .filter((name) => Boolean(resolveLucideIcon(name)));

type IconComponentRuntime = {
  iconNames: string[];
  iconLookup: Map<string, IconComponent>;
};

type IconComponentRuntimeBuildOptions = {
  stripIconSuffix?: boolean;
};

const buildIconComponentRuntime = (
  iconModule: Record<string, unknown>,
  options: IconComponentRuntimeBuildOptions = {}
): IconComponentRuntime => {
  const iconLookup = new Map<string, IconComponent>();
  const iconNames = new Set<string>();

  Object.entries(iconModule).forEach(([exportName, exported]) => {
    if (exportName === 'default') return;
    if (!isIconComponent(exported)) return;

    const component = exported as IconComponent;
    const canonicalName =
      options.stripIconSuffix && exportName.endsWith('Icon')
        ? exportName.slice(0, -4)
        : exportName;
    if (!canonicalName.trim()) return;

    iconNames.add(canonicalName);
    const lookupKeys = new Set<string>([
      ...toLookupKeys(exportName),
      ...toLookupKeys(canonicalName),
    ]);
    lookupKeys.forEach((key) => iconLookup.set(key, component));
  });

  return {
    iconNames: [...iconNames],
    iconLookup,
  };
};

const resolveIconFromRuntime = (
  runtime: IconComponentRuntime | null,
  name: string
) => {
  if (!runtime) return null;
  for (const key of toLookupKeys(name)) {
    const icon = runtime.iconLookup.get(key);
    if (icon) return icon;
  }
  return null;
};

type FontAwesomeIconDefinition = {
  iconName: string;
  prefix: string;
};

type FontAwesomeRuntime = {
  FontAwesomeIcon: IconComponent;
  iconNames: string[];
  iconLookup: Map<string, FontAwesomeIconDefinition>;
};

let fontAwesomeRuntime: FontAwesomeRuntime | null = null;
const fontAwesomeComponentCache = new Map<string, IconComponent>();

const isFontAwesomeDefinition = (
  value: unknown
): value is FontAwesomeIconDefinition =>
  Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as FontAwesomeIconDefinition).iconName === 'string' &&
    typeof (value as FontAwesomeIconDefinition).prefix === 'string'
  );

const buildFontAwesomeLookupKeys = (value: string) => {
  const normalized = toKebabCase(value.trim());
  if (!normalized) return [];
  const keys = new Set<string>([
    normalized,
    normalizeKey(toPascalCase(normalized)),
    normalizeKey(value),
  ]);
  if (normalized.startsWith('fa-')) {
    keys.add(normalized.slice(3));
    keys.add(normalizeKey(toPascalCase(normalized.slice(3))));
  }
  return [...keys];
};

const createFontAwesomeIconComponent = (icon: FontAwesomeIconDefinition) => {
  const cacheKey = `${icon.prefix}:${icon.iconName}`;
  const cached = fontAwesomeComponentCache.get(cacheKey);
  if (cached) return cached;

  const FontAwesomeIconComponent = ({
    size,
    color,
    style,
    ...props
  }: Record<string, unknown>) => {
    if (!fontAwesomeRuntime) return null;
    const { FontAwesomeIcon } = fontAwesomeRuntime;
    const iconStyle = {
      ...(typeof style === 'object' && style ? style : {}),
      ...(size !== undefined
        ? { fontSize: typeof size === 'number' ? `${size}px` : size }
        : {}),
    };
    return createElement(FontAwesomeIcon, {
      ...props,
      icon,
      color: typeof color === 'string' ? color : undefined,
      style: iconStyle,
    });
  };

  FontAwesomeIconComponent.displayName = `FontAwesome(${icon.iconName})`;
  fontAwesomeComponentCache.set(cacheKey, FontAwesomeIconComponent);
  return FontAwesomeIconComponent;
};

const buildFontAwesomeRuntime = (
  fontAwesomeIcon: IconComponent,
  iconModule: Record<string, unknown>
): FontAwesomeRuntime => {
  const iconLookup = new Map<string, FontAwesomeIconDefinition>();
  const iconNames = new Set<string>();

  Object.entries(iconModule).forEach(([exportName, exported]) => {
    if (!isFontAwesomeDefinition(exported)) return;
    const canonicalName = toPascalCase(exported.iconName);
    iconNames.add(canonicalName);

    const lookupKeys = new Set<string>([
      ...buildFontAwesomeLookupKeys(exportName),
      ...buildFontAwesomeLookupKeys(exported.iconName),
      ...buildFontAwesomeLookupKeys(canonicalName),
    ]);
    lookupKeys.forEach((key) => iconLookup.set(key, exported));
  });

  return {
    FontAwesomeIcon: fontAwesomeIcon,
    iconNames: [...iconNames],
    iconLookup,
  };
};

/**
 * Font Awesome ships as a workspace dependency and is only split out of the
 * initial chunk, so `ensureReady` resolves a same-origin lazy chunk instead of a
 * third-party module. Keeping it async preserves the picker's idle/loading/ready
 * lifecycle without pulling the full solid icon set into the editor entry.
 */
const ensureFontAwesomeReady = async () => {
  if (fontAwesomeRuntime) return;
  const [{ FontAwesomeIcon }, solidIcons] = await Promise.all([
    import('@fortawesome/react-fontawesome'),
    import('@fortawesome/free-solid-svg-icons'),
  ]);
  fontAwesomeRuntime = buildFontAwesomeRuntime(FontAwesomeIcon, {
    ...solidIcons,
  });
};

const resolveFontAwesomeIcon = (name: string) => {
  if (!fontAwesomeRuntime) return null;
  const resolved = buildFontAwesomeLookupKeys(name)
    .map((key) => fontAwesomeRuntime?.iconLookup.get(key) ?? null)
    .find((item): item is FontAwesomeIconDefinition => Boolean(item));
  if (!resolved) return null;
  return createFontAwesomeIconComponent(resolved);
};

const listFontAwesomeIconNames = () => fontAwesomeRuntime?.iconNames ?? [];

type HeroiconsIconVariant = 'outline' | 'solid';

let heroiconsOutlineRuntime: IconComponentRuntime | null = null;
let heroiconsSolidRuntime: IconComponentRuntime | null = null;

const resolveHeroiconsVariant = (value: unknown): HeroiconsIconVariant =>
  value === 'solid' ? 'solid' : 'outline';

const ensureHeroiconsReady = async () => {
  if (heroiconsOutlineRuntime && heroiconsSolidRuntime) return;
  const [outlineIcons, solidIcons] = await Promise.all([
    import('@heroicons/react/24/outline'),
    import('@heroicons/react/24/solid'),
  ]);
  heroiconsOutlineRuntime = buildIconComponentRuntime(
    { ...outlineIcons },
    { stripIconSuffix: true }
  );
  heroiconsSolidRuntime = buildIconComponentRuntime(
    { ...solidIcons },
    { stripIconSuffix: true }
  );
};

const resolveHeroiconsIcon = (name: string, iconRef?: IconRef) => {
  const variant = resolveHeroiconsVariant(iconRef?.variant);
  if (variant === 'solid') {
    return (
      resolveIconFromRuntime(heroiconsSolidRuntime, name) ??
      resolveIconFromRuntime(heroiconsOutlineRuntime, name)
    );
  }
  return (
    resolveIconFromRuntime(heroiconsOutlineRuntime, name) ??
    resolveIconFromRuntime(heroiconsSolidRuntime, name)
  );
};

const listHeroiconsIconNames = () =>
  heroiconsOutlineRuntime?.iconNames ?? heroiconsSolidRuntime?.iconNames ?? [];

registerIconProvider('lucide', {
  label: 'Lucide',
  resolve: resolveLucideIcon,
  listIcons: () => LUCIDE_ICON_NAMES,
});

registerIconProvider('fontawesome', {
  label: 'Font Awesome',
  resolve: resolveFontAwesomeIcon,
  listIcons: listFontAwesomeIconNames,
  ensureReady: ensureFontAwesomeReady,
  configurable: true,
});

registerIconProvider('heroicons', {
  label: 'Heroicons',
  resolve: resolveHeroiconsIcon,
  listIcons: listHeroiconsIconNames,
  ensureReady: ensureHeroiconsReady,
  configurable: true,
});
