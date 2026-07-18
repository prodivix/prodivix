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
  createRemoteServerFunctionFixtureSnapshot,
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
    expect(wire.serverRuntimeMockProvision).toEqual(
      snapshot.serverRuntimeMockProvision
    );
    const serverFunctionSnapshot = createRemoteServerFunctionFixtureSnapshot();
    const serverFunctionWire = encodeRemoteExecutableProjectSnapshot(
      serverFunctionSnapshot
    );
    expect(serverFunctionWire.serverFunctionPlan).toEqual(
      serverFunctionSnapshot.serverFunctionPlan
    );
    expect(decodeRemoteExecutableProjectSnapshot(serverFunctionWire)).toEqual(
      serverFunctionSnapshot
    );
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

  it('round-trips binary asset bytes without UTF-8 coercion', () => {
    const contents = new Uint8Array([0, 255, 128, 1, 2, 3]);
    const snapshot = createRemoteFixtureSnapshot(
      'export const value = 1;',
      ['filesystem'],
      contents
    );
    const wire = encodeRemoteExecutableProjectSnapshot(snapshot);
    const encoded = wire.files.find(
      ({ path }) => path === 'public/fixture.bin'
    )?.contents;

    expect(encoded).toEqual({ encoding: 'bytes', value: [...contents] });
    expect(
      decodeRemoteExecutableProjectSnapshot(wire).files.find(
        ({ path }) => path === 'public/fixture.bin'
      )?.contents
    ).toEqual(contents);
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
