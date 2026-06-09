export const SVG_MIME_TYPE = 'image/svg+xml';
export const MAX_SVG_PREVIEW_BYTES = 512 * 1024;

const SAFE_SVG_ELEMENTS = new Set([
  'svg',
  'g',
  'defs',
  'title',
  'desc',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'linearGradient',
  'radialGradient',
  'stop',
  'clipPath',
  'mask',
  'pattern',
  'use',
]);

const SAFE_SVG_ATTRS = new Set([
  'aria-hidden',
  'aria-label',
  'class',
  'clip-path',
  'cx',
  'cy',
  'd',
  'dx',
  'dy',
  'fill',
  'fill-opacity',
  'fill-rule',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'height',
  'id',
  'mask',
  'offset',
  'opacity',
  'patternContentUnits',
  'patternUnits',
  'points',
  'preserveAspectRatio',
  'r',
  'role',
  'rx',
  'ry',
  'spreadMethod',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'style',
  'text-anchor',
  'transform',
  'viewBox',
  'width',
  'x',
  'x1',
  'x2',
  'xlink:href',
  'xmlns',
  'xmlns:xlink',
  'y',
  'y1',
  'y2',
]);

const SAFE_SVG_STYLE_PROPS = new Set([
  'color',
  'display',
  'fill',
  'fill-opacity',
  'fill-rule',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'opacity',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'visibility',
]);

const SVG_IRI_ATTRS = new Set([
  'clip-path',
  'fill',
  'mask',
  'stroke',
  'xlink:href',
]);

export const isSvgFileLike = (input: { type?: string; name?: string }) =>
  input.type?.toLowerCase() === SVG_MIME_TYPE ||
  Boolean(input.name?.toLowerCase().endsWith('.svg'));

const isSafeSvgUrlValue = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('url(#') && trimmed.endsWith(')')) return true;
  if (!trimmed.includes(':')) return true;

  const normalized = trimmed.toLowerCase();
  return normalized.startsWith('data:image/');
};

export const sanitizeSvgStyle = (value: string) => {
  const safeEntries: string[] = [];

  value.split(';').forEach((entry) => {
    const splitIndex = entry.indexOf(':');
    if (splitIndex <= 0) return;

    const normalizedProp = entry.slice(0, splitIndex).trim().toLowerCase();
    const propValue = entry.slice(splitIndex + 1).trim();
    const normalizedValue = propValue.toLowerCase();

    if (!SAFE_SVG_STYLE_PROPS.has(normalizedProp)) return;
    if (
      normalizedValue.includes('url(') ||
      normalizedValue.includes('expression(') ||
      normalizedValue.includes('@import')
    ) {
      return;
    }

    safeEntries.push(`${normalizedProp}: ${propValue}`);
  });

  return safeEntries.join('; ');
};

export const sanitizeSvgAttribute = (name: string, value: string) => {
  const normalizedName = name.toLowerCase();
  if (normalizedName.startsWith('on')) return null;
  if (!SAFE_SVG_ATTRS.has(name) && !SAFE_SVG_ATTRS.has(normalizedName)) {
    return null;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (
    normalizedValue.includes('javascript:') ||
    normalizedValue.includes('vbscript:')
  ) {
    return null;
  }

  if (normalizedName === 'style') {
    const style = sanitizeSvgStyle(value);
    return style ? { name, value: style } : null;
  }

  if (normalizedName === 'href') return null;

  if (SVG_IRI_ATTRS.has(normalizedName) && !isSafeSvgUrlValue(value)) {
    return null;
  }

  return { name, value };
};

const sanitizeSvgElement = (
  source: Element,
  document: XMLDocument
): Element | null => {
  const tagName = source.tagName;
  if (!SAFE_SVG_ELEMENTS.has(tagName)) return null;

  const output = document.createElementNS(
    'http://www.w3.org/2000/svg',
    tagName
  );

  Array.from(source.attributes).forEach((attr) => {
    const safeAttr = sanitizeSvgAttribute(attr.name, attr.value);
    if (!safeAttr) return;
    output.setAttribute(safeAttr.name, safeAttr.value);
  });

  Array.from(source.childNodes).forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      output.append(document.createTextNode(child.textContent ?? ''));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const safeChild = sanitizeSvgElement(child as Element, document);
    if (safeChild) output.append(safeChild);
  });

  return output;
};

export const sanitizeSvgMarkup = (markup: string) => {
  if (
    typeof DOMParser === 'undefined' ||
    typeof XMLSerializer === 'undefined'
  ) {
    return null;
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(markup, SVG_MIME_TYPE);
  if (parsed.querySelector('parsererror')) return null;

  const root = parsed.documentElement;
  if (!root || root.tagName !== 'svg') return null;

  const safeRoot = sanitizeSvgElement(root, parsed);
  if (!safeRoot) return null;

  const serialized = new XMLSerializer().serializeToString(safeRoot);
  return serialized.includes('<svg') ? serialized : null;
};
