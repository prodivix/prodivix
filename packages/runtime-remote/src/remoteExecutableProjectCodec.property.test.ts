import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  decodeRemoteExecutableProjectSnapshot,
  encodeRemoteExecutableProjectSnapshot,
} from './remoteExecutableProjectCodec';
import {
  createRemoteExecutionRequestEnvelope,
  decodeRemoteExecutionRequestEnvelope,
} from './remoteExecutionProtocolCodec';
import {
  createRemoteFixtureRequest,
  createRemoteFixtureSnapshot,
} from './__tests__/remoteExecutionFixtures';

describe('remote execution codec properties', () => {
  it('round-trips the neutral snapshot and verifies its digest', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2_000 }), (source) => {
        const snapshot = createRemoteFixtureSnapshot(source);
        const wire = encodeRemoteExecutableProjectSnapshot(snapshot);
        expect(decodeRemoteExecutableProjectSnapshot(wire)).toEqual(snapshot);
      })
    );
    const snapshot = createRemoteFixtureSnapshot();
    const wire = encodeRemoteExecutableProjectSnapshot(snapshot);
    expect(wire.dataMockProvision).toEqual(snapshot.dataMockProvision);
    expect(() =>
      decodeRemoteExecutableProjectSnapshot({
        ...wire,
        contentDigest: `sha256-${'0'.repeat(64)}`,
      })
    ).toThrow(/digest does not match/u);
    expect(() =>
      decodeRemoteExecutableProjectSnapshot({
        ...wire,
        contentDigest: 'sha256-not-a-digest',
      })
    ).toThrow(/canonical SHA-256 digest/u);
    expect(() =>
      decodeRemoteExecutableProjectSnapshot({
        ...wire,
        format: 'prodivix.executable-project.v3',
      })
    ).toThrow(/format is unsupported/u);
  });

  it('rejects unknown snapshot and nested source-trace fields', () => {
    const wire = encodeRemoteExecutableProjectSnapshot(
      createRemoteFixtureSnapshot()
    );
    expect(() =>
      decodeRemoteExecutableProjectSnapshot({ ...wire, secret: 'material' })
    ).toThrow(/unsupported field: secret/u);
    expect(() =>
      decodeRemoteExecutableProjectSnapshot({
        ...wire,
        files: wire.files.map((file) =>
          file.path === 'src/main.ts'
            ? {
                ...file,
                sourceTrace: file.sourceTrace?.map((trace) => ({
                  ...trace,
                  sourceRef: { ...trace.sourceRef, unknown: true },
                })),
              }
            : file
        ),
      })
    ).toThrow(/unsupported field: unknown/u);
  });

  it('strictly decodes versioned request envelopes', () => {
    const envelope = createRemoteExecutionRequestEnvelope(
      1,
      'message-1',
      'create',
      {
        request: createRemoteFixtureRequest(),
        snapshot: {
          kind: 'upload',
          snapshot: encodeRemoteExecutableProjectSnapshot(
            createRemoteFixtureSnapshot()
          ),
        },
      }
    );
    expect(
      decodeRemoteExecutionRequestEnvelope(envelope).request.operation
    ).toBe('create');
    expect(() =>
      decodeRemoteExecutionRequestEnvelope({ ...envelope, stack: 'private' })
    ).toThrow(/unsupported field: stack/u);
  });
});
