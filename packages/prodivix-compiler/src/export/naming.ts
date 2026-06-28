const RESERVED_IDENTIFIERS = new Set([
  'break',
  'case',
  'catch',
  'class',
  'const',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
]);

export const toSafeExportIdentifier = (value: string, fallback: string) => {
  const safe = value
    .trim()
    .replace(/[^a-zA-Z0-9_$]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part, index) =>
      index === 0
        ? part.charAt(0).toLowerCase() + part.slice(1)
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join('');
  const candidate = safe || fallback;
  const prefixed = /^[a-zA-Z_$]/.test(candidate) ? candidate : `_${candidate}`;
  return RESERVED_IDENTIFIERS.has(prefixed) ? `${prefixed}Value` : prefixed;
};
