import type {
  WorkspaceMergeConflict,
  WorkspaceSemanticChange,
  WorkspaceTextHunk,
} from '@prodivix/workspace-sync';
import type {
  CodeDiffLineKind,
  CodeDiffSidePresentation,
  CodeDocumentDiffHunkPresentation,
} from './revisionConflictPresentation';
import type {
  CodeDocumentRevisionDiffPresentation,
  WorkspaceThreeWayPresentationInput,
} from './revisionConflictAdapterTypes';
import { uniqueSorted } from './revisionConflictAdapterUtils';

type DocumentTextChanges = {
  conflictIds: Set<string>;
  conflicts: WorkspaceMergeConflict[];
  language: string;
  localHunks: WorkspaceTextHunk[];
  remoteHunks: WorkspaceTextHunk[];
};

type HunkPair = {
  baseLineCount: number;
  baseStartLine: number;
  baseText: string;
  local?: WorkspaceTextHunk;
  remote?: WorkspaceTextHunk;
};

type SortableHunkPresentation = {
  baseStartLine: number;
  presentation: CodeDocumentDiffHunkPresentation;
};

const splitDisplayLines = (source: string): string[] =>
  (source.match(/[^\r\n]*(?:\r\n|\r|\n)|[^\r\n]+$/g) ?? []).map((line) =>
    line.replace(/(?:\r\n|\r|\n)$/, '')
  );

const createSide = (
  source: string,
  startLine: number,
  kind: CodeDiffLineKind
): CodeDiffSidePresentation => ({
  lines: splitDisplayLines(source).map((content, index) => ({
    content,
    kind,
    lineNumber: startLine + index,
  })),
  startLine,
});

const hunkSignature = (hunk: WorkspaceTextHunk): string =>
  JSON.stringify([
    hunk.baseStartLine,
    hunk.baseLineCount,
    hunk.baseText,
    hunk.replacementText,
  ]);

const hunkBaseIdentity = (hunk: WorkspaceTextHunk): string =>
  JSON.stringify([hunk.baseStartLine, hunk.baseLineCount, hunk.baseText]);

const replacementLineCount = (hunk: WorkspaceTextHunk | undefined): number =>
  hunk ? splitDisplayLines(hunk.replacementText).length : 0;

const createHeader = (
  startLine: number,
  baseLineCount: number,
  localLineCount: number,
  remoteLineCount: number
): string =>
  `@@ -${startLine},${baseLineCount} · LOCAL +${startLine},${localLineCount} · REMOTE +${startLine},${remoteLineCount} @@`;

const createCleanPresentation = (
  documentId: string,
  pair: HunkPair,
  index: number
): SortableHunkPresentation => {
  const localSource = pair.local?.replacementText ?? pair.baseText;
  const remoteSource = pair.remote?.replacementText ?? pair.baseText;
  return {
    baseStartLine: pair.baseStartLine,
    presentation: {
      base: createSide(pair.baseText, pair.baseStartLine, 'deleted'),
      header: createHeader(
        pair.baseStartLine,
        pair.baseLineCount,
        pair.local ? replacementLineCount(pair.local) : pair.baseLineCount,
        pair.remote ? replacementLineCount(pair.remote) : pair.baseLineCount
      ),
      id: `code:${documentId}:${pair.baseStartLine}:${index}`,
      isConflict: false,
      local: createSide(
        localSource,
        pair.baseStartLine,
        pair.local ? 'added' : 'context'
      ),
      remote: createSide(
        remoteSource,
        pair.baseStartLine,
        pair.remote ? 'added' : 'context'
      ),
    },
  };
};

const collectCodeHunks = (
  changes: readonly WorkspaceSemanticChange[],
  side: 'localHunks' | 'remoteHunks',
  byDocumentId: Map<string, DocumentTextChanges>
) => {
  changes.forEach((change) => {
    if (
      change.target.kind !== 'document' ||
      change.semantic.kind !== 'code-source'
    ) {
      return;
    }
    const current = byDocumentId.get(change.target.documentId) ?? {
      conflictIds: new Set<string>(),
      conflicts: [],
      language: change.semantic.language,
      localHunks: [],
      remoteHunks: [],
    };
    current.language = change.semantic.language;
    current[side].push(...change.semantic.hunks);
    byDocumentId.set(change.target.documentId, current);
  });
};

const collectCodeConflicts = (
  conflicts: readonly WorkspaceMergeConflict[],
  byDocumentId: Map<string, DocumentTextChanges>
) => {
  conflicts.forEach((conflict) => {
    if (
      conflict.target.kind !== 'document' ||
      conflict.semantic.kind !== 'code-source'
    ) {
      return;
    }
    const current = byDocumentId.get(conflict.target.documentId) ?? {
      conflictIds: new Set<string>(),
      conflicts: [],
      language: conflict.semantic.language,
      localHunks: [],
      remoteHunks: [],
    };
    current.conflictIds.add(conflict.id);
    current.conflicts.push(conflict);
    byDocumentId.set(conflict.target.documentId, current);
  });
};

const pairCleanHunks = (
  changes: DocumentTextChanges,
  conflictedSignatures: ReadonlySet<string>
): HunkPair[] => {
  const pairs = new Map<string, HunkPair>();
  const add = (hunk: WorkspaceTextHunk, side: 'local' | 'remote') => {
    if (conflictedSignatures.has(hunkSignature(hunk))) return;
    const key = hunkBaseIdentity(hunk);
    const pair = pairs.get(key) ?? {
      baseLineCount: hunk.baseLineCount,
      baseStartLine: hunk.baseStartLine,
      baseText: hunk.baseText,
    };
    pair[side] = hunk;
    pairs.set(key, pair);
  };
  changes.localHunks.forEach((hunk) => add(hunk, 'local'));
  changes.remoteHunks.forEach((hunk) => add(hunk, 'remote'));
  return [...pairs.values()].sort(
    (left, right) => left.baseStartLine - right.baseStartLine
  );
};

const createConflictPresentations = (
  conflict: WorkspaceMergeConflict,
  resolution: 'local' | 'remote' | undefined
): SortableHunkPresentation[] =>
  (conflict.textConflicts ?? []).map((textConflict) => {
    const startLine = Math.min(
      textConflict.localHunk.baseStartLine,
      textConflict.remoteHunk.baseStartLine
    );
    const baseHunk =
      textConflict.localHunk.baseStartLine <=
      textConflict.remoteHunk.baseStartLine
        ? textConflict.localHunk
        : textConflict.remoteHunk;
    return {
      baseStartLine: startLine,
      presentation: {
        base: createSide(baseHunk.baseText, baseHunk.baseStartLine, 'deleted'),
        header: createHeader(
          startLine,
          Math.max(
            textConflict.localHunk.baseLineCount,
            textConflict.remoteHunk.baseLineCount
          ),
          replacementLineCount(textConflict.localHunk),
          replacementLineCount(textConflict.remoteHunk)
        ),
        id: `${conflict.id}#${textConflict.id}`,
        isConflict: true,
        local: createSide(
          textConflict.localHunk.replacementText,
          textConflict.localHunk.baseStartLine,
          'added'
        ),
        remote: createSide(
          textConflict.remoteHunk.replacementText,
          textConflict.remoteHunk.baseStartLine,
          'added'
        ),
        resolution,
        resolutionTargetId: conflict.id,
      },
    };
  });

const resolveDocumentPath = (
  documentId: string,
  input: WorkspaceThreeWayPresentationInput
): string =>
  input.localSnapshot?.docsById[documentId]?.path ??
  input.remoteSnapshot?.docsById[documentId]?.path ??
  input.baseSnapshot?.docsById[documentId]?.path ??
  input.analysis.candidateSnapshot.docsById[documentId]?.path ??
  documentId;

/** Projects Diff Core text hunks into display lines without recalculating text diffs. */
export const adaptCodeDocumentDiffs = (
  input: WorkspaceThreeWayPresentationInput
): CodeDocumentRevisionDiffPresentation[] => {
  const byDocumentId = new Map<string, DocumentTextChanges>();
  collectCodeHunks(
    input.analysis.localChanges.changes,
    'localHunks',
    byDocumentId
  );
  collectCodeHunks(
    input.analysis.remoteChanges.changes,
    'remoteHunks',
    byDocumentId
  );
  collectCodeConflicts(input.analysis.conflicts, byDocumentId);

  return [...byDocumentId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([documentId, changes]) => {
      const conflictedSignatures = new Set<string>();
      changes.conflicts.forEach((conflict) =>
        conflict.textConflicts?.forEach((textConflict) => {
          conflictedSignatures.add(hunkSignature(textConflict.localHunk));
          conflictedSignatures.add(hunkSignature(textConflict.remoteHunk));
        })
      );
      const clean = pairCleanHunks(changes, conflictedSignatures).map(
        (pair, index) => createCleanPresentation(documentId, pair, index)
      );
      const conflicted = changes.conflicts.flatMap((conflict) =>
        createConflictPresentations(conflict, input.resolutions?.[conflict.id])
      );
      const hunks = [...clean, ...conflicted]
        .sort((left, right) => {
          const position = left.baseStartLine - right.baseStartLine;
          return (
            position ||
            left.presentation.id.localeCompare(right.presentation.id)
          );
        })
        .map(({ presentation }) => presentation);
      return {
        conflictIds: uniqueSorted(changes.conflictIds),
        documentId,
        documentPath: resolveDocumentPath(documentId, input),
        hunks,
        language: changes.language,
      };
    });
};
