import { getValueByPath, isRenderableComponent } from './utils';

type ScanExternalModuleOptions = {
  includePaths?: string[];
  excludeExports?: Set<string>;
  discoverExports?: boolean;
};

const isLikelyTopLevelComponent = (
  name: string,
  value: unknown,
  excludeExports: Set<string>
) => {
  if (excludeExports.has(name)) return false;
  if (!/^[A-Z]/.test(name)) return false;
  return isRenderableComponent(value);
};

export const scanExternalModulePaths = (
  module: Record<string, unknown>,
  options: ScanExternalModuleOptions = {}
) => {
  const includePaths = (options.includePaths ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
  const excludeExports = options.excludeExports ?? new Set<string>();
  const discoverExports = options.discoverExports ?? true;
  const discovered = new Set<string>(includePaths);

  if (!discoverExports) {
    return [...discovered].filter((path) =>
      isRenderableComponent(getValueByPath(module, path))
    );
  }

  Object.entries(module).forEach(([name, value]) => {
    if (!isLikelyTopLevelComponent(name, value, excludeExports)) return;
    discovered.add(name);

    if (!value || (typeof value !== 'object' && typeof value !== 'function')) {
      return;
    }

    Object.getOwnPropertyNames(value).forEach((subName) => {
      if (!/^[A-Z]/.test(subName) || excludeExports.has(subName)) return;
      const subValue = (value as Record<string, unknown>)[subName];
      if (!isRenderableComponent(subValue)) return;
      discovered.add(`${name}.${subName}`);
    });
  });

  return [...discovered].filter((path) =>
    isRenderableComponent(getValueByPath(module, path))
  );
};
