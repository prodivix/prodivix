import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const workspaceRoot = process.cwd();
const configPath = path.join(
  workspaceRoot,
  'apps',
  'web',
  'tailwind.config.ts'
);
const outputPath = path.join(
  workspaceRoot,
  'apps',
  'web',
  'src',
  'editor',
  'features',
  'design',
  'inspector',
  'components',
  'classProtocol',
  'tailwind.runtime.snapshot.json'
);

const toObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : {};

const collectSection = (theme, key) => {
  const base = toObject(theme?.[key]);
  const extended = toObject(theme?.extend?.[key]);
  return { ...base, ...extended };
};

const collectTokenKeys = (value, prefix = '', result = new Set()) => {
  if (typeof value !== 'object' || value === null) return result;
  Object.entries(value).forEach(([key, nested]) => {
    const current =
      key === 'DEFAULT' ? prefix : prefix ? `${prefix}-${key}` : key;
    if (
      typeof nested === 'object' &&
      nested !== null &&
      !Array.isArray(nested)
    ) {
      collectTokenKeys(nested, current, result);
      if ('DEFAULT' in nested && current) result.add(current);
      return;
    }
    if (current) result.add(current);
  });
  return result;
};

const addSpacingUtilities = (classes, token) => {
  const prefixes = [
    'p',
    'px',
    'py',
    'pt',
    'pr',
    'pb',
    'pl',
    'm',
    'mx',
    'my',
    'mt',
    'mr',
    'mb',
    'ml',
    'gap',
    'space-x',
    'space-y',
    'w',
    'h',
    'min-w',
    'min-h',
    'max-w',
    'max-h',
  ];
  prefixes.forEach((prefix) => classes.add(`${prefix}-${token}`));
};

const addRadiusUtilities = (classes, token) => {
  classes.add(token === 'DEFAULT' ? 'rounded' : `rounded-${token}`);
};

const addColorUtilities = (classes, token) => {
  if (!token) return;
  const prefixes = [
    'text',
    'bg',
    'border',
    'ring',
    'fill',
    'stroke',
    'decoration',
    'placeholder',
    'caret',
    'accent',
  ];
  prefixes.forEach((prefix) => classes.add(`${prefix}-${token}`));
};

const addFontSizeUtilities = (classes, token) => {
  classes.add(`text-${token}`);
};

const configModule = await import(pathToFileURL(configPath).href);
const config = configModule.default ?? {};
const theme = toObject(config.theme);

const classes = new Set();
const variants = new Set();

collectTokenKeys(collectSection(theme, 'colors')).forEach((token) =>
  addColorUtilities(classes, token)
);
collectTokenKeys(collectSection(theme, 'spacing')).forEach((token) =>
  addSpacingUtilities(classes, token)
);
collectTokenKeys(collectSection(theme, 'borderRadius')).forEach((token) =>
  addRadiusUtilities(classes, token)
);
collectTokenKeys(collectSection(theme, 'fontSize')).forEach((token) =>
  addFontSizeUtilities(classes, token)
);
collectTokenKeys(collectSection(theme, 'screens')).forEach((token) =>
  variants.add(token)
);

const payload = {
  generatedAt: new Date().toISOString(),
  source: 'apps/web/tailwind.config.ts',
  classes: [...classes].sort((left, right) => left.localeCompare(right)),
  variants: [...variants].sort((left, right) => left.localeCompare(right)),
};

await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(
  `Wrote ${payload.classes.length} runtime classes and ${payload.variants.length} runtime variants to ${outputPath}`
);
