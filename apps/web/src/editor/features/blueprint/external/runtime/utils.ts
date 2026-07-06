export const toPascalCase = (value: string) =>
  value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => `${segment[0]?.toUpperCase()}${segment.slice(1)}`)
    .join('');

export const toKebabCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

export const getValueByPath = (module: unknown, path: string): unknown => {
  const segments = path.split('.');
  let cursor = module;
  for (const segment of segments) {
    if (!cursor || (typeof cursor !== 'object' && typeof cursor !== 'function'))
      return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
};

export const isRenderableComponent = (value: unknown) =>
  Boolean(value) && (typeof value === 'function' || typeof value === 'object');
