import React from 'react';
import {
  parseSafeRichText,
  type SafeRichTextNode,
} from '@prodivix/shared/safety';

const renderRichTextNode = (
  node: SafeRichTextNode,
  key: string
): React.ReactNode => {
  if (typeof node === 'string') return node;
  if (node.tagName === 'br') return React.createElement('br', { key });
  return React.createElement(
    node.tagName,
    { key, ...(node.style ? { style: node.style } : {}) },
    node.children.map((child, index) =>
      renderRichTextNode(child, `${key}-${index}`)
    )
  );
};

export const renderRichTextValue = (value: string): React.ReactNode => {
  try {
    const nodes = parseSafeRichText(value).map((node, index) =>
      renderRichTextNode(node, `rich-${index}`)
    );
    return nodes.length === 1 ? nodes[0] : nodes;
  } catch {
    return value;
  }
};
