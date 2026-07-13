import type { SourceSpan } from '@prodivix/diagnostics';

type TextPosition = Readonly<{
  line: number;
  column: number;
}>;

export type TextOffsetRange = Readonly<{
  from: number;
  to: number;
}>;

const positionAtOffset = (source: string, offset: number): TextPosition => {
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

  return { line, column };
};

const lineBounds = (
  source: string,
  requestedLine: number
): { from: number; to: number } | null => {
  if (!Number.isSafeInteger(requestedLine) || requestedLine < 1) return null;

  let line = 1;
  let from = 0;
  for (let index = 0; index <= source.length; index += 1) {
    const character = source[index];
    const isLineBreak = character === '\n' || character === '\r';
    const isEnd = index === source.length;
    if (!isLineBreak && !isEnd) continue;

    if (line === requestedLine) return { from, to: index };
    if (isEnd) return null;
    if (character === '\r' && source[index + 1] === '\n') index += 1;
    line += 1;
    from = index + 1;
  }

  return null;
};

const offsetAtPosition = (
  source: string,
  position: TextPosition
): number | null => {
  if (!Number.isSafeInteger(position.column) || position.column < 1) {
    return null;
  }
  const bounds = lineBounds(source, position.line);
  if (!bounds) return null;
  const offset = bounds.from + position.column - 1;
  return offset <= bounds.to ? offset : null;
};

export const createSourceSpanFromOffsets = (input: {
  artifactId: string;
  source: string;
  from: number;
  to: number;
}): SourceSpan => {
  const from = Math.min(input.source.length, Math.max(0, input.from));
  const to = Math.min(input.source.length, Math.max(from, input.to));
  const start = positionAtOffset(input.source, from);
  const end = positionAtOffset(input.source, to);

  return {
    artifactId: input.artifactId,
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
};

/** Resolves the shared one-based SourceSpan contract without clamping stale ranges. */
export const resolveSourceSpanOffsets = (
  source: string,
  sourceSpan: SourceSpan
): TextOffsetRange | null => {
  const from = offsetAtPosition(source, {
    line: sourceSpan.startLine,
    column: sourceSpan.startColumn,
  });
  const to = offsetAtPosition(source, {
    line: sourceSpan.endLine,
    column: sourceSpan.endColumn,
  });
  if (from === null || to === null || to < from) return null;
  return { from, to };
};
