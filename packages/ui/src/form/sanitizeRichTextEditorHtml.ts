import { sanitizeRichTextInlineStyle } from '@prodivix/shared/safety';

const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'i',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  's',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
  'ul',
]);

const DROP_WITH_CONTENT_TAGS = new Set([
  'base',
  'canvas',
  'embed',
  'iframe',
  'link',
  'math',
  'meta',
  'object',
  'script',
  'style',
  'svg',
  'template',
]);

const toCssProperty = (value: string) =>
  value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);

const sanitizeLinkHref = (value: string): string | null => {
  const href = value.trim();
  if (!href) return null;
  if (href.startsWith('#') || href.startsWith('/') || href.startsWith('./')) {
    return href;
  }
  try {
    const parsed = new URL(href, 'https://prodivix.invalid');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)
      ? href
      : null;
  } catch {
    return null;
  }
};

const sanitizeNode = (node: Node, ownerDocument: Document): Node | null => {
  if (node.nodeType === Node.TEXT_NODE) {
    return ownerDocument.createTextNode(node.textContent ?? '');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const source = node as HTMLElement;
  const tagName = source.tagName.toLowerCase();
  if (DROP_WITH_CONTENT_TAGS.has(tagName)) return null;

  const children = [...source.childNodes]
    .map((child) => sanitizeNode(child, ownerDocument))
    .filter((child): child is Node => child !== null);
  if (!ALLOWED_TAGS.has(tagName)) {
    const fragment = ownerDocument.createDocumentFragment();
    fragment.append(...children);
    return fragment;
  }

  const target = ownerDocument.createElement(tagName);
  target.append(...children);
  const safeStyle = sanitizeRichTextInlineStyle(
    source.getAttribute('style') ?? ''
  );
  if (safeStyle) {
    for (const [property, styleValue] of Object.entries(safeStyle)) {
      target.style.setProperty(toCssProperty(property), styleValue);
    }
  }

  if (tagName === 'a') {
    const href = sanitizeLinkHref(source.getAttribute('href') ?? '');
    if (href) target.setAttribute('href', href);
    if (source.getAttribute('target') === '_blank') {
      target.setAttribute('target', '_blank');
      target.setAttribute('rel', 'noopener noreferrer');
    }
  }
  return target;
};

/** Converts browser-authored rich text into a small, attribute-safe HTML subset. */
export const sanitizeRichTextEditorHtml = (value: string): string => {
  if (typeof document === 'undefined') return '';
  const template = document.createElement('template');
  template.innerHTML = value;
  const output = document.createElement('div');
  for (const child of [...template.content.childNodes]) {
    const sanitized = sanitizeNode(child, document);
    if (sanitized) output.append(sanitized);
  }
  return output.innerHTML;
};
