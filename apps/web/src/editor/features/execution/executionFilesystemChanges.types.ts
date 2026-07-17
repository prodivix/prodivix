import type { ExecutionFilesystemDiff } from '@prodivix/runtime-core';

export type ExecutionFilesystemArtifactReference = Readonly<{
  executionId: string;
  artifactId: string;
  snapshotDigest: string;
  workspaceSnapshotId: string;
  resolve(): Promise<ExecutionFilesystemDiff>;
}>;
