export type SafeRichTextStyle = Record<string, string>;

export type SafeRichTextElement = {
  tagName: string;
  style?: SafeRichTextStyle;
  children: SafeRichTextNode[];
};

export type SafeRichTextNode = string | SafeRichTextElement;

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

const BLOCKED_RICH_TEXT_TAGS = new Set([
  'base',
  'button',
  'canvas',
  'embed',
  'form',
  'iframe',
  'input',
  'link',
  'math',
  'meta',
  'object',
  'script',
  'select',
  'style',
  'svg',
  'textarea',
]);

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

const isAsciiLetterOrNumber = (char: string) =>
  (char >= 'a' && char <= 'z') ||
  (char >= 'A' && char <= 'Z') ||
  (char >= '0' && char <= '9');

const toCamelCase = (value: string) =>
  value.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());

const decodeHtmlEntity = (entity: string) => {
  const decodeCodePoint = (value: string, radix: number) => {
    const digits = radix === 16 ? /^[0-9a-f]+$/i : /^\d+$/;
    if (!digits.test(value)) return null;
    const codePoint = Number.parseInt(value, radix);
    return Number.isInteger(codePoint) &&
      codePoint >= 0 &&
      codePoint <= 0x10ffff &&
      !(codePoint >= 0xd800 && codePoint <= 0xdfff)
      ? String.fromCodePoint(codePoint)
      : null;
  };
  if (entity.startsWith('#x') || entity.startsWith('#X')) {
    return decodeCodePoint(entity.slice(2), 16);
  }
  if (entity.startsWith('#')) {
    return decodeCodePoint(entity.slice(1), 10);
  }
  return HTML_ENTITIES[entity] ?? null;
};

const decodeHtmlEntities = (value: string) => {
  let output = '';
  let cursor = 0;

  while (cursor < value.length) {
    const ampIndex = value.indexOf('&', cursor);
    if (ampIndex < 0) {
      output += value.slice(cursor);
      break;
    }

    output += value.slice(cursor, ampIndex);
    const semiIndex = value.indexOf(';', ampIndex + 1);
    if (semiIndex < 0 || semiIndex - ampIndex > 12) {
      output += '&';
      cursor = ampIndex + 1;
      continue;
    }

    const decoded = decodeHtmlEntity(value.slice(ampIndex + 1, semiIndex));
    output += decoded ?? value.slice(ampIndex, semiIndex + 1);
    cursor = semiIndex + 1;
  }

  return output;
};

const readTagName = (rawTag: string) => {
  let cursor = rawTag.startsWith('/') ? 1 : 0;
  while (rawTag[cursor] === ' ') cursor += 1;

  const start = cursor;
  while (cursor < rawTag.length && isAsciiLetterOrNumber(rawTag[cursor])) {
    cursor += 1;
  }

  return rawTag.slice(start, cursor).toLowerCase();
};

const findClosingTagEnd = (value: string, tagName: string, from: number) => {
  const needle = `</${tagName}`;
  const lowerValue = value.toLowerCase();
  let cursor = from;

  while (cursor < value.length) {
    const closeStart = lowerValue.indexOf(needle, cursor);
    if (closeStart < 0) return -1;

    const afterName = value[closeStart + needle.length] ?? '';
    if (afterName === '>' || !afterName.trim()) {
      const closeEnd = value.indexOf('>', closeStart + needle.length);
      return closeEnd < 0 ? -1 : closeEnd + 1;
    }

    cursor = closeStart + needle.length;
  }

  return -1;
};

const readStyleAttribute = (rawTag: string) => {
  const lowerTag = rawTag.toLowerCase();
  let cursor = 0;

  while (cursor < lowerTag.length) {
    const styleIndex = lowerTag.indexOf('style', cursor);
    if (styleIndex < 0) return '';

    const before = styleIndex > 0 ? lowerTag[styleIndex - 1] : ' ';
    const after = lowerTag[styleIndex + 5] ?? '';
    if (
      isAsciiLetterOrNumber(before) ||
      before === '-' ||
      before === '_' ||
      isAsciiLetterOrNumber(after) ||
      after === '-' ||
      after === '_'
    ) {
      cursor = styleIndex + 5;
      continue;
    }

    let valueCursor = styleIndex + 5;
    while (lowerTag[valueCursor] === ' ') valueCursor += 1;
    if (lowerTag[valueCursor] !== '=') {
      cursor = valueCursor;
      continue;
    }

    valueCursor += 1;
    while (lowerTag[valueCursor] === ' ') valueCursor += 1;

    const quote = rawTag[valueCursor];
    if (quote === '"' || quote === "'") {
      const endIndex = rawTag.indexOf(quote, valueCursor + 1);
      return endIndex < 0 ? '' : rawTag.slice(valueCursor + 1, endIndex);
    }

    let endIndex = valueCursor;
    while (endIndex < rawTag.length && rawTag[endIndex] !== ' ') {
      endIndex += 1;
    }
    return rawTag.slice(valueCursor, endIndex);
  }

  return '';
};

const isSafeInlineStyleValue = (value: string) => {
  const normalized = value.toLowerCase();
  return (
    !normalized.includes('url(') &&
    !normalized.includes('expression(') &&
    !normalized.includes('@import')
  );
};

export const sanitizeRichTextInlineStyle = (styleValue: string) => {
  const entries = styleValue
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries.length) return undefined;

  const styleObject: SafeRichTextStyle = {};
  entries.forEach((entry) => {
    const splitIndex = entry.indexOf(':');
    if (splitIndex <= 0) return;
    const rawProp = entry.slice(0, splitIndex).trim().toLowerCase();
    const rawValue = entry.slice(splitIndex + 1).trim();
    if (
      !rawValue ||
      !ALLOWED_STYLE_PROPS.has(rawProp) ||
      !isSafeInlineStyleValue(rawValue)
    )
      return;
    styleObject[toCamelCase(rawProp)] = rawValue;
  });

  return Object.keys(styleObject).length ? styleObject : undefined;
};

export const parseSafeRichText = (value: string) => {
  const root: SafeRichTextElement = { tagName: 'root', children: [] };
  const stack: SafeRichTextElement[] = [root];
  let cursor = 0;

  const appendText = (text: string) => {
    if (!text) return;
    stack[stack.length - 1].children.push(decodeHtmlEntities(text));
  };

  while (cursor < value.length) {
    const tagStart = value.indexOf('<', cursor);
    if (tagStart < 0) {
      appendText(value.slice(cursor));
      break;
    }

    appendText(value.slice(cursor, tagStart));
    const tagEnd = value.indexOf('>', tagStart + 1);
    if (tagEnd < 0) {
      appendText(value.slice(tagStart));
      break;
    }

    const rawTag = value.slice(tagStart + 1, tagEnd).trim();
    const tagName = readTagName(rawTag);
    if (!tagName || !ALLOWED_INLINE_TAGS.has(tagName)) {
      if (
        tagName &&
        !rawTag.startsWith('/') &&
        BLOCKED_RICH_TEXT_TAGS.has(tagName)
      ) {
        const closingTagEnd = findClosingTagEnd(value, tagName, tagEnd + 1);
        cursor = closingTagEnd < 0 ? value.length : closingTagEnd;
        continue;
      }

      cursor = tagEnd + 1;
      continue;
    }

    if (rawTag.startsWith('/')) {
      if (stack.length > 1 && stack[stack.length - 1].tagName === tagName) {
        stack.pop();
      }
      cursor = tagEnd + 1;
      continue;
    }

    if (tagName === 'br') {
      stack[stack.length - 1].children.push({ tagName, children: [] });
      cursor = tagEnd + 1;
      continue;
    }

    const style = sanitizeRichTextInlineStyle(readStyleAttribute(rawTag));
    const nextNode: SafeRichTextElement = {
      tagName,
      ...(style ? { style } : {}),
      children: [],
    };
    stack[stack.length - 1].children.push(nextNode);

    if (!rawTag.endsWith('/')) {
      stack.push(nextNode);
    }
    cursor = tagEnd + 1;
  }

  return root.children;
};
