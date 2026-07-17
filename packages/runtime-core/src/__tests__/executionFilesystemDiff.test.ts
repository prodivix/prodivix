import { describe, expect, it } from 'vitest';
import {
  createExecutionFilesystemDiff,
  decodeExecutionFilesystemDiff,
  encodeExecutionFilesystemDiff,
  EXECUTION_FILESYSTEM_DIFF_FORMAT,
} from '..';

const digest = `sha256-${'a'.repeat(64)}`;
const workspace = Object.freeze({
  workspaceId: 'workspace-1',
  snapshotId: 'snapshot-1',
  partitionRevisions: Object.freeze({
    'document:code-1:content': 'revision-content-1',
    'document:code-1:meta': 'revision-meta-1',
  }),
});

describe('ExecutionFilesystemDiff', () => {
  it('round-trips a canonical bounded diff with stable change identities', () => {
    const diff = createExecutionFilesystemDiff({
      snapshotDigest: digest,
      workspace,
      capturedAt: 42,
      complete: true,
      changes: [
        {
          kind: 'modified',
          path: 'src/main.ts',
          baseline: {
            contents: new TextEncoder().encode('export const value = 1;'),
          },
          runtime: {
            contents: new TextEncoder().encode('export const value = 2;'),
          },
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-1' } },
          ],
        },
      ],
    });

    const decoded = decodeExecutionFilesystemDiff(
      encodeExecutionFilesystemDiff(diff)
    );

    expect(decoded).toEqual(diff);
    expect(decoded.format).toBe(EXECUTION_FILESYSTEM_DIFF_FORMAT);
    expect(decoded.changes[0]?.changeId).toMatch(
      /^filesystem-change:[a-f0-9]{64}$/u
    );
    expect(Object.isFrozen(decoded.changes)).toBe(true);
  });

  it('rejects forged content facts and non-canonical ordering', () => {
    const diff = createExecutionFilesystemDiff({
      snapshotDigest: digest,
      workspace,
      capturedAt: 42,
      complete: true,
      changes: [
        {
          kind: 'added',
          path: 'a.ts',
          runtime: { contents: new Uint8Array([1]) },
        },
        {
          kind: 'deleted',
          path: 'b.ts',
          baseline: { contents: new Uint8Array([2]) },
        },
      ],
    });
    const wire = JSON.parse(
      new TextDecoder().decode(encodeExecutionFilesystemDiff(diff))
    );
    wire.changes[0].runtime.size = 2;
    expect(() => decodeExecutionFilesystemDiff(JSON.stringify(wire))).toThrow(
      /size/u
    );

    wire.changes[0].runtime.size = 1;
    wire.changes.reverse();
    expect(() => decodeExecutionFilesystemDiff(JSON.stringify(wire))).toThrow(
      /sorted/u
    );
  });

  it('rejects unchanged modified files and unsupported fields', () => {
    expect(() =>
      createExecutionFilesystemDiff({
        snapshotDigest: digest,
        workspace,
        capturedAt: 42,
        complete: true,
        changes: [
          {
            kind: 'modified',
            path: 'src/main.ts',
            baseline: { contents: new Uint8Array([1]) },
            runtime: { contents: new Uint8Array([1]) },
          },
        ],
      })
    ).toThrow(/change kind/u);

    const wire = JSON.parse(
      new TextDecoder().decode(
        encodeExecutionFilesystemDiff(
          createExecutionFilesystemDiff({
            snapshotDigest: digest,
            workspace,
            capturedAt: 42,
            complete: true,
            changes: [],
          })
        )
      )
    );
    wire.unknown = true;
    expect(() => decodeExecutionFilesystemDiff(JSON.stringify(wire))).toThrow(
      /unsupported field/u
    );
  });
});
