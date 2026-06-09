export const stripHtmlTags = (value: string) => {
  let output = '';
  let cursor = 0;

  while (cursor < value.length) {
    const tagStart = value.indexOf('<', cursor);
    if (tagStart < 0) {
      output += value.slice(cursor);
      break;
    }

    output += `${value.slice(cursor, tagStart)} `;
    const tagEnd = value.indexOf('>', tagStart + 1);
    if (tagEnd < 0) break;
    cursor = tagEnd + 1;
  }

  return output;
};

export const collapseWhitespace = (value: string) => {
  let output = '';
  let previousWasSpace = false;

  for (const char of value) {
    const isSpace = char.trim() === '';
    if (isSpace) {
      if (!previousWasSpace) output += ' ';
      previousWasSpace = true;
      continue;
    }

    output += char;
    previousWasSpace = false;
  }

  return output.trim();
};

export const getVisibleTextMetrics = (htmlValue: string) => {
  const text = collapseWhitespace(stripHtmlTags(htmlValue));
  return {
    text,
    characterCount: text.length,
    wordCount: text ? text.split(' ').length : 0,
  };
};

export const splitLines = (value: string) => {
  const lines: string[] = [];
  let cursor = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== '\n' && char !== '\r') continue;

    lines.push(value.slice(cursor, index));

    if (char === '\r' && value[index + 1] === '\n') {
      index += 1;
    }
    cursor = index + 1;
  }

  lines.push(value.slice(cursor));
  return lines;
};

export const splitSseFrames = (value: string) => {
  const frames: string[] = [];
  let cursor = 0;
  let index = 0;

  while (index < value.length) {
    const char = value[index];
    const nextChar = value[index + 1];
    const thirdChar = value[index + 2];
    const fourthChar = value[index + 3];
    const isLfLf = char === '\n' && nextChar === '\n';
    const isCrLfCrLf =
      char === '\r' &&
      nextChar === '\n' &&
      thirdChar === '\r' &&
      fourthChar === '\n';
    const isCrCr = char === '\r' && nextChar === '\r';

    if (!isLfLf && !isCrLfCrLf && !isCrCr) {
      index += 1;
      continue;
    }

    frames.push(value.slice(cursor, index));
    index += isCrLfCrLf ? 4 : 2;
    cursor = index;
  }

  return {
    frames,
    remainder: value.slice(cursor),
  };
};

export const stripJsonFence = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```') || !trimmed.endsWith('```')) {
    return trimmed;
  }

  const firstLineEnd = trimmed.indexOf('\n');
  if (firstLineEnd < 0) return trimmed;

  const language = trimmed.slice(3, firstLineEnd).trim().toLowerCase();
  if (language && language !== 'json') return trimmed;

  return trimmed.slice(firstLineEnd + 1, -3).trim();
};

export const truncate = (
  str: string,
  maxLength: number,
  suffix: string = '...'
) => {
  if (maxLength <= 0) return '';

  const segmenter = new Intl.Segmenter(undefined, {
    granularity: 'grapheme',
  });
  const segments = Array.from(segmenter.segment(str));
  if (segments.length <= maxLength) return str;

  const suffixSegments = Array.from(segmenter.segment(suffix));
  if (suffixSegments.length >= maxLength) {
    return suffixSegments
      .slice(0, maxLength)
      .map((segment) => segment.segment)
      .join('');
  }

  return (
    segments
      .slice(0, maxLength - suffixSegments.length)
      .map((segment) => segment.segment)
      .join('') + suffix
  );
};
