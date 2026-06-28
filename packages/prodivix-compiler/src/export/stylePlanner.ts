import { dedupeExportImportIntents } from '#src/export/importPlanner';
import { getRelativeImportPath, joinExportPath } from '#src/export/pathPlanner';
import type {
  ExportImportIntent,
  ExportPlannerPreset,
  ExportStyleContribution,
  PlannedExportModule,
  PlannedStyleSheet,
  ReserveExportPath,
} from '#src/export/types';

const toSafeName = (name: string) => {
  const safe = name.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  return safe || 'style';
};

const stripCssComments = (cssText: string) =>
  cssText.replace(/\/\*[\s\S]*?\*\//g, '').trim();

const isEffectiveCss = (cssText: string) =>
  stripCssComments(cssText).length > 0;

const getStyleGroupKey = (style: ExportStyleContribution) =>
  [style.scope, style.ownerRootId ?? style.suggestedName ?? 'global'].join(':');

const getStyleOrderIndex = (style: ExportStyleContribution) =>
  style.orderHint?.index ?? Number.MAX_SAFE_INTEGER;

const sortStyles = (
  left: ExportStyleContribution,
  right: ExportStyleContribution
) => {
  const scopeRank: Record<ExportStyleContribution['scope'], number> = {
    global: 0,
    layout: 1,
    route: 2,
    component: 3,
  };
  return (
    scopeRank[left.scope] - scopeRank[right.scope] ||
    getStyleOrderIndex(left) - getStyleOrderIndex(right) ||
    left.id.localeCompare(right.id)
  );
};

const getStyleDesiredPath = (
  style: ExportStyleContribution,
  modulesByOwnerRootId: Map<string, PlannedExportModule>,
  preset: ExportPlannerPreset
) => {
  if (style.scope === 'global') {
    return joinExportPath(preset.sourceRoot, 'styles', 'global.css');
  }

  const ownerModule = style.ownerRootId
    ? modulesByOwnerRootId.get(style.ownerRootId)
    : undefined;
  if (ownerModule) {
    return ownerModule.filePath.replace(/\.[^.]+$/, '.css');
  }

  const owner = toSafeName(style.ownerRootId ?? style.suggestedName ?? 'style');
  if (!preset.sourceRoot && style.scope === 'component') {
    return `${owner}.css`;
  }
  if (style.scope === 'route') {
    return joinExportPath(preset.sourceRoot, 'routes', owner, `${owner}.css`);
  }
  if (style.scope === 'layout') {
    return joinExportPath(preset.sourceRoot, 'layouts', owner, `${owner}.css`);
  }
  return joinExportPath(preset.sourceRoot, 'components', owner, `${owner}.css`);
};

export const planExportStyleSheets = (
  styles: ExportStyleContribution[],
  modules: PlannedExportModule[],
  preset: ExportPlannerPreset,
  reservePath: ReserveExportPath
): PlannedStyleSheet[] => {
  const modulesByOwnerRootId = new Map<string, PlannedExportModule>();
  modules.forEach((module) => {
    if (module.ownerRootId && !modulesByOwnerRootId.has(module.ownerRootId)) {
      modulesByOwnerRootId.set(module.ownerRootId, module);
    }
  });

  const grouped = new Map<string, ExportStyleContribution[]>();
  styles
    .filter((style) => isEffectiveCss(style.cssText))
    .sort(sortStyles)
    .forEach((style) => {
      const key = getStyleGroupKey(style);
      grouped.set(key, [...(grouped.get(key) ?? []), style]);
    });

  return Array.from(grouped.values()).map((items) => {
    const first = items[0];
    const desiredPath = getStyleDesiredPath(
      first,
      modulesByOwnerRootId,
      preset
    );
    return {
      id: first.id,
      path: reservePath(desiredPath, {
        id: first.id,
        kind: 'style',
      }),
      ownerRootId: first.ownerRootId,
      cssText: `${items.map((item) => item.cssText.trim()).join('\n\n')}\n`,
      sourceTrace: items.flatMap((item) => item.sourceTrace),
      origin: first.origin,
    };
  });
};

export const createStyleImportIntents = (
  module: PlannedExportModule,
  styleSheets: PlannedStyleSheet[],
  firstModuleId?: string
): ExportImportIntent[] =>
  dedupeExportImportIntents(
    styleSheets
      .filter(
        (styleSheet) =>
          styleSheet.ownerRootId === module.ownerRootId ||
          (!styleSheet.ownerRootId && module.id === firstModuleId)
      )
      .map((styleSheet) => ({
        kind: 'side-effect' as const,
        source: getRelativeImportPath(module.filePath, styleSheet.path, {
          keepExtension: true,
        }),
      }))
  );
