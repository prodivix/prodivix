export type WorkspaceTextHunk = {
  /** One-based line position in the shared base text. */
  baseStartLine: number;
  baseLineCount: number;
  baseText: string;
  replacementText: string;
};

export type WorkspaceTextConflict = {
  id: string;
  localHunk: WorkspaceTextHunk;
  remoteHunk: WorkspaceTextHunk;
};

export type WorkspaceTextMergeResult =
  | {
      ok: true;
      text: string;
      localHunks: WorkspaceTextHunk[];
      remoteHunks: WorkspaceTextHunk[];
    }
  | {
      ok: false;
      localHunks: WorkspaceTextHunk[];
      remoteHunks: WorkspaceTextHunk[];
      conflicts: WorkspaceTextConflict[];
    };

type TextEdit =
  | { kind: 'equal'; value: string }
  | { kind: 'delete'; value: string }
  | { kind: 'insert'; value: string };

const MAX_LCS_CELLS = 1_000_000;

const splitLines = (source: string): string[] =>
  source.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? [];

const createSingleHunk = (
  baseLines: readonly string[],
  nextLines: readonly string[],
  baseOffset: number
): WorkspaceTextHunk => ({
  baseStartLine: baseOffset + 1,
  baseLineCount: baseLines.length,
  baseText: baseLines.join(''),
  replacementText: nextLines.join(''),
});

const buildLcsEdits = (
  baseLines: readonly string[],
  nextLines: readonly string[]
): TextEdit[] | null => {
  const width = nextLines.length + 1;
  const cellCount = (baseLines.length + 1) * width;
  if (cellCount > MAX_LCS_CELLS) return null;
  const lengths = new Uint32Array(cellCount);
  for (let baseIndex = baseLines.length - 1; baseIndex >= 0; baseIndex -= 1) {
    for (let nextIndex = nextLines.length - 1; nextIndex >= 0; nextIndex -= 1) {
      const index = baseIndex * width + nextIndex;
      lengths[index] =
        baseLines[baseIndex] === nextLines[nextIndex]
          ? 1 + lengths[(baseIndex + 1) * width + nextIndex + 1]!
          : Math.max(
              lengths[(baseIndex + 1) * width + nextIndex]!,
              lengths[baseIndex * width + nextIndex + 1]!
            );
    }
  }

  const edits: TextEdit[] = [];
  let baseIndex = 0;
  let nextIndex = 0;
  while (baseIndex < baseLines.length && nextIndex < nextLines.length) {
    const baseLine = baseLines[baseIndex]!;
    const nextLine = nextLines[nextIndex]!;
    if (baseLine === nextLine) {
      edits.push({ kind: 'equal', value: baseLine });
      baseIndex += 1;
      nextIndex += 1;
      continue;
    }
    const deleteScore = lengths[(baseIndex + 1) * width + nextIndex] ?? 0;
    const insertScore = lengths[baseIndex * width + nextIndex + 1] ?? 0;
    if (deleteScore >= insertScore) {
      edits.push({ kind: 'delete', value: baseLine });
      baseIndex += 1;
    } else {
      edits.push({ kind: 'insert', value: nextLine });
      nextIndex += 1;
    }
  }
  while (baseIndex < baseLines.length) {
    edits.push({ kind: 'delete', value: baseLines[baseIndex]! });
    baseIndex += 1;
  }
  while (nextIndex < nextLines.length) {
    edits.push({ kind: 'insert', value: nextLines[nextIndex]! });
    nextIndex += 1;
  }
  return edits;
};

const editsToHunks = (
  edits: readonly TextEdit[],
  baseOffset: number
): WorkspaceTextHunk[] => {
  const hunks: WorkspaceTextHunk[] = [];
  let baseIndex = baseOffset;
  let start = -1;
  let baseText = '';
  let replacementText = '';
  const flush = () => {
    if (start < 0) return;
    hunks.push({
      baseStartLine: start + 1,
      baseLineCount: baseIndex - start,
      baseText,
      replacementText,
    });
    start = -1;
    baseText = '';
    replacementText = '';
  };

  edits.forEach((edit) => {
    if (edit.kind === 'equal') {
      flush();
      baseIndex += 1;
      return;
    }
    if (start < 0) start = baseIndex;
    if (edit.kind === 'delete') {
      baseText += edit.value;
      baseIndex += 1;
    } else {
      replacementText += edit.value;
    }
  });
  flush();
  return hunks;
};

/** Produces exact line hunks, conservatively collapsing very large rewrites. */
export const diffWorkspaceText = (
  base: string,
  next: string
): WorkspaceTextHunk[] => {
  if (base === next) return [];
  const baseLines = splitLines(base);
  const nextLines = splitLines(next);
  let prefix = 0;
  while (
    prefix < baseLines.length &&
    prefix < nextLines.length &&
    baseLines[prefix] === nextLines[prefix]
  ) {
    prefix += 1;
  }
  let baseSuffix = baseLines.length;
  let nextSuffix = nextLines.length;
  while (
    baseSuffix > prefix &&
    nextSuffix > prefix &&
    baseLines[baseSuffix - 1] === nextLines[nextSuffix - 1]
  ) {
    baseSuffix -= 1;
    nextSuffix -= 1;
  }
  const baseMiddle = baseLines.slice(prefix, baseSuffix);
  const nextMiddle = nextLines.slice(prefix, nextSuffix);
  const edits = buildLcsEdits(baseMiddle, nextMiddle);
  return edits
    ? editsToHunks(edits, prefix)
    : [createSingleHunk(baseMiddle, nextMiddle, prefix)];
};

const hunkStart = (hunk: WorkspaceTextHunk): number => hunk.baseStartLine - 1;

const hunkEnd = (hunk: WorkspaceTextHunk): number =>
  hunkStart(hunk) + hunk.baseLineCount;

const hunksEqual = (
  left: WorkspaceTextHunk,
  right: WorkspaceTextHunk
): boolean =>
  left.baseStartLine === right.baseStartLine &&
  left.baseLineCount === right.baseLineCount &&
  left.baseText === right.baseText &&
  left.replacementText === right.replacementText;

const textHunksOverlap = (
  left: WorkspaceTextHunk,
  right: WorkspaceTextHunk
): boolean => {
  const leftStart = hunkStart(left);
  const leftEnd = hunkEnd(left);
  const rightStart = hunkStart(right);
  const rightEnd = hunkEnd(right);
  if (leftStart === leftEnd && rightStart === rightEnd) {
    return leftStart === rightStart;
  }
  if (leftStart === leftEnd) {
    return leftStart > rightStart && leftStart < rightEnd;
  }
  if (rightStart === rightEnd) {
    return rightStart > leftStart && rightStart < leftEnd;
  }
  return Math.max(leftStart, rightStart) < Math.min(leftEnd, rightEnd);
};

const applyTextHunks = (
  base: string,
  hunks: readonly WorkspaceTextHunk[]
): string | null => {
  const lines = splitLines(base);
  const ordered = [...hunks].sort((left, right) => {
    const startDifference = hunkStart(left) - hunkStart(right);
    if (startDifference) return startDifference;
    return left.baseLineCount - right.baseLineCount;
  });
  const output: string[] = [];
  let cursor = 0;
  for (const hunk of ordered) {
    const start = hunkStart(hunk);
    const end = hunkEnd(hunk);
    if (start < cursor || start > lines.length || end > lines.length) {
      return null;
    }
    if (lines.slice(start, end).join('') !== hunk.baseText) return null;
    output.push(...lines.slice(cursor, start), hunk.replacementText);
    cursor = end;
  }
  output.push(...lines.slice(cursor));
  return output.join('');
};

/** Performs a conservative diff3 merge over exact, base-relative line hunks. */
export const mergeWorkspaceText = (
  base: string,
  local: string,
  remote: string
): WorkspaceTextMergeResult => {
  const localHunks = diffWorkspaceText(base, local);
  const remoteHunks = diffWorkspaceText(base, remote);
  const conflicts: WorkspaceTextConflict[] = [];
  localHunks.forEach((localHunk, localIndex) => {
    remoteHunks.forEach((remoteHunk, remoteIndex) => {
      if (
        !hunksEqual(localHunk, remoteHunk) &&
        textHunksOverlap(localHunk, remoteHunk)
      ) {
        conflicts.push({
          id: `text:${localIndex}:${remoteIndex}`,
          localHunk,
          remoteHunk,
        });
      }
    });
  });
  if (conflicts.length) {
    return { ok: false, localHunks, remoteHunks, conflicts };
  }
  const mergedHunks = [
    ...remoteHunks,
    ...localHunks.filter(
      (localHunk) =>
        !remoteHunks.some((remoteHunk) => hunksEqual(localHunk, remoteHunk))
    ),
  ];
  const text = applyTextHunks(base, mergedHunks);
  if (text === null) {
    return {
      ok: false,
      localHunks,
      remoteHunks,
      conflicts: localHunks.flatMap((localHunk, localIndex) =>
        remoteHunks.map((remoteHunk, remoteIndex) => ({
          id: `text:${localIndex}:${remoteIndex}`,
          localHunk,
          remoteHunk,
        }))
      ),
    };
  }
  return { ok: true, text, localHunks, remoteHunks };
};
