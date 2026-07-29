import { EXECUTABLE_PROJECT_LIMITS } from '@prodivix/runtime-core';
import { describe, expect, it } from 'vitest';
import {
  decodeVerificationTrace,
  encodeVerificationTrace,
} from './verificationTraceProjection';

const sourceTraces = (count: number) =>
  Object.freeze(
    Array.from({ length: count }, (_, index) =>
      Object.freeze({
        sourceRef: Object.freeze({
          kind: 'workspace' as const,
          workspaceId: 'workspace-verification-trace',
        }),
        label: `Compiler source ${String(index + 1)}`,
      })
    )
  );

const input = (count: number) =>
  Object.freeze({
    traceKind: 'diagnostics' as const,
    subjectDigest:
      'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    entries: Object.freeze([
      Object.freeze({
        path: 'src/App.tsx',
        sourceTrace: sourceTraces(count),
      }),
    ]),
  });

describe('verification trace SourceTrace boundary', () => {
  it('accepts a real Compiler-sized trace above the network trace budget', () => {
    const encoded = encodeVerificationTrace(input(20));
    expect(
      decodeVerificationTrace(encoded).entries[0]?.sourceTrace
    ).toHaveLength(20);
  });

  it('rejects a trace above the Executable Project owner budget', () => {
    expect(() =>
      encodeVerificationTrace(
        input(EXECUTABLE_PROJECT_LIMITS.maxSourceTracesPerFile + 1)
      )
    ).toThrow(/non-empty bounded SourceTrace/u);
  });

  it('preserves a namespaced Workspace pointer for navigation', () => {
    const value = input(1);
    const sourceTrace = Object.freeze([
      Object.freeze({
        sourceRef: Object.freeze({
          kind: 'route' as const,
          routeId: 'route-catalog',
        }),
        label: 'route:/routeManifest/runtime/route-catalog/loader',
      }),
    ]);
    const encoded = encodeVerificationTrace({
      ...value,
      entries: Object.freeze([
        Object.freeze({
          ...value.entries[0]!,
          sourceTrace,
        }),
      ]),
    });

    expect(decodeVerificationTrace(encoded).entries[0]?.sourceTrace).toEqual(
      sourceTrace
    );
  });

  it.each([
    'C:\\temp\\run-17\\src\\catalog.test.ts',
    '/tmp/run-99/src/catalog.test.ts',
    'https://private.example.test/run-17/catalog.test.ts',
  ])('rejects an unnamespaced private label: %s', (label) => {
    const value = input(1);
    expect(() =>
      encodeVerificationTrace({
        ...value,
        entries: Object.freeze([
          Object.freeze({
            ...value.entries[0]!,
            sourceTrace: Object.freeze([
              Object.freeze({
                sourceRef: Object.freeze({
                  kind: 'workspace' as const,
                  workspaceId: 'workspace-verification-trace',
                }),
                label,
              }),
            ]),
          }),
        ]),
      })
    ).toThrow(/contains an absolute path or URL/u);
  });
});
