const NAMED_ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '\u00a9',
};

const HAS_HTML_ENTITY_PATTERN = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i;
const HTML_ENTITY_PATTERN = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]+);/gi;

const decodeHtmlEntityToken = (token: string) => {
  if (!token.startsWith('&') || !token.endsWith(';')) return token;
  const body = token.slice(1, -1);
  if (!body) return token;

  if (body[0] === '#') {
    const isHex = body[1]?.toLowerCase() === 'x';
    const numeric = isHex ? body.slice(2) : body.slice(1);
    const radix = isHex ? 16 : 10;
    const codePoint = Number.parseInt(numeric, radix);
    if (!Number.isFinite(codePoint) || codePoint <= 0) return token;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return token;
    }
  }

  return NAMED_ENTITY_MAP[body.toLowerCase()] ?? token;
};

const decodeWithDom = (value: string): string | null => {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = value;
  return textarea.value;
};

export const decodeHtmlEntities = (value: unknown): unknown => {
  if (typeof value !== 'string' || !HAS_HTML_ENTITY_PATTERN.test(value)) {
    return value;
  }

  const domDecoded = decodeWithDom(value);
  if (domDecoded !== null) return domDecoded;

  return value.replace(HTML_ENTITY_PATTERN, decodeHtmlEntityToken);
};
