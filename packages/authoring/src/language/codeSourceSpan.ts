import type { SourceSpan } from '@prodivix/diagnostics';

type CodeTextPosition = Readonly<{
  line: number;
  column: number;
}>;

export type CodeLanguageOffsetRange = Readonly<{
  from: number;
  to: number;
}>;

const isValidOffset = (source: string, offset: number): boolean =>
  Number.isSafeInteger(offset) &&
  offset >= 0 &&
  offset <= source.length &&
  !(offset > 0 && source[offset - 1] === '\r' && source[offset] === '\n');

const positionAtOffset = (source: string, offset: number): CodeTextPosition => {
  let line = 1;
  let column = 1;

  for (let index = 0; index < offset; index += 1) {
    const character = source[index];
    if (character === '\r') {
      if (source[index + 1] === '\n' && index + 1 < offset) index += 1;
      line += 1;
      column = 1;
      continue;
    }
    if (character === '\n') {
      line += 1;
      column = 1;
      continue;
    }
    column += 1;
  }

  return Object.freeze({ line, column });
};

const lineBounds = (
  source: string,
  requestedLine: number
): CodeLanguageOffsetRange | null => {
  if (!Number.isSafeInteger(requestedLine) || requestedLine < 1) return null;

  let line = 1;
  let from = 0;
  for (let index = 0; index <= source.length; index += 1) {
    const character = source[index];
    const isLineBreak = character === '\n' || character === '\r';
    const isEnd = index === source.length;
    if (!isLineBreak && !isEnd) continue;

    if (line === requestedLine) return Object.freeze({ from, to: index });
    if (isEnd) return null;
    if (character === '\r' && source[index + 1] === '\n') index += 1;
    line += 1;
    from = index + 1;
  }

  return null;
};

const offsetAtPosition = (
  source: string,
  position: CodeTextPosition
): number | null => {
  if (!Number.isSafeInteger(position.column) || position.column < 1) {
    return null;
  }
  const bounds = lineBounds(source, position.line);
  if (!bounds) return null;
  const offset = bounds.from + position.column - 1;
  return offset <= bounds.to ? offset : null;
};

/**
 * Converts an end-exclusive UTF-16 offset range into the shared one-based
 * SourceSpan. Invalid ranges, including an offset that splits CRLF, are
 * rejected instead of being clamped to different source text.
 */
export const createCodeSourceSpanFromOffsets = (input: {
  artifactId: string;
  source: string;
  from: number;
  to: number;
}): SourceSpan | null => {
  if (
    !input.artifactId ||
    !isValidOffset(input.source, input.from) ||
    !isValidOffset(input.source, input.to) ||
    input.to < input.from
  ) {
    return null;
  }
  const start = positionAtOffset(input.source, input.from);
  const end = positionAtOffset(input.source, input.to);
  return Object.freeze({
    artifactId: input.artifactId,
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  });
};

/** Resolves a one-based, end-exclusive SourceSpan without clamping stale text. */
export const resolveCodeSourceSpanOffsets = (
  source: string,
  sourceSpan: SourceSpan
): CodeLanguageOffsetRange | null => {
  const from = offsetAtPosition(source, {
    line: sourceSpan.startLine,
    column: sourceSpan.startColumn,
  });
  const to = offsetAtPosition(source, {
    line: sourceSpan.endLine,
    column: sourceSpan.endColumn,
  });
  if (from === null || to === null || to < from) return null;
  return Object.freeze({ from, to });
};
