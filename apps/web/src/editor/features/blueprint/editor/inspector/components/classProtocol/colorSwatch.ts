import tailwindColors from 'tailwindcss/colors';

export type ClassTokenColorKind =
  'text' | 'background' | 'border' | 'vector' | 'accent';

export type ClassTokenColorSwatch = {
  color: string;
  kind: ClassTokenColorKind;
};

const COLOR_PREFIX_KIND_MAP: Array<{
  prefix: string;
  kind: ClassTokenColorKind;
}> = [
  { prefix: 'text-', kind: 'text' },
  { prefix: 'bg-', kind: 'background' },
  { prefix: 'border-', kind: 'border' },
  { prefix: 'outline-', kind: 'border' },
  { prefix: 'decoration-', kind: 'text' },
  { prefix: 'fill-', kind: 'vector' },
  { prefix: 'stroke-', kind: 'vector' },
  { prefix: 'accent-', kind: 'accent' },
  { prefix: 'caret-', kind: 'accent' },
];

const isBracketColor = (value: string) =>
  value.startsWith('[') && value.endsWith(']');

const extractUtility = (token: string) => {
  const normalized = token.trim();
  if (!normalized) return '';
  const parts = normalized.split(':');
  return parts[parts.length - 1] ?? normalized;
};

const stripOpacity = (value: string) => value.split('/')[0] ?? value;

const resolveNamedColor = (value: string) => {
  const palette = tailwindColors as Record<string, unknown>;
  const lastDash = value.lastIndexOf('-');
  if (lastDash <= 0) {
    const direct = palette[value];
    return typeof direct === 'string' ? direct : undefined;
  }

  const colorName = value.slice(0, lastDash);
  const shade = value.slice(lastDash + 1);
  const colorScale = palette[colorName];
  if (!colorScale || typeof colorScale !== 'object') return undefined;
  const resolved = (colorScale as Record<string, unknown>)[shade];
  return typeof resolved === 'string' ? resolved : undefined;
};

export const resolveClassTokenColorSwatch = (
  token: string
): ClassTokenColorSwatch | undefined => {
  const utility = extractUtility(token);
  const matched = COLOR_PREFIX_KIND_MAP.find(({ prefix }) =>
    utility.startsWith(prefix)
  );
  if (!matched) return undefined;

  const rawColor = stripOpacity(utility.slice(matched.prefix.length));
  if (!rawColor) return undefined;

  if (isBracketColor(rawColor)) {
    const arbitrary = rawColor.slice(1, -1).trim();
    return arbitrary ? { color: arbitrary, kind: matched.kind } : undefined;
  }

  const named = resolveNamedColor(rawColor);
  return named ? { color: named, kind: matched.kind } : undefined;
};
