import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { createExecutableProjectSnapshot } from '../executableProject';
import {
  EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_MEDIA_TYPE,
  EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST,
  decodeExecutableProjectSnapshotArtifact,
  encodeExecutableProjectSnapshotArtifact,
} from '../executableProjectSnapshotArtifact';

const snapshot = () =>
  createExecutableProjectSnapshot({
    workspace: Object.freeze({
      workspaceId: 'workspace-artifact-codec',
      snapshotId: 'snapshot-artifact-codec',
      partitionRevisions: Object.freeze({ route: '7', workspace: '11' }),
    }),
    target: Object.freeze({
      presetId: 'react-vite',
      framework: 'react',
      runtime: 'vite',
    }),
    files: Object.freeze([
      Object.freeze({
        path: 'package.json',
        contents: '{"private":true}',
      }),
      Object.freeze({
        path: 'src/main.ts',
        contents: 'export const artifactCodec = true;\n',
      }),
      Object.freeze({
        path: 'public/pixel.bin',
        contents: new Uint8Array([0, 1, 2, 253, 254, 255]),
      }),
    ]),
    dependencyPlan: Object.freeze({ manifestFilePath: 'package.json' }),
    entrypoints: Object.freeze([
      Object.freeze({ kind: 'preview' as const, path: 'src/main.ts' }),
      Object.freeze({ kind: 'build' as const, path: 'src/main.ts' }),
      Object.freeze({ kind: 'test' as const, path: 'src/main.ts' }),
    ]),
    capabilityRequirements: Object.freeze({
      preview: Object.freeze(['filesystem'] as const),
      build: Object.freeze(['build', 'filesystem'] as const),
      test: Object.freeze(['filesystem', 'test'] as const),
    }),
    publicBuildConfiguration: Object.freeze([]),
  });

describe('executable project snapshot artifact codec', () => {
  it('binds canonical artifact bytes independently from the semantic snapshot digest', () => {
    const expected = snapshot();
    const encoded = encodeExecutableProjectSnapshotArtifact(expected);
    const decoded = decodeExecutableProjectSnapshotArtifact(encoded.bytes);

    expect(decoded.snapshot).toEqual(expected);
    expect(decoded.artifactDigest).toBe(encoded.artifactDigest);
    expect(decoded.snapshot.contentDigest).toBe(encoded.semanticDigest);
    expect(encoded.artifactDigest).not.toBe(encoded.semanticDigest);
    expect(encoded.size).toBe(encoded.bytes.byteLength);
    expect(encoded.mediaType).toBe(
      EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_MEDIA_TYPE
    );
    expect(encoded.codec.schemaDigest).toBe(
      EXECUTABLE_PROJECT_SNAPSHOT_ARTIFACT_SCHEMA_DIGEST
    );
    expect(encodeExecutableProjectSnapshotArtifact(expected).bytes).toEqual(
      encoded.bytes
    );
  });

  it('rejects non-canonical bytes and semantic payload tampering', () => {
    const encoded = encodeExecutableProjectSnapshotArtifact(snapshot());
    const text = new TextDecoder().decode(encoded.bytes);
    expect(() => decodeExecutableProjectSnapshotArtifact(`${text}\n`)).toThrow(
      /canonical JSON/u
    );

    const tampered = JSON.parse(text) as {
      snapshot: {
        files: Array<{ path: string; encoding: string; contents: string }>;
      };
    };
    tampered.snapshot.files.find(
      ({ path }) => path === 'src/main.ts'
    )!.contents = 'export const artifactCodec = false;\n';
    expect(() =>
      decodeExecutableProjectSnapshotArtifact(canonicalJsonText(tampered))
    ).toThrow(/semantic content digest drifted/u);
  });
});
