import React from 'react';

const ALLOWED_INLINE_TAGS = new Set([
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'span',
  'br',
  'sub',
  'sup',
  'mark',
  'small',
  'code',
]);

const ALLOWED_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'letter-spacing',
  'line-height',
]);

const toCamelCase = (value: string) =>
  value.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());

const sanitizeInlineStyle = (
  styleValue: string
): React.CSSProperties | undefined => {
  const entries = styleValue
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries.length) return undefined;

  const styleObject: Record<string, string> = {};
  entries.forEach((entry) => {
    const splitIndex = entry.indexOf(':');
    if (splitIndex <= 0) return;
    const rawProp = entry.slice(0, splitIndex).trim().toLowerCase();
    const rawValue = entry.slice(splitIndex + 1).trim();
    if (!rawValue || !ALLOWED_STYLE_PROPS.has(rawProp)) return;
    styleObject[toCamelCase(rawProp)] = rawValue;
  });

  return Object.keys(styleObject).length
    ? (styleObject as React.CSSProperties)
    : undefined;
};

const convertNodeList = (
  nodes: NodeListOf<ChildNode> | HTMLCollection,
  keyPrefix: string
): React.ReactNode[] => {
  const output: React.ReactNode[] = [];
  Array.from(nodes).forEach((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.nodeType === Node.TEXT_NODE) {
      output.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();
    const children = convertNodeList(element.childNodes, key);

    if (!ALLOWED_INLINE_TAGS.has(tagName)) {
      output.push(...children);
      return;
    }

    const style = sanitizeInlineStyle(element.getAttribute('style') ?? '');
    if (tagName === 'br') {
      output.push(React.createElement('br', { key }));
      return;
    }
    output.push(
      React.createElement(
        tagName,
        { key, ...(style ? { style } : {}) },
        children
      )
    );
  });
  return output;
};

export const renderRichTextValue = (value: string): React.ReactNode => {
  if (typeof DOMParser === 'undefined') return value;
  try {
    const parser = new DOMParser();
    const documentFragment = parser.parseFromString(value, 'text/html');
    const nodes = convertNodeList(documentFragment.body.childNodes, 'rich');
    return nodes.length === 1 ? nodes[0] : nodes;
  } catch {
    return value;
  }
};
