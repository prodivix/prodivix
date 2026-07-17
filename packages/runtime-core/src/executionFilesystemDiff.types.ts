import type {
  ExecutionSourceTrace,
  ExecutionWorkspaceSnapshotRef,
} from './execution.types';

export const EXECUTION_FILESYSTEM_DIFF_FORMAT =
  'prodivix.execution-filesystem-diff.v1' as const;

export const EXECUTION_FILESYSTEM_DIFF_MEDIA_TYPE =
  'application/vnd.prodivix.execution-filesystem-diff+json' as const;

export const EXECUTION_FILESYSTEM_DIFF_LIMITS = Object.freeze({
  maxChanges: 512,
  maxFileBytes: 1024 * 1024,
  maxTotalContentBytes: 8 * 1024 * 1024,
  maxPayloadBytes: 16 * 1024 * 1024,
  maxPathLength: 1024,
  maxSourceTracesPerChange: 256,
  maxPartitionRevisions: 40_000,
  maxStringLength: 4096,
});

export type ExecutionFilesystemDiffChangeKind =
  'added' | 'modified' | 'deleted';

export type ExecutionFilesystemDiffContent = Readonly<{
  size: number;
  digest: string;
  contents: Uint8Array;
}>;

export type ExecutionFilesystemDiffChange = Readonly<{
  changeId: string;
  kind: ExecutionFilesystemDiffChangeKind;
  path: string;
  baseline?: ExecutionFilesystemDiffContent;
  runtime?: ExecutionFilesystemDiffContent;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

/** Runtime filesystem observations are execution artifacts and never canonical authoring state. */
export type ExecutionFilesystemDiff = Readonly<{
  format: typeof EXECUTION_FILESYSTEM_DIFF_FORMAT;
  snapshotDigest: string;
  workspace: ExecutionWorkspaceSnapshotRef;
  capturedAt: number;
  complete: boolean;
  changes: readonly ExecutionFilesystemDiffChange[];
}>;

export type ExecutionFilesystemDiffContentInput = Readonly<{
  contents: Uint8Array;
}>;

export type ExecutionFilesystemDiffChangeInput = Readonly<{
  kind: ExecutionFilesystemDiffChangeKind;
  path: string;
  baseline?: ExecutionFilesystemDiffContentInput;
  runtime?: ExecutionFilesystemDiffContentInput;
  sourceTrace?: readonly ExecutionSourceTrace[];
}>;

export type ExecutionFilesystemDiffInput = Readonly<{
  snapshotDigest: string;
  workspace: ExecutionWorkspaceSnapshotRef;
  capturedAt: number;
  complete: boolean;
  changes: readonly ExecutionFilesystemDiffChangeInput[];
}>;
