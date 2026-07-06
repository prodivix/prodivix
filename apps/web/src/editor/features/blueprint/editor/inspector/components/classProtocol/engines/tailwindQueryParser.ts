export type ParsedTailwindQuery = {
  fixedVariants: string[];
  variantDraft: string;
  utilityDraft: string;
  hasTopLevelColon: boolean;
};

const splitByTopLevelColon = (input: string) => {
  const segments: string[] = [];
  let buffer = '';
  let squareDepth = 0;
  let parenDepth = 0;
  let escaped = false;

  for (const char of input) {
    if (escaped) {
      buffer += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      buffer += char;
      escaped = true;
      continue;
    }
    if (char === '[') {
      squareDepth += 1;
      buffer += char;
      continue;
    }
    if (char === ']') {
      if (squareDepth > 0) squareDepth -= 1;
      buffer += char;
      continue;
    }
    if (char === '(') {
      parenDepth += 1;
      buffer += char;
      continue;
    }
    if (char === ')') {
      if (parenDepth > 0) parenDepth -= 1;
      buffer += char;
      continue;
    }
    if (char === ':' && squareDepth === 0 && parenDepth === 0) {
      segments.push(buffer);
      buffer = '';
      continue;
    }
    buffer += char;
  }

  segments.push(buffer);
  return segments;
};

export const parseTailwindSuggestionQuery = (
  rawQuery: string
): ParsedTailwindQuery => {
  const query = rawQuery.trim();
  if (!query) {
    return {
      fixedVariants: [],
      variantDraft: '',
      utilityDraft: '',
      hasTopLevelColon: false,
    };
  }

  const segments = splitByTopLevelColon(query);
  const hasTopLevelColon = segments.length > 1;
  if (!hasTopLevelColon) {
    return {
      fixedVariants: [],
      variantDraft: '',
      utilityDraft: query,
      hasTopLevelColon: false,
    };
  }

  const hasTrailingColon = query.endsWith(':');
  if (hasTrailingColon) {
    const variantSegments = segments.slice(0, -1).map((item) => item.trim());
    const normalized = variantSegments.filter(Boolean);
    if (!normalized.length) {
      return {
        fixedVariants: [],
        variantDraft: '',
        utilityDraft: '',
        hasTopLevelColon: true,
      };
    }
    const fixedVariants = normalized.slice(0, -1);
    const variantDraft = normalized.at(-1) ?? '';
    return {
      fixedVariants,
      variantDraft,
      utilityDraft: '',
      hasTopLevelColon: true,
    };
  }

  const utilityDraft = (segments.at(-1) ?? '').trim();
  const fixedVariants = segments
    .slice(0, -1)
    .map((item) => item.trim())
    .filter(Boolean);
  return {
    fixedVariants,
    variantDraft: '',
    utilityDraft,
    hasTopLevelColon: true,
  };
};

export const isArbitraryTailwindToken = (value: string) => {
  const token = value.trim();
  if (!token) return false;
  if (token.startsWith('[') && token.endsWith(']') && token.includes(':')) {
    return true;
  }
  if (token.includes('-[') && token.endsWith(']')) return true;
  if (token.includes('-(') && token.endsWith(')')) return true;
  return false;
};
